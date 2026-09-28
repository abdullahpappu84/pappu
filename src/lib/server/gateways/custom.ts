import "server-only";
import type { GatewayResult, PaymentAdapter } from "./types";
import { chargeAmount, env, fetchJson, gatewayError, hasEnv, hmacHex, matchesHex } from "./util";

/**
 * CUSTOM / GENERIC HOSTED GATEWAY — connect any gateway (aamarPay, Nagad middleware, PayPal bridge,
 * local PSPs…) that can: (1) create a checkout from a JSON POST and (2) send a signed webhook.
 *
 * env: CUSTOM_GATEWAY_NAME, CUSTOM_GATEWAY_CREATE_URL, CUSTOM_GATEWAY_API_KEY, CUSTOM_GATEWAY_WEBHOOK_SECRET,
 *      optional CUSTOM_GATEWAY_SIGNATURE_HEADER (default x-signature), CUSTOM_GATEWAY_CURRENCY, CUSTOM_GATEWAY_EXCHANGE_RATE
 *
 * Create request  → POST CREATE_URL  (Authorization: Bearer API_KEY, X-Signature: HMAC-SHA256(body))
 *   { reference, amount, currency, description, customer{id,name,email,phone}, successUrl, cancelUrl, webhookUrl }
 * Expected reply  → { url | payment_url | checkout_url | redirect_url, id }
 * Webhook         → POST https://YOUR-DOMAIN/api/payments/webhook/custom
 *   header x-signature = hex(HMAC_SHA256(rawBody, WEBHOOK_SECRET))
 *   { reference, status: "paid"|"failed"|"cancelled", amount, currency, id }
 */
const PAID = ["paid", "success", "succeeded", "completed", "complete", "approved", "captured"];
const FAILED = ["failed", "declined", "error", "rejected"];
const CANCELLED = ["cancelled", "canceled", "expired", "voided"];

export const customAdapter: PaymentAdapter = {
  code: "custom",
  label: "Custom gateway",
  kind: "gateway",
  envKeys: ["CUSTOM_GATEWAY_CREATE_URL", "CUSTOM_GATEWAY_API_KEY", "CUSTOM_GATEWAY_WEBHOOK_SECRET"],
  isConfigured: () => hasEnv("CUSTOM_GATEWAY_CREATE_URL", "CUSTOM_GATEWAY_API_KEY", "CUSTOM_GATEWAY_WEBHOOK_SECRET"),

  async createDeposit(ctx) {
    const c = chargeAmount("CUSTOM_GATEWAY", ctx.amount, ctx.currency);
    const body = JSON.stringify({
      reference: ctx.reference,
      amount: c.value,
      currency: c.currency,
      description: `Wallet deposit ${ctx.reference}`,
      customer: { id: ctx.userId, name: ctx.customer.name, email: ctx.customer.email, phone: ctx.customer.phone },
      successUrl: ctx.urls.success,
      cancelUrl: ctx.urls.cancel,
      webhookUrl: ctx.urls.webhook,
    });
    const r = await fetchJson(
      env("CUSTOM_GATEWAY_CREATE_URL")!,
      { method: "POST", body, headers: { "Content-Type": "application/json", Authorization: `Bearer ${env("CUSTOM_GATEWAY_API_KEY")}`, "X-Signature": hmacHex("sha256", env("CUSTOM_GATEWAY_WEBHOOK_SECRET")!, body) } },
      env("CUSTOM_GATEWAY_NAME") ?? "Payment gateway",
    );
    const d = r.data ?? {};
    const url = d.url ?? d.payment_url ?? d.checkout_url ?? d.redirect_url ?? d.data?.url ?? d.data?.payment_url;
    if (!r.ok || !url) throw gatewayError(d.message || d.error || "Payment could not be started.");
    return { status: "pending", redirectUrl: url, providerReference: d.id ? String(d.id) : d.data?.id ? String(d.data.id) : undefined, charge: { amount: c.value, currency: c.currency } };
  },

  async handleWebhook(req) {
    const raw = await req.text();
    const header = (env("CUSTOM_GATEWAY_SIGNATURE_HEADER") ?? "x-signature").toLowerCase();
    if (!matchesHex(hmacHex("sha256", env("CUSTOM_GATEWAY_WEBHOOK_SECRET")!, raw), req.headers.get(header))) throw gatewayError("Invalid webhook signature.", 400);
    const d = JSON.parse(raw || "{}") as Record<string, unknown>;
    const s = String(d.status ?? "").toLowerCase();
    const status: GatewayResult["status"] = PAID.includes(s) ? "paid" : FAILED.includes(s) ? "failed" : CANCELLED.includes(s) ? "cancelled" : "pending";
    return {
      reference: d.reference ? String(d.reference) : undefined,
      providerReference: d.id ? String(d.id) : d.transactionId ? String(d.transactionId) : undefined,
      status,
      verified: true,
      amount: d.amount != null ? Number(d.amount) : undefined,
      currency: d.currency ? String(d.currency).toUpperCase() : undefined,
    };
  },
};
