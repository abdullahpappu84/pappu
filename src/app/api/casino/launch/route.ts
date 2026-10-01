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
    rateLimit(`casino-launch:${getIp(req)}`, 30, 60_000);
    const input = await readJson(req, z.object({ gameId: z.string().min(1).max(64), device: z.enum(["desktop", "mobile"]).default("desktop") }));
    const current = await getCurrentUser();
    if (!current?.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const [game] = await db.select({ slug: games.slug }).from(games).where(eq(games.aggregatorGameId, input.gameId));
    if (!game) return NextResponse.json({ error: "Game not found." }, { status: 404 });
    return NextResponse.json(await launchGame(req, { slug: game.slug, mode: "real", device: input.device, user: current.user }));
  } catch (e) { return errorResponse(e); }
}
