import "server-only";
import { db } from "@/db";
import { integrations } from "@/db/schema";
import { decrypt, encrypt } from "../crypto";
import { badRequest } from "../http";

export type IntegrationRow = typeof integrations.$inferSelect;

/** Codes used by built-in adapters — custom integrations cannot reuse them. */
export const RESERVED_CODES = ["manual", "stripe", "sslcommerz", "bkash", "nowpayments", "custom", "direct"];

const g = globalThis as typeof globalThis & { __arIntegrations?: { at: number; rows: IntegrationRow[] } };

export async function loadIntegrations(fresh = false): Promise<IntegrationRow[]> {
  if (!fresh && g.__arIntegrations && Date.now() - g.__arIntegrations.at < 10000) return g.__arIntegrations.rows;
  let rows: IntegrationRow[] = [];
  try {
    rows = await db.select().from(integrations);
  } catch (e) {
    console.error("[integrations] load failed", e);
  }
  g.__arIntegrations = { at: Date.now(), rows };
  return rows;
}

export const clearIntegrationCache = () => {
  g.__arIntegrations = undefined;
};

export async function findIntegration(kind: "payment" | "game", code: string) {
  return (await loadIntegrations()).find((r) => r.kind === kind && r.code === code) ?? null;
}

/** Decrypts secrets; values stored as "env:VAR_NAME" are read from process.env at runtime. */
export function resolveSecrets(stored: Record<string, string> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(stored ?? {})) {
    const plain = decrypt(v) ?? "";
    out[k] = plain.startsWith("env:") ? (process.env[plain.slice(4).trim()] ?? "") : plain;
  }
  return out;
}

/** Safe description for the admin UI — never includes secret values. */
export function describeSecrets(stored: Record<string, string> | null | undefined) {
  return Object.entries(stored ?? {}).map(([name, v]) => {
    const plain = decrypt(v) ?? "";
    const envRef = plain.startsWith("env:") ? plain.slice(4).trim() : null;
    return { name, envRef, set: envRef ? Boolean(process.env[envRef]) : plain.length > 0 };
  });
}

/** patch: { NAME: "new value" | "" (keep) | null (delete) } */
export function mergeSecrets(stored: Record<string, string> | null | undefined, patch: Record<string, string | null>) {
  const out = { ...(stored ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(k)) throw badRequest(`Secret name "${k}" must use UPPER_CASE letters, numbers and _.`);
    if (v === null) delete out[k];
    else if (v !== "") out[k] = encrypt(v);
  }
  return out;
}
