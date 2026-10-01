import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { games } from "@/db/schema";
import { getCurrentUser } from "@/lib/server/auth";
import { assertSameOrigin, errorResponse, getIp, rateLimit, readJson } from "@/lib/server/http";
import { launchGame } from "@/lib/server/games/launch";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    rateLimit(`casino-demo:${getIp(req)}`, 30, 60_000);
    const input = await readJson(req, z.object({ gameId: z.string().min(1).max(64), device: z.enum(["desktop", "mobile"]).default("desktop") }));
    const [game] = await db.select({ slug: games.slug, hasDemo: games.hasDemo }).from(games).where(eq(games.aggregatorGameId, input.gameId));
    if (!game) return NextResponse.json({ error: "Game not found." }, { status: 404 });
    if (!game.hasDemo) return NextResponse.json({ error: "Demo play is unavailable for this game." }, { status: 409 });
    const current = await getCurrentUser();
    return NextResponse.json(await launchGame(req, { slug: game.slug, mode: "demo", device: input.device, user: current?.user ?? null }));
  } catch (e) { return errorResponse(e); }
}
