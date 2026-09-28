import "server-only";
import type { GatewayResult, PaymentAdapter } from "./types";
import { chargeAmount, env, envBool, fetchJson, gatewayError, hasEnv, readParams } from "./util";

/**
 * SSLCOMMERZ (Bangladesh) — cards, bKash, Nagad, Rocket, internet banking.
 * env: SSLCOMMERZ_STORE_ID, SSLCOMMERZ_STORE_PASSWORD, SSLCOMMERZ_SANDBOX=true|false,
 *      optional SSLCOMMERZ_CURRENCY (default BDT), SSLCOMMERZ_EXCHANGE_RATE, SSLCOMMERZ_BASE_URL
 * IPN URL is sent automatically: https://YOUR-DOMAIN/api/payments/webhook/sslcommerz
 * Every result is confirmed with the SSLCommerz Validation API before crediting.
 */
const base = () => env("SSLCOMMERZ_BASE_URL") ?? (envBool("SSLCOMMERZ_SANDBOX", true) ? "https://sandbox.sslcommerz.com" : "https://securepay.sslcommerz.com");

async function validate(valId: string): Promise<GatewayResult> {
  const q = new URLSearchParams({ val_id: valId, store_id: env("SSLCOMMERZ_STORE_ID")!, store_passwd: env("SSLCOMMERZ_STORE_PASSWORD")!, v: "1", format: "json" });
  const r = await fetchJson(`${base()}/validator/api/validationserverAPI.php?${q}`, { method: "GET" }, "SSLCommerz");
  const d = r.data ?? {};
  const ok = d.status === "VALID" || d.status === "VALIDATED";
  const useOriginal = d.currency_type && d.currency_amount;
  return {
    reference: d.tran_id,
    providerReference: d.bank_tran_id || d.val_id || valId,
    status: ok ? "paid" : "failed",
    verified: ok, // failed validations leave the deposit pending for admin review
    amount: Number(useOriginal ? d.currency_amount : d.amount),
    currency: String(useOriginal ? d.currency_type : d.currency ?? "").toUpperCase(),
    note: d.card_type ? `via ${d.card_type}` : undefined,
  };
}

export const sslcommerzAdapter: PaymentAdapter = {
  code: "sslcommerz",
  label: "SSLCommerz",
  kind: "gateway",
  envKeys: ["SSLCOMMERZ_STORE_ID", "SSLCOMMERZ_STORE_PASSWORD"],
  isConfigured: () => hasEnv("SSLCOMMERZ_STORE_ID", "SSLCOMMERZ_STORE_PASSWORD"),

  async createDeposit(ctx) {
    const c = chargeAmount("SSLCOMMERZ", ctx.amount, ctx.currency, "BDT");
    const form = new URLSearchParams({
      store_id: env("SSLCOMMERZ_STORE_ID")!,
      store_passwd: env("SSLCOMMERZ_STORE_PASSWORD")!,
      total_amount: c.value,
      currency: c.currency,
      tran_id: ctx.reference,
      success_url: `${ctx.urls.success}&result=success`,
      fail_url: `${ctx.urls.success}&result=fail`,
      cancel_url: ctx.urls.cancel,
      ipn_url: ctx.urls.webhook,
      cus_name: ctx.customer.name,
      cus_email: ctx.customer.email,
      cus_phone: ctx.customer.phone ?? "01700000000",
      cus_add1: "N/A",
      cus_city: "Dhaka",
      cus_postcode: "1000",
      cus_country: "Bangladesh",
      shipping_method: "NO",
      num_of_item: "1",
      product_name: "Wallet deposit",
      product_category: "Deposit",
      product_profile: "non-physical-goods",
      value_a: ctx.depositId,
    });
    const r = await fetchJson(`${base()}/gwprocess/v4/api.php`, { method: "POST", body: form.toString(), headers: { "Content-Type": "application/x-www-form-urlencoded" } }, "SSLCommerz");
    if (r.data?.status !== "SUCCESS" || !r.data.GatewayPageURL) throw gatewayError(r.data?.failedreason || "SSLCommerz session could not be created.");
    return { status: "pending", redirectUrl: r.data.GatewayPageURL, providerReference: r.data.sessionkey, charge: { amount: c.value, currency: c.currency } };
  },

  async handleReturn(req) {
    const p = await readParams(req);
    if (!p.val_id) return { reference: p.tran_id ?? p.ref, status: p.result === "fail" ? "failed" : "pending", verified: false };
    return validate(p.val_id);
  },

  async handleWebhook(req) {
    const p = await readParams(req);
    if (!p.val_id) return null;
    return validate(p.val_id);
  },
};
