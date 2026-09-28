import "server-only";
import type { DepositContext, GatewayResult, PaymentAdapter } from "../gateways/types";
import { gatewayError } from "../gateways/util";
import { signTicket } from "../crypto";
import { baseVars, getPath, listOf, mask, num, parseForm, readIncoming, render, sendRequest, sign, str, verifySignature, type Cfg, type DebugLog, type Vars } from "./engine";
import { resolveSecrets, type IntegrationRow } from "./store";

const PAID = "paid,success,succeeded,successful,completed,complete,approved,captured,valid,validated,finished";
const FAILED = "failed,fail,failure,declined,error,rejected,refunded,invalid";
const CANCELLED = "cancelled,canceled,cancel,expired,voided,aborted";

function convert(amount: string, site: string, currency?: string, rate?: string) {
  const cur = (currency?.trim() || site).toUpperCase();
  const r = rate?.trim() ? Number(rate) : cur === site.toUpperCase() ? 1 : NaN;
  if (!Number.isFinite(r) || r <= 0) throw gatewayError(`Gateway misconfigured: set an exchange rate for ${site} → ${cur}.`, 503);
  const cents = Math.round(Number(amount) * r * 100);
  return { currency: cur, cents, value: (cents / 100).toFixed(2) };
}

/** Builds a PaymentAdapter from an admin-configured integration row. */
export function buildPaymentAdapter(row: IntegrationRow, debug?: DebugLog): PaymentAdapter {
  const c = (row.config ?? {}) as Cfg;
  const label = row.name;

  async function createDeposit(ctx: DepositContext) {
    const secrets = resolveSecrets(row.secrets);
    const conv = convert(ctx.amount, ctx.currency, c.currency, c.exchangeRate);
    const vars: Vars = {
      ...baseVars(secrets),
      reference: ctx.reference,
      deposit_id: ctx.depositId,
      amount: conv.value,
      amount_cents: String(conv.cents),
      amount_int: String(Math.round(conv.cents / 100)),
      currency: conv.currency,
      site_amount: ctx.amount,
      site_currency: ctx.currency,
      description: `Wallet deposit ${ctx.reference}`,
      customer_name: ctx.customer.name,
      customer_email: ctx.customer.email,
      customer_phone: ctx.customer.phone ?? "",
      user_id: ctx.userId,
      success_url: ctx.urls.success,
      return_url: ctx.urls.success,
      fail_url: `${ctx.urls.success}&result=fail`,
      cancel_url: ctx.urls.cancel,
      webhook_url: ctx.urls.webhook,
      site_url: ctx.urls.base,
    };
    const charge = { amount: conv.value, currency: conv.currency };

    if (c.createMode === "form_post") {
      if (!c.createUrl) throw gatewayError(`${label}: checkout URL is not configured.`, 503);
      if (c.reqSigAlgo && c.reqSigAlgo !== "none") vars.signature = sign(c.reqSigAlgo, c.reqSigSecret ? secrets[c.reqSigSecret] : undefined, render(c.reqSigTemplate, vars), c.reqSigEncoding);
      const fields = Object.fromEntries(parseForm(c.createBody, vars));
      const url = render(c.createUrl, vars);
      debug?.push({ formPost: mask({ method: (c.createMethod || "POST").toUpperCase(), url, fields }, secrets) });
      const t = signTicket({ k: "payform", u: url, m: (c.createMethod || "POST").toUpperCase(), f: fields }, 1800);
      return { status: "pending" as const, redirectUrl: `${ctx.urls.base}/api/payments/redirect?t=${encodeURIComponent(t)}`, charge };
    }

    const r = await sendRequest(
      { method: c.createMethod, url: c.createUrl, contentType: c.createContentType, headers: c.createHeaders, body: c.createBody, sigAlgo: c.reqSigAlgo, sigPayload: c.reqSigPayload, sigTemplate: c.reqSigTemplate, sigSecret: c.reqSigSecret, sigEncoding: c.reqSigEncoding, sigHeader: c.reqSigHeader },
      vars,
      label,
      secrets,
      debug,
    );
    const d = r.data;
    const errMsg = str(getPath(d, c.responseErrorPath || "message")) || `${label}: payment could not be created.`;
    if (c.responseSuccessPath && !listOf(c.responseSuccessValues, "true,success,ok,1").includes(str(getPath(d, c.responseSuccessPath)).toLowerCase())) throw gatewayError(errMsg);
    const url = str(getPath(d, c.responseUrlPath || "url"));
    if (!r.ok || !/^https?:\/\//.test(url)) throw gatewayError(errMsg);
    return { status: "pending" as const, redirectUrl: url, providerReference: str(getPath(d, c.responseIdPath)) || undefined, charge };
  }

  async function confirm(req: Request, source: "webhook" | "return"): Promise<GatewayResult | null> {
    const secrets = resolveSecrets(row.secrets);
    const inc = await readIncoming(req);
    const vars: Vars = { ...baseVars(secrets), body: inc.params, query: inc.query, headers: inc.headers };
    const mode = c.verifyMode || "signature";
    let reference = str(getPath(inc.params, c.whRefPath || "reference")) || inc.query.ref || "";
    const providerRef = str(getPath(inc.params, c.whIdPath));
    let data: unknown = inc.params;
    let verified = false;
    let p: "wh" | "rq" = "wh";

    if (mode === "signature") {
      verified = verifySignature(c, "sig", inc, secrets, vars);
      if (!verified && source === "webhook") throw gatewayError("Invalid signature.", 400);
    } else if (mode === "requery") {
      if (!reference && !providerRef) return null;
      Object.assign(vars, { reference, provider_ref: providerRef });
      const r = await sendRequest({ method: c.requeryMethod || "GET", url: c.requeryUrl, contentType: c.requeryContentType || "form", headers: c.requeryHeaders, body: c.requeryBody }, vars, label, secrets, debug);
      if (r.ok) {
        data = r.data;
        verified = true;
        p = "rq";
      }
    }
    const get = (f: string, def: string) => getPath(data, c[`${p}${f}Path`] || c[`wh${f}Path`] || def);
    reference = str(get("Ref", "reference")) || reference;
    const statusRaw = str(get("Status", "status")).toLowerCase();
    const status: GatewayResult["status"] = listOf(c.paidValues, PAID).includes(statusRaw)
      ? "paid"
      : listOf(c.failedValues, FAILED).includes(statusRaw)
        ? "failed"
        : listOf(c.cancelledValues, CANCELLED).includes(statusRaw)
          ? "cancelled"
          : "pending";
    const amt = num(get("Amount", "amount"));
    return {
      reference: reference || undefined,
      providerReference: str(get("Id", "id")) || providerRef || undefined,
      status,
      verified: verified && mode !== "none",
      amount: amt != null ? amt / (num(c.amountDivisor) || 1) : undefined,
      currency: str(get("Currency", "currency")).toUpperCase() || undefined,
      note: `${label} ${source}${statusRaw ? ` · ${statusRaw}` : ""}`,
    };
  }

  return {
    code: row.code,
    label,
    kind: "gateway",
    envKeys: [],
    isConfigured: () => row.isActive && Boolean(c.createUrl),
    createDeposit,
    handleWebhook: (req) => confirm(req, "webhook"),
    handleReturn: (req) =>
      confirm(req, "return").catch((e) => {
        console.warn(`[payments:${row.code}] return not verified`, e instanceof Error ? e.message : e);
        return null;
      }),
    webhookResponse: { body: c.webhookResponse?.trim() || '{"ok":true}', contentType: c.webhookResponseType === "text" ? "text/plain" : "application/json" },
  };
}
