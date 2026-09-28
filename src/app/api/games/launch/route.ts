import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/server/auth";
import { assertSameOrigin, errorResponse, getIp, rateLimit, readJson } from "@/lib/server/http";
import { launchGame } from "@/lib/server/games/launch";

export const dynamic = "force-dynamic";

/** POST { slug, mode: "real"|"demo", device } → { launchUrl, display }. Demo works for guests; real money requires login. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    rateLimit(`launch:${getIp(req)}`, 30, 60 * 1000);
    const b = await readJson(req, z.object({ slug: z.string().min(1).max(120), mode: z.enum(["real", "demo"]).default("real"), device: z.enum(["desktop", "mobile"]).default("desktop") }));
    const cur = await getCurrentUser();
    return NextResponse.json(await launchGame(req, { ...b, user: cur?.user ?? null }));
  } catch (e) {
    return errorResponse(e);
  }
}
