import { NextResponse } from "next/server";
import { settleGatewayDeposit } from "@/lib/server/finance";
import { appUrl } from "@/lib/server/mailer";
import { findPaymentAdapterAny } from "@/lib/server/payments";

export const dynamic = "force-dynamic";

/**
 * Browser return from a hosted payment page (GET or POST, depending on the gateway).
 * The adapter confirms the payment with the gateway API, then the player is sent back to Account → Deposit.
 */
async function handle(req: Request, { params }: { params: Promise<{ gateway: string }> }) {
  const { gateway } = await params;
  const url = new URL(req.url);
  const ref = url.searchParams.get("ref") ?? "";
  let outcome = "pending";
  const adapter = await findPaymentAdapterAny(gateway);
  try {
    if (url.searchParams.get("result") === "cancel") outcome = "cancelled";
    else if (adapter?.handleReturn && adapter.isConfigured()) {
      const r = await adapter.handleReturn(req);
      if (r) {
        const s = await settleGatewayDeposit(gateway, r, "return");
        outcome = s.outcome === "paid" ? "success" : ["failed", "cancelled", "review"].includes(s.outcome) ? s.outcome : "pending";
      }
    }
  } catch (e) {
    console.error(`[payments:${gateway}] return error`, e);
    outcome = "error";
  }
  return NextResponse.redirect(`${appUrl(req)}/account?tab=deposit&payment=${outcome}${ref ? `&ref=${encodeURIComponent(ref)}` : ""}`, 303);
}

export { handle as GET, handle as POST };
