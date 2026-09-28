import "server-only";
import type { PaymentAdapter } from "./types";
import { chargeAmount, env, envBool, fetchJson, gatewayError, hasEnv } from "./util";

/**
 * bKASH TOKENIZED CHECKOUT (Bangladesh)
 * env: BKASH_USERNAME, BKASH_PASSWORD, BKASH_APP_KEY, BKASH_APP_SECRET, BKASH_SANDBOX=true|false,
 *      BKASH_EXCHANGE_RATE (required if the site currency is not BDT), optional BKASH_BASE_URL
 * Callback (automatic): https://YOUR-DOMAIN/api/payments/return/bkash
 * Payments are confirmed with bKash Execute / Query Payment APIs before crediting.
 */
const base = () => env("BKASH_BASE_URL") ?? (envBool("BKASH_SANDBOX", true) ? "https://tokenized.sandbox.bka.sh/v1.2.0-beta" : "https://tokenized.pay.bka.sh/v1.2.0-beta");

const g = globalThis as typeof globalThis & { __bkashToken?: { token: string; exp: number } };

async function grantToken() {
  if (g.__bkashToken && g.__bkashToken.exp > Date.now()) return g.__bkashToken.token;
  const r = await fetchJson(
    `${base()}/tokenized/checkout/token/grant`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", username: env("BKASH_USERNAME")!, password: env("BKASH_PASSWORD")! },
      body: JSON.stringify({ app_key: env("BKASH_APP_KEY"), app_secret: env("BKASH_APP_SECRET") }),
    },
    "bKash",
  );
  if (!r.data?.id_token) throw gatewayError(r.data?.statusMessage || r.data?.msg || "bKash authentication failed.");
  g.__bkashToken = { token: r.data.id_token, exp: Date.now() + 50 * 60 * 1000 };
  return r.data.id_token as string;
}

async function call(path: string, body: Record<string, unknown>) {
  const token = await grantToken();
  return fetchJson(
    `${base()}${path}`,
    { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: token, "X-APP-Key": env("BKASH_APP_KEY")! }, body: JSON.stringify(body) },
    "bKash",
  );
}

export const bkashAdapter: PaymentAdapter = {
  code: "bkash",
  label: "bKash Tokenized Checkout",
  kind: "gateway",
  envKeys: ["BKASH_USERNAME", "BKASH_PASSWORD", "BKASH_APP_KEY", "BKASH_APP_SECRET"],
  isConfigured: () => hasEnv("BKASH_USERNAME", "BKASH_PASSWORD", "BKASH_APP_KEY", "BKASH_APP_SECRET"),

  async createDeposit(ctx) {
    const c = chargeAmount("BKASH", ctx.amount, ctx.currency, "BDT");
    if (c.currency !== "BDT") throw gatewayError("bKash only supports BDT.", 503);
    const r = await call("/tokenized/checkout/create", {
      mode: "0011",
      payerReference: (ctx.customer.phone ?? ctx.userId).slice(0, 30),
      callbackURL: `${ctx.urls.base}/api/payments/return/bkash`,
      amount: c.value,
      currency: "BDT",
      intent: "sale",
      merchantInvoiceNumber: ctx.reference,
    });
    if (!r.data?.bkashURL || !r.data.paymentID) throw gatewayError(r.data?.statusMessage || r.data?.errorMessage || "bKash payment could not be created.");
    return { status: "pending", redirectUrl: r.data.bkashURL, providerReference: r.data.paymentID, charge: { amount: c.value, currency: "BDT" } };
  },

  async handleReturn(req) {
    const q = new URL(req.url).searchParams;
    const paymentID = q.get("paymentID");
    if (!paymentID) return null;
    const status = q.get("status");
    if (status !== "success") return { providerReference: paymentID, status: status === "cancel" ? "cancelled" : "failed", verified: false };
    let d = (await call("/tokenized/checkout/execute", { paymentID })).data ?? {};
    if (d.transactionStatus !== "Completed") d = (await call("/tokenized/checkout/payment/status", { paymentID })).data ?? {};
    if (d.transactionStatus !== "Completed") return { providerReference: paymentID, reference: d.merchantInvoiceNumber, status: "failed", verified: false, note: d.statusMessage };
    return { providerReference: paymentID, reference: d.merchantInvoiceNumber, status: "paid", verified: true, amount: Number(d.amount), currency: String(d.currency ?? "BDT").toUpperCase(), note: d.trxID ? `bKash trxID ${d.trxID}` : undefined };
  },
};
