import "server-only";
import type { GatewayResult, PaymentAdapter } from "./types";
import { chargeAmount, env, fetchJson, gatewayError, hasEnv, hmacHex, matchesHex } from "./util";

/**
 * STRIPE CHECKOUT — cards, Apple Pay, Google Pay, many local methods.
 * env: STRIPE_SECRET_KEY (sk_live_… / sk_test_…), STRIPE_WEBHOOK_SECRET (whsec_…),
 *      optional STRIPE_CURRENCY, STRIPE_EXCHANGE_RATE
 * Webhook URL: https://YOUR-DOMAIN/api/payments/webhook/stripe
 *   events: checkout.session.completed, checkout.session.async_payment_succeeded,
 *           checkout.session.async_payment_failed, checkout.session.expired
 */
const ZERO_DECIMAL = new Set(["BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"]);

const stripe = (path: string, init: RequestInit = {}) =>
  fetchJson(`https://api.stripe.com/v1${path}`, { ...init, headers: { Authorization: `Bearer ${env("STRIPE_SECRET_KEY")}`, "Content-Type": "application/x-www-form-urlencoded", ...(init.headers ?? {}) } }, "Stripe");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sessionResult(s: any): GatewayResult {
  const currency = String(s.currency ?? "").toUpperCase();
  const amount = s.amount_total != null ? (ZERO_DECIMAL.has(currency) ? Number(s.amount_total) : Number(s.amount_total) / 100) : undefined;
  const paid = s.payment_status === "paid" || s.payment_status === "no_payment_required";
  return {
    reference: s.client_reference_id ?? s.metadata?.reference,
    providerReference: s.id,
    status: paid ? "paid" : s.status === "expired" ? "cancelled" : "pending",
    verified: true,
    amount,
    currency,
    note: typeof s.payment_intent === "string" ? `PaymentIntent ${s.payment_intent}` : undefined,
  };
}

export const stripeAdapter: PaymentAdapter = {
  code: "stripe",
  label: "Stripe Checkout",
  kind: "gateway",
  envKeys: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
  isConfigured: () => hasEnv("STRIPE_SECRET_KEY"),

  async createDeposit(ctx) {
    const c = chargeAmount("STRIPE", ctx.amount, ctx.currency);
    const unit = ZERO_DECIMAL.has(c.currency) ? Math.round(c.cents / 100) : c.cents;
    const params = new URLSearchParams({
      mode: "payment",
      client_reference_id: ctx.reference,
      customer_email: ctx.customer.email,
      success_url: `${ctx.urls.success}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: ctx.urls.cancel,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": c.currency.toLowerCase(),
      "line_items[0][price_data][unit_amount]": String(unit),
      "line_items[0][price_data][product_data][name]": `Wallet deposit ${ctx.reference}`,
      "metadata[reference]": ctx.reference,
      "metadata[user_id]": ctx.userId,
      "payment_intent_data[metadata][reference]": ctx.reference,
    });
    const r = await stripe("/checkout/sessions", { method: "POST", body: params.toString(), headers: { "Idempotency-Key": `dep-${ctx.depositId}` } });
    if (!r.ok || !r.data.url) throw gatewayError(r.data?.error?.message ?? "Stripe checkout could not be created.");
    return { status: "pending", redirectUrl: r.data.url, providerReference: r.data.id, charge: { amount: c.value, currency: c.currency } };
  },

  async handleReturn(req) {
    const id = new URL(req.url).searchParams.get("session_id");
    if (!id || !/^cs_[A-Za-z0-9_]+$/.test(id)) return null;
    const r = await stripe(`/checkout/sessions/${id}`);
    if (!r.ok) return null;
    return sessionResult(r.data);
  },

  async handleWebhook(req) {
    const secret = env("STRIPE_WEBHOOK_SECRET");
    if (!secret) throw gatewayError("STRIPE_WEBHOOK_SECRET is not configured.", 503);
    const raw = await req.text();
    const header = req.headers.get("stripe-signature") ?? "";
    const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
    const t = parts.t;
    const signatures = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
    const expected = hmacHex("sha256", secret, `${t}.${raw}`);
    if (!t || !signatures.some((s) => matchesHex(expected, s))) throw gatewayError("Invalid Stripe signature.", 400);
    if (Math.abs(Date.now() / 1000 - Number(t)) > 300) throw gatewayError("Stale Stripe webhook.", 400);
    const event = JSON.parse(raw) as { type: string; data: { object: unknown } };
    const obj = event.data?.object;
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        return sessionResult(obj);
      case "checkout.session.async_payment_failed":
        return { ...sessionResult(obj), status: "failed" };
      case "checkout.session.expired":
        return { ...sessionResult(obj), status: "cancelled" };
      default:
        return null;
    }
  },
};
