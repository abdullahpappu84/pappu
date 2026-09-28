import "server-only";
import { bkashAdapter } from "./gateways/bkash";
import { customAdapter } from "./gateways/custom";
import { nowpaymentsAdapter } from "./gateways/nowpayments";
import { sslcommerzAdapter } from "./gateways/sslcommerz";
import { stripeAdapter } from "./gateways/stripe";
import type { PaymentAdapter } from "./gateways/types";
import { buildPaymentAdapter } from "./integrations/payment";
import { loadIntegrations } from "./integrations/store";

export type { DepositContext, DepositResult, GatewayResult, PaymentAdapter } from "./gateways/types";

/**
 * Provider-independent payment adapter registry.
 * A gateway becomes available as soon as its env variables are set (see .env.example / PAYMENT_GATEWAY_GUIDE.md).
 * Payment methods whose adapter is not configured are hidden from players automatically.
 * Credentials are only ever read from process.env on the server.
 */
const manualAdapter: PaymentAdapter = {
  code: "manual",
  label: "Manual review (bank / wallet / crypto address + proof)",
  kind: "manual",
  envKeys: [],
  isConfigured: () => true,
  async createDeposit(ctx) {
    return { status: "pending", instructions: ctx.method.instructions };
  },
};

const REGISTRY: Record<string, PaymentAdapter> = {
  [manualAdapter.code]: manualAdapter,
  [stripeAdapter.code]: stripeAdapter,
  [sslcommerzAdapter.code]: sslcommerzAdapter,
  [bkashAdapter.code]: bkashAdapter,
  [nowpaymentsAdapter.code]: nowpaymentsAdapter,
  [customAdapter.code]: customAdapter,
  // myGateway: myGatewayAdapter,   ← add your own adapter here
};

export const getPaymentAdapter = (code: string | null | undefined) => REGISTRY[code ?? ""] ?? manualAdapter;
export const findPaymentAdapter = (code: string) => REGISTRY[code] ?? null;
export const isAdapterConfigured = (code: string | null | undefined) => getPaymentAdapter(code).isConfigured();
export const listPaymentAdapters = () =>
  Object.values(REGISTRY).map((a) => ({ code: a.code, label: a.label, kind: a.kind, configured: a.isConfigured(), envKeys: a.envKeys }));

/* ---------- Admin-configured (universal) integrations ---------- */

/** Built-in adapter or an admin-configured payment integration (null if unknown). */
export async function findPaymentAdapterAny(code: string | null | undefined): Promise<PaymentAdapter | null> {
  if (!code) return null;
  if (REGISTRY[code]) return REGISTRY[code];
  const row = (await loadIntegrations()).find((r) => r.kind === "payment" && r.code === code);
  return row ? buildPaymentAdapter(row) : null;
}

/** Always returns an adapter: unknown/removed integrations resolve to a disabled adapter (hidden from players). */
export async function resolvePaymentAdapter(code: string | null | undefined): Promise<PaymentAdapter> {
  if (!code) return manualAdapter;
  return (await findPaymentAdapterAny(code)) ?? { ...manualAdapter, code, label: "Unavailable integration", kind: "gateway", isConfigured: () => false };
}

export async function listAllPaymentAdapters() {
  const custom = (await loadIntegrations()).filter((r) => r.kind === "payment").map((r) => ({ code: r.code, label: `${r.name} (custom)`, kind: "gateway" as const, configured: buildPaymentAdapter(r).isConfigured(), envKeys: [] as string[] }));
  return [...listPaymentAdapters(), ...custom];
}
