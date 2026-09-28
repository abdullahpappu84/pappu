import "server-only";
import type { GatewayResult, PaymentAdapter } from "./types";
import { chargeAmount, env, envBool, fetchJson, gatewayError, hasEnv, hmacHex, matchesHex } from "./util";

/**
 * NOWPAYMENTS — crypto (BTC, ETH, USDT, LTC, 300+ coins) via hosted invoice.
 * env: NOWPAYMENTS_API_KEY, NOWPAYMENTS_IPN_SECRET, optional NOWPAYMENTS_SANDBOX, NOWPAYMENTS_CURRENCY,
 *      NOWPAYMENTS_EXCHANGE_RATE, NOWPAYMENTS_BASE_URL
 * IPN URL is sent automatically: https://YOUR-DOMAIN/api/payments/webhook/nowpayments
 */
const base = () => env("NOWPAYMENTS_BASE_URL") ?? (envBool("NOWPAYMENTS_SANDBOX") ? "https://api-sandbox.nowpayments.io/v1" : "https://api.nowpayments.io/v1");

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]));
  return v;
}

export const nowpaymentsAdapter: PaymentAdapter = {
  code: "nowpayments",
  label: "NOWPayments (Crypto)",
  kind: "gateway",
  envKeys: ["NOWPAYMENTS_API_KEY", "NOWPAYMENTS_IPN_SECRET"],
  isConfigured: () => hasEnv("NOWPAYMENTS_API_KEY", "NOWPAYMENTS_IPN_SECRET"),

  async createDeposit(ctx) {
    const c = chargeAmount("NOWPAYMENTS", ctx.amount, ctx.currency);
    const r = await fetchJson(
      `${base()}/invoice`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": env("NOWPAYMENTS_API_KEY")! },
        body: JSON.stringify({
          price_amount: Number(c.value),
          price_currency: c.currency.toLowerCase(),
          order_id: ctx.reference,
          order_description: `Wallet deposit ${ctx.reference}`,
          ipn_callback_url: ctx.urls.webhook,
          success_url: ctx.urls.success,
          cancel_url: ctx.urls.cancel,
        }),
      },
      "NOWPayments",
    );
    if (!r.data?.invoice_url) throw gatewayError(r.data?.message || "Crypto invoice could not be created.");
    return { status: "pending", redirectUrl: r.data.invoice_url, providerReference: String(r.data.id), charge: { amount: c.value, currency: c.currency } };
  },

  async handleWebhook(req) {
    const raw = await req.text();
    const expected = hmacHex("sha512", env("NOWPAYMENTS_IPN_SECRET")!, JSON.stringify(sortKeys(JSON.parse(raw || "{}"))));
    if (!matchesHex(expected, req.headers.get("x-nowpayments-sig"))) throw gatewayError("Invalid NOWPayments signature.", 400);
    const d = JSON.parse(raw) as Record<string, string | number>;
    const s = String(d.payment_status);
    const status: GatewayResult["status"] = s === "finished" ? "paid" : ["failed", "refunded"].includes(s) ? "failed" : s === "expired" ? "cancelled" : "pending";
    return {
      reference: String(d.order_id ?? ""),
      providerReference: String(d.invoice_id ?? d.payment_id ?? ""),
      status,
      verified: true,
      amount: Number(d.price_amount),
      currency: String(d.price_currency ?? "").toUpperCase(),
      note: `${d.pay_amount ?? ""} ${String(d.pay_currency ?? "").toUpperCase()} · payment ${d.payment_id} · ${s}`,
    };
  },
};
