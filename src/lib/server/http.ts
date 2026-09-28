import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (m: string, code?: string) => new ApiError(400, m, code);
export const unauthorized = (m = "Please sign in to continue.") => new ApiError(401, m, "UNAUTHORIZED");
export const forbidden = (m = "You do not have permission to perform this action.", code = "FORBIDDEN") => new ApiError(403, m, code);
export const notFound = (m = "Not found.") => new ApiError(404, m, "NOT_FOUND");
export const conflict = (m: string) => new ApiError(409, m, "CONFLICT");

export function getIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim().slice(0, 64);
  return (req.headers.get("x-real-ip") ?? "unknown").slice(0, 64);
}

/** CSRF defence: reject state-changing cross-origin browser requests. */
export function assertSameOrigin(req: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin");
  if (!origin) return; // non-browser client or same-origin navigation
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw forbidden("Invalid request origin.", "CSRF");
  }
  const allowed = new Set(
    [req.headers.get("host"), req.headers.get("x-forwarded-host"), process.env.APP_URL ? new URL(process.env.APP_URL).host : null].filter(
      Boolean,
    ) as string[],
  );
  if (!allowed.has(originHost)) throw forbidden("Cross-site request blocked.", "CSRF");
}

/* ------------------------------ rate limiting ------------------------------ */
type Bucket = { count: number; reset: number };
const g = globalThis as typeof globalThis & { __arRate?: Map<string, Bucket> };
const buckets = (g.__arRate ??= new Map());

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    if (buckets.size > 20000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
    return;
  }
  b.count++;
  if (b.count > limit) {
    throw new ApiError(429, `Too many attempts. Try again in ${Math.ceil((b.reset - now) / 1000)}s.`, "RATE_LIMITED");
  }
}

/* ------------------------------ body parsing ------------------------------ */
export async function readJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown = {};
  const text = await req.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw badRequest("Invalid JSON body.");
    }
  }
  return schema.parse(body);
}

export function query(req: Request) {
  return new URL(req.url).searchParams;
}

export function pageParams(req: Request, defSize = 20) {
  const q = query(req);
  const page = Math.max(1, Number(q.get("page") ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(q.get("pageSize") ?? defSize) || defSize));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/* ------------------------------ error handling ------------------------------ */
function pgCode(e: unknown): string | undefined {
  const err = e as { code?: string; message?: string; cause?: { code?: string; message?: string; cause?: { code?: string } } };
  const code = err?.cause?.code ?? err?.cause?.cause?.code ?? (typeof err?.code === "string" && /^[0-9A-Z]{5}$/.test(err.code) ? err.code : undefined);
  if (!code && /invalid input syntax/i.test(`${err?.message ?? ""} ${err?.cause?.message ?? ""}`)) return "22P02";
  return code;
}

export function errorResponse(e: unknown) {
  if (e instanceof ApiError) return NextResponse.json({ error: e.message, code: e.code, details: e.details }, { status: e.status });
  if (e instanceof ZodError) {
    const issue = e.issues[0];
    const field = issue?.path?.join(".");
    return NextResponse.json(
      { error: issue ? `${field ? `${field}: ` : ""}${issue.message}` : "Invalid input.", code: "VALIDATION", details: e.issues },
      { status: 400 },
    );
  }
  const code = pgCode(e);
  if (code === "23505") return NextResponse.json({ error: "A record with these details already exists.", code: "DUPLICATE" }, { status: 409 });
  if (code === "23503") return NextResponse.json({ error: "This record is referenced by other data and cannot be changed.", code: "IN_USE" }, { status: 409 });
  if (code === "23514") return NextResponse.json({ error: "Insufficient balance for this operation.", code: "BALANCE" }, { status: 400 });
  if (code === "22P02") return NextResponse.json({ error: "Invalid identifier.", code: "INVALID_ID" }, { status: 400 });
  console.error("[api] unhandled error", e);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

/* ------------------------------ tiny router ------------------------------ */
export type RouteCtx = { req: Request; params: Record<string, string> };
export type Route<C> = {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  perm?: string;
  handler: (ctx: C & RouteCtx) => Promise<unknown>;
};

export function matchRoute<C>(routes: Route<C>[], method: string, segments: string[]) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const parts = r.path.split("/").filter(Boolean);
    if (parts.length !== segments.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].startsWith(":")) params[parts[i].slice(1)] = decodeURIComponent(segments[i]);
      else if (parts[i] !== segments[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { route: r, params };
  }
  return null;
}

export function toResponse(data: unknown) {
  if (data instanceof Response) return data;
  return NextResponse.json(data ?? { ok: true });
}
