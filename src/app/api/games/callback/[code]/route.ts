import { NextResponse } from "next/server";
import { getIp, rateLimit } from "@/lib/server/http";
import { handleGameCallback } from "@/lib/server/integrations/game";
import { findIntegration } from "@/lib/server/integrations/store";

export const dynamic = "force-dynamic";

/**
 * Wallet callback for admin-configured game integrations:
 *   https://YOUR-DOMAIN/api/games/callback/{integration-code}
 * Field names, signature scheme, action names and response format are configured in
 * Admin → Games → Custom Game APIs (no code changes needed).
 */
async function handle(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  try {
    rateLimit(`game-cb:${code}:${getIp(req)}`, 600, 60 * 1000);
  } catch {
    return NextResponse.json({ ok: false, error: "Too many requests." }, { status: 429 });
  }
  const row = await findIntegration("game", code);
  if (!row || !row.isActive) return NextResponse.json({ ok: false, error: "Unknown or inactive integration." }, { status: 404 });
  return handleGameCallback(row, req);
}

export { handle as POST, handle as GET };
