import { createHmac } from "crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users, wallets } from "@/db/schema";
import { safeEqual } from "@/lib/server/crypto";
import { processGameEvent } from "@/lib/server/finance";
import { ApiError, errorResponse, getIp } from "@/lib/server/http";
import { verifyGameToken } from "@/lib/server/games/launch";

export const dynamic = "force-dynamic";

/**
 * Seamless-wallet callback for game providers.  URL: https://YOUR-DOMAIN/api/games/callback
 *
 * Security
 *  - Header `x-signature` (or GAME_SIGNATURE_HEADER) = hex(HMAC_SHA256(rawBody, GAME_CALLBACK_SECRET))
 *  - Optional IP allow-list: GAME_CALLBACK_IPS="1.2.3.4,5.6.7.8"
 *
 * Actions (JSON body)
 *  authenticate { token }                               → player + balance
 *  balance      { token | userId }                      → balance
 *  bet          { token | userId, amount, roundId, transactionId?, gameSlug? }
 *  win          { token | userId, amount, roundId, transactionId?, gameSlug? }   (amount may be 0)
 *  rollback     { token | userId, roundId, transactionId? }  (alias: refund) → reverses the original bet
 *
 * Every money action is idempotent per transactionId (or roundId) and written to the ledger.
 */
const schema = z.object({
  action: z.enum(["authenticate", "balance", "bet", "win", "rollback", "refund"]),
  token: z.string().max(2000).optional(),
  userId: z.string().uuid().optional(),
  amount: z.number().min(0).max(10_000_000).optional(),
  roundId: z.string().min(1).max(120).optional(),
  transactionId: z.string().min(1).max(120).optional(),
  gameSlug: z.string().max(120).optional(),
});

async function balances(userId: string) {
  const [w] = await db.select().from(wallets).where(eq(wallets.userId, userId));
  const main = Number(w?.mainBalance ?? 0);
  const bonus = Number(w?.bonusBalance ?? 0);
  return { balance: Number((main + bonus).toFixed(2)), mainBalance: main, bonusBalance: bonus, currency: w?.currency ?? "EUR" };
}

export async function POST(req: Request) {
  try {
    const secret = process.env.GAME_CALLBACK_SECRET;
    if (!secret) return NextResponse.json({ ok: false, error: "Game callback not configured." }, { status: 503 });

    const allow = process.env.GAME_CALLBACK_IPS?.split(",").map((s) => s.trim()).filter(Boolean);
    if (allow?.length && !allow.includes(getIp(req))) return NextResponse.json({ ok: false, error: "IP not allowed." }, { status: 403 });

    const raw = await req.text();
    const header = (process.env.GAME_SIGNATURE_HEADER || "x-signature").toLowerCase();
    const expected = createHmac("sha256", secret).update(raw).digest("hex");
    if (!safeEqual(expected, (req.headers.get(header) ?? "").toLowerCase())) return NextResponse.json({ ok: false, error: "Invalid signature." }, { status: 401 });

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new ApiError(400, "Invalid JSON.");
    }
    const b = schema.parse(json);

    // Resolve player from signed game token (preferred) or userId
    let userId = b.userId;
    let gameSlug = b.gameSlug;
    if (b.token) {
      const t = verifyGameToken(b.token);
      if (!t) return NextResponse.json({ ok: false, error: "Invalid or expired token.", code: "INVALID_TOKEN" }, { status: 401 });
      userId = t.uid;
      gameSlug ??= t.g;
    }
    if (!userId) throw new ApiError(400, "token or userId is required.");
    const [u] = await db.select({ id: users.id, name: users.name, status: users.status }).from(users).where(eq(users.id, userId));
    if (!u) return NextResponse.json({ ok: false, error: "Player not found.", code: "PLAYER_NOT_FOUND" }, { status: 404 });

    if (b.action === "authenticate" || b.action === "balance") {
      return NextResponse.json({ ok: true, playerId: u.id, playerName: u.name, ...(await balances(u.id)) });
    }
    if (u.status !== "active" && b.action === "bet") return NextResponse.json({ ok: false, error: "Player is restricted.", code: "PLAYER_BLOCKED" }, { status: 403 });
    if (!b.roundId) throw new ApiError(400, "roundId is required.");

    const r = await processGameEvent({
      action: b.action === "refund" ? "rollback" : b.action,
      userId: u.id,
      amount: b.amount ?? 0,
      roundId: b.roundId,
      transactionId: b.transactionId,
      gameSlug,
    });
    return NextResponse.json({ ok: true, duplicate: r.duplicate, transactionId: r.transaction?.reference ?? null, ...(await balances(u.id)) });
  } catch (e) {
    return errorResponse(e);
  }
}
