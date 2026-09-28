import "server-only";
import { createHash, createHmac, randomBytes } from "crypto";
import { safeEqual } from "../crypto";
import { fetchJson, gatewayError } from "../gateways/util";

export type Cfg = Record<string, string | undefined>;
export type Vars = Record<string, unknown>;
export type DebugLog = Record<string, unknown>[];

export const str = (v: unknown) => (v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v)).trim();
export const num = (v: unknown) => {
  if (v === "" || v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};
export const listOf = (s: string | undefined, def = "") => (s?.trim() ? s : def).split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
export const lines = (s?: string) => (s ?? "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));

/** Dotted path lookup: "data.items[0].url" */
export function getPath(obj: unknown, path?: string): unknown {
  if (!path) return undefined;
  return path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean)
    .reduce<unknown>((o, k) => (o == null || typeof o !== "object" ? undefined : (o as Record<string, unknown>)[k]), obj);
}

const hash = (algo: string) => (s: string) => createHash(algo).update(s).digest("hex");
const FILTERS: Record<string, (s: string) => string> = {
  url: encodeURIComponent,
  upper: (s) => s.toUpperCase(),
  lower: (s) => s.toLowerCase(),
  trim: (s) => s.trim(),
  base64: (s) => Buffer.from(s).toString("base64"),
  md5: hash("md5"),
  sha1: hash("sha1"),
  sha256: hash("sha256"),
  sha512: hash("sha512"),
};

/** Renders {{path|filter|filter}} placeholders. mode "json" escapes values for use inside JSON strings. */
export function render(tpl: string | undefined, vars: Vars, mode: "raw" | "json" = "raw"): string {
  if (!tpl) return "";
  return tpl.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_m, expr: string) => {
    const [key, ...filters] = expr.split("|").map((s) => s.trim());
    let s = str(getPath(vars, key));
    for (const f of filters) if (FILTERS[f]) s = FILTERS[f](s);
    return mode === "json" ? JSON.stringify(s).slice(1, -1) : s;
  });
}

export function parseHeaders(tpl: string | undefined, vars: Vars) {
  const h: Record<string, string> = {};
  for (const l of lines(tpl)) {
    const i = l.indexOf(":");
    if (i > 0) h[l.slice(0, i).trim()] = render(l.slice(i + 1).trim(), vars);
  }
  return h;
}

export function parseForm(tpl: string | undefined, vars: Vars): [string, string][] {
  return lines(tpl).map((l) => {
    const i = l.indexOf("=");
    return i > 0 ? [l.slice(0, i).trim(), render(l.slice(i + 1), vars)] : [l, ""];
  });
}

export function sign(algo: string | undefined, secret: string | undefined, data: string, encoding?: string) {
  if (!algo || algo === "none") return "";
  let buf: Buffer;
  if (algo.startsWith("hmac-")) {
    if (!secret) throw gatewayError("Signature secret is not configured.", 503);
    buf = createHmac(algo.slice(5), secret).update(data).digest();
  } else buf = createHash(algo).update(data).digest();
  return encoding === "base64" ? buf.toString("base64") : encoding === "hex-upper" ? buf.toString("hex").toUpperCase() : buf.toString("hex");
}

export const baseVars = (secrets: Record<string, string>): Vars => ({
  secret: secrets,
  timestamp: String(Math.floor(Date.now() / 1000)),
  timestamp_ms: String(Date.now()),
  iso_time: new Date().toISOString(),
  nonce: randomBytes(8).toString("hex"),
});

export function mask<T>(o: T, secrets: Record<string, string>): T {
  let s = JSON.stringify(o);
  for (const v of Object.values(secrets)) if (v && v.length >= 4) s = s.split(JSON.stringify(v).slice(1, -1)).join("••••");
  return JSON.parse(s) as T;
}

export type RequestSpec = {
  method?: string;
  url?: string;
  contentType?: string;
  headers?: string;
  body?: string;
  sigAlgo?: string;
  sigPayload?: string;
  sigTemplate?: string;
  sigSecret?: string;
  sigEncoding?: string;
  sigHeader?: string;
};

/** Renders and sends a templated HTTP request. Adds {{signature}} to vars when signing is configured. */
export async function sendRequest(spec: RequestSpec, vars: Vars, label: string, secrets: Record<string, string>, debug?: DebugLog) {
  if (!spec.url) throw gatewayError(`${label}: request URL is not configured.`, 503);
  const method = (spec.method || "POST").toUpperCase();
  const ct = spec.contentType === "form" ? "form" : "json";
  const signing = Boolean(spec.sigAlgo && spec.sigAlgo !== "none");
  const doSign = (data: string) => (vars.signature = sign(spec.sigAlgo, spec.sigSecret ? secrets[spec.sigSecret] : undefined, data, spec.sigEncoding));
  if (signing && spec.sigPayload === "template") doSign(render(spec.sigTemplate, vars));

  let body: string | undefined;
  if (spec.body?.trim()) {
    if (ct === "json") {
      body = render(spec.body, vars, "json");
      try {
        JSON.parse(body);
      } catch {
        throw gatewayError(`${label}: body template is not valid JSON after rendering.`, 500);
      }
    } else {
      const p = new URLSearchParams();
      for (const [k, v] of parseForm(spec.body, vars)) p.append(k, v);
      body = p.toString();
    }
  }
  if (signing && spec.sigPayload !== "template") doSign(body ?? "");

  let url = render(spec.url, vars);
  if (method === "GET" && body) {
    const q = ct === "json" ? new URLSearchParams(Object.entries(JSON.parse(body) as Record<string, unknown>).map(([k, v]) => [k, str(v)])).toString() : body;
    url += (url.includes("?") ? "&" : "?") + q;
    body = undefined;
  }
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(body ? { "Content-Type": ct === "json" ? "application/json" : "application/x-www-form-urlencoded" } : {}),
    ...parseHeaders(spec.headers, vars),
  };
  if (spec.sigHeader && vars.signature) headers[spec.sigHeader] = String(vars.signature);
  const res = await fetchJson(url, { method, headers, body }, label);
  debug?.push({ request: mask({ method, url, headers, body }, secrets), response: { status: res.status, data: mask(res.data, secrets) } });
  return res;
}

export type Incoming = { raw: string; query: Record<string, string>; body: Record<string, unknown>; params: Record<string, unknown>; headers: Record<string, string> };

export async function readIncoming(req: Request): Promise<Incoming> {
  const url = new URL(req.url);
  const query = Object.fromEntries(url.searchParams);
  const raw = req.method === "GET" || req.method === "HEAD" ? "" : await req.text();
  let body: Record<string, unknown> = {};
  if (raw) {
    try {
      const j = JSON.parse(raw);
      if (j && typeof j === "object") body = j as Record<string, unknown>;
    } catch {
      body = Object.fromEntries(new URLSearchParams(raw));
    }
  }
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
  return { raw, query, body, params: { ...query, ...body }, headers };
}

/** Verifies an incoming signature using config keys `${prefix}Source|Header|Field|Prefix|Algo|Encoding|Payload|Template|Secret`. */
export function verifySignature(c: Cfg, prefix: "sig" | "cbSig", inc: Incoming, secrets: Record<string, string>, vars: Vars): boolean {
  const k = (n: string) => c[`${prefix}${n}`];
  const field = k("Field") || "signature";
  let got = k("Source") === "field" ? str(getPath(inc.params, field)) : (inc.headers[(k("Header") || "x-signature").toLowerCase()] ?? "");
  const pre = k("Prefix");
  if (pre && got.startsWith(pre)) got = got.slice(pre.length);
  got = got.trim();
  if (!got) return false;
  const payload = k("Payload") || "raw";
  const data =
    payload === "raw"
      ? inc.raw
      : payload === "sorted"
        ? Object.keys(inc.params)
            .filter((x) => x !== field && inc.params[x] != null && inc.params[x] !== "")
            .sort()
            .map((x) => `${x}=${str(inc.params[x])}`)
            .join("&")
        : render(k("Template"), vars);
  const secretName = k("Secret");
  const enc = k("Encoding") || "hex";
  const expected = sign(k("Algo") || "hmac-sha256", secretName ? secrets[secretName] : undefined, data, enc);
  return enc === "base64" ? safeEqual(expected, got) : safeEqual(expected.toLowerCase(), got.toLowerCase());
}
