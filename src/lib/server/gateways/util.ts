import "server-only";
import { createHmac } from "crypto";
import { safeEqual } from "../crypto";
import { ApiError } from "../http";

export const env = (k: string) => process.env[k]?.trim() || undefined;
export const envBool = (k: string, def = false) => {
  const v = env(k);
  return v ? ["1", "true", "yes", "on"].includes(v.toLowerCase()) : def;
};
export const hasEnv = (...keys: string[]) => keys.every((k) => Boolean(env(k)));

export const gatewayError = (msg: string, status = 502) => new ApiError(status, msg, "GATEWAY");

/**
 * Converts a wallet-currency amount into the currency the gateway charges.
 *   {PREFIX}_CURRENCY       gateway currency (default: `fallback` or the site currency)
 *   {PREFIX}_EXCHANGE_RATE  1 unit of site currency = N units of gateway currency (required if currencies differ)
 */
export function chargeAmount(prefix: string, amount: string | number, siteCurrency: string, fallback?: string) {
  const site = siteCurrency.toUpperCase();
  const currency = (env(`${prefix}_CURRENCY`) ?? fallback ?? site).toUpperCase();
  const rawRate = env(`${prefix}_EXCHANGE_RATE`);
  const rate = rawRate ? Number(rawRate) : currency === site ? 1 : NaN;
  if (!Number.isFinite(rate) || rate <= 0) {
    throw gatewayError(`Payment gateway misconfigured: set ${prefix}_EXCHANGE_RATE to convert ${site} → ${currency}.`, 503);
  }
  const cents = Math.round(Number(amount) * rate * 100);
  return { currency, cents, value: (cents / 100).toFixed(2), rate };
}

export const hmacHex = (algo: "sha256" | "sha512", secret: string, data: string) => createHmac(algo, secret).update(data).digest("hex");
export const matchesHex = (expected: string, got: string | null | undefined) => Boolean(got) && safeEqual(expected.toLowerCase(), got!.trim().toLowerCase());

/** Merges query params + form/JSON body into a flat string record. */
export async function readParams(req: Request): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  new URL(req.url).searchParams.forEach((v, k) => (out[k] = v));
  if (req.method === "POST") {
    const ct = req.headers.get("content-type") ?? "";
    try {
      if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
        const fd = await req.formData();
        fd.forEach((v, k) => {
          if (typeof v === "string") out[k] = v;
        });
      } else if (ct.includes("json")) {
        const j = (await req.json()) as Record<string, unknown>;
        for (const [k, v] of Object.entries(j ?? {})) if (v != null) out[k] = String(v);
      }
    } catch {
      /* empty/invalid body */
    }
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchJson(url: string, init: RequestInit, label: string): Promise<{ ok: boolean; status: number; data: any }> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(15000) });
  } catch {
    // Network errors can include the full URL (including query credentials); keep them out of logs.
    console.error(`[integration:${label}] endpoint unreachable`);
    throw gatewayError(`${label} is not reachable right now. Please try again.`);
  }
  const text = await res.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) console.error(`[integration:${label}] HTTP ${res.status}`);
  return { ok: res.ok, status: res.status, data };
}
