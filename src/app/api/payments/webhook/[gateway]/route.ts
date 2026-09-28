import { NextResponse } from "next/server";
import { settleGatewayDeposit } from "@/lib/server/finance";
import { errorResponse, getIp, rateLimit } from "@/lib/server/http";
import { findPaymentAdapterAny } from "@/lib/server/payments";

export const dynamic = "force-dynamic";

/**
 * Server-to-server payment notifications:  POST https://YOUR-DOMAIN/api/payments/webhook/{stripe|sslcommerz|nowpayments|custom}
 * Each adapter authenticates the request (signature or gateway API re-query) before anything is credited.
 */
async function handle(req: Request, { params }: { params: Promise<{ gateway: string }> }) {
  const { gateway } = await params;
  const adapter = await findPaymentAdapterAny(gateway);
  if (!adapter?.handleWebhook) return NextResponse.json({ ok: false, error: "Unknown payment gateway." }, { status: 404 });
  if (!adapter.isConfigured()) return NextResponse.json({ ok: false, error: "Gateway not configured." }, { status: 503 });
  try {
    rateLimit(`pay-webhook:${gateway}:${getIp(req)}`, 120, 60 * 1000);
    const result = await adapter.handleWebhook(req);
    if (!result) return NextResponse.json({ ok: true, ignored: true });
    const s = await settleGatewayDeposit(gateway, result, "webhook");
    if (adapter.webhookResponse) return new Response(adapter.webhookResponse.body, { status: 200, headers: { "Content-Type": adapter.webhookResponse.contentType } });
    return NextResponse.json({ ok: true, outcome: s.outcome });
  } catch (e) {
    console.error(`[payments:${gateway}] webhook error`, e);
    return errorResponse(e);
  }
}

/** Some gateways send GET notifications. */
export { handle as POST, handle as GET };
