import type { paymentMethods } from "@/db/schema";

export type PaymentMethodRow = typeof paymentMethods.$inferSelect;

export interface DepositContext {
  depositId: string;
  reference: string;
  /** Amount in the site/wallet currency */
  amount: string;
  /** Site/wallet currency (Admin → Settings → locale.currency) */
  currency: string;
  userId: string;
  customer: { name: string; email: string; phone: string | null };
  method: PaymentMethodRow;
  urls: {
    base: string;
    /** Browser returns here after payment (…/api/payments/return/{code}?ref=REF) */
    success: string;
    /** Browser returns here when the player cancels */
    cancel: string;
    /** Gateway server-to-server notification URL (…/api/payments/webhook/{code}) */
    webhook: string;
  };
}

export interface DepositResult {
  status: "pending" | "approved";
  instructions?: string | null;
  redirectUrl?: string;
  providerReference?: string;
  /** What the gateway will actually charge (after currency conversion) — used to verify callbacks */
  charge?: { amount: string; currency: string };
}

export type GatewayStatus = "paid" | "failed" | "cancelled" | "pending";

export interface GatewayResult {
  reference?: string;
  providerReference?: string;
  status: GatewayStatus;
  /** true only when authenticated (valid signature or confirmed through the gateway API) */
  verified: boolean;
  amount?: number;
  currency?: string;
  note?: string;
}

export interface PaymentAdapter {
  code: string;
  label: string;
  kind: "manual" | "gateway";
  /** env variables this gateway needs */
  envKeys: string[];
  isConfigured(): boolean;
  createDeposit(ctx: DepositContext): Promise<DepositResult>;
  /** Server-to-server notification. MUST authenticate (signature or re-query the gateway). */
  handleWebhook?(req: Request): Promise<GatewayResult | null>;
  /** Browser returning from the gateway. MUST confirm via the gateway API — never trust query params. */
  handleReturn?(req: Request): Promise<GatewayResult | null>;
  /** Optional custom reply body for webhooks (some gateways require e.g. "OK") */
  webhookResponse?: { body: string; contentType: string };
}
