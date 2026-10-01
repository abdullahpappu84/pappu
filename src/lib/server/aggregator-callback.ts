import { createHmac } from "crypto";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { aggregatorGameSessions, games, users, wallets } from "@/db/schema";
import { safeEqual } from "@/lib/server/crypto";
import { processGameEvent } from "@/lib/server/finance";
import { ApiError, errorResponse, getIp } from "@/lib/server/http";
import { verifyGameToken } from "@/lib/server/games/launch";
import { aggregatorCurrencyExponent, assertAggregatorWalletCurrency } from "@/lib/aggregator-money";

const aggregatorSchema = z.object({
  transaction_type: z.enum(["bet", "win", "refund"]),
  transaction_id: z.string().min(1).max(120),
  original_transaction_id: z.string().min(1).max(120).optional(),
  amount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  currency: z.string().regex(/^[A-Z]{3}$/),
  player_id: z.string().min(1).max(128),
  session_id: z.string().min(1).max(64).optional(),
  provider_code: z.string().min(1).max(40),
  game: z.string().max(120).optional(),
  game_id: z.string().max(120).optional(),
  round_id: z.string().min(1).max(120),
  is_free: z.boolean().optional(),
  action: z.string().optional(),
});

const legacySchema = z.object({
  action: z.enum(["authenticate", "balance", "bet", "win", "rollback", "refund"]),
  token: z.string().max(2000).optional(),
  userId: z.string().uuid().optional(),
  amount: z.number().min(0).max(10_000_000).optional(),
  roundId: z.string().min(1).max(120).optional(),
  transactionId: z.string().min(1).max(120).optional(),
  gameSlug: z.string().max(120).optional(),
});

async function walletState(userId: string) {
  const [w] = await db.select().from(wallets).where(eq(wallets.userId, userId));
  const currency = w?.currency ?? "EUR";
  return { balance: Math.round((Number(w?.mainBalance ?? 0) + Number(w?.bonusBalance ?? 0)) * (10 ** aggregatorCurrencyExponent(currency))), currency };
}

function replyError(status: number, code: string, message: string, balance = 0, currency = "EUR") {
  return NextResponse.json({ status, error: code, message, balance, currency }, { status });
}

export async function handleAggregatorCallback(req: Request) {
  const secret = process.env.AGGREGATOR_CALLBACK_SECRET || process.env.GAME_CALLBACK_SECRET;
  if (!secret) return replyError(503, "CALLBACK_NOT_CONFIGURED", "Wallet callback is not configured.");

  const allow = process.env.GAME_CALLBACK_IPS?.split(",").map((s) => s.trim()).filter(Boolean);
  if (allow?.length && !allow.includes(getIp(req))) return replyError(403, "IP_NOT_ALLOWED", "Request source is not allowed.");

  // Aggregator signs the exact raw JSON bytes in X-SIGNATURE.
  const raw = Buffer.from(await req.arrayBuffer());
  const signature = req.headers.get("x-signature") ?? "";
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  if (!safeEqual(expected, signature.trim().toLowerCase())) return replyError(401, "INVALID_SIGNATURE", "Invalid signature.");

  let payload: unknown;
  try {
    payload = JSON.parse(raw.toString("utf8"));
  } catch {
    return replyError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }

  try {
    const parsedAggregator = aggregatorSchema.safeParse(payload);
    if (parsedAggregator.success) {
      const b = parsedAggregator.data;
      const [directUser] = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.player_id)
        ? await db.select({ id: users.id, status: users.status }).from(users).where(eq(users.id, b.player_id))
        : [];
      const [sessionUser] = !directUser && b.session_id
        ? await db.select({ id: users.id, status: users.status })
            .from(aggregatorGameSessions)
            .innerJoin(users, eq(users.id, aggregatorGameSessions.userId))
            .where(and(eq(aggregatorGameSessions.aggregatorSessionId, b.session_id), eq(aggregatorGameSessions.aggregatorPlayerId, b.player_id)))
        : [];
      const u = directUser ?? sessionUser;
      if (!u) return replyError(404, "PLAYER_NOT_FOUND", "Player not found.");
      const before = await walletState(u.id);
      if (before.currency !== b.currency) return replyError(400, "CURRENCY_MISMATCH", "Callback currency does not match wallet currency.", before.balance, before.currency);
      try { assertAggregatorWalletCurrency(before.currency); } catch { return replyError(400, "UNSUPPORTED_CURRENCY_PRECISION", "This wallet cannot process the currency's minor-unit precision.", before.balance, before.currency); }
      if (u.status !== "active" && b.transaction_type === "bet") return replyError(400, "PLAYER_BLOCKED", "Player is restricted.", before.balance, before.currency);
      const [catalogGame] = b.game_id
        ? await db.select({ slug: games.slug }).from(games).where(eq(games.aggregatorGameId, b.game_id))
        : [];

      const eventAction = b.transaction_type === "refund" ? "rollback" : b.transaction_type;
      try {
        const result = await processGameEvent({
          action: eventAction,
          userId: u.id,
          amount: b.amount / (10 ** aggregatorCurrencyExponent(b.currency)),
          roundId: b.round_id,
          transactionId: b.transaction_id,
          originalTransactionId: b.original_transaction_id,
          gameSlug: catalogGame?.slug,
          idempotencyScope: `aggregator:${b.provider_code}`,
          callbackCurrency: b.currency,
          isFree: b.is_free,
        });
        const replay = result.transaction?.metadata?.callbackResponse;
        if (result.duplicate && replay && typeof replay === "object") return NextResponse.json(replay);
        if (b.transaction_type === "refund" && !result.transaction) {
          return replyError(400, "ORIGINAL_TRANSACTION_NOT_FOUND", "Original debit was not found for this refund.", before.balance, before.currency);
        }
      } catch (e) {
        if (e instanceof ApiError && e.code === "INSUFFICIENT_FUNDS") {
          return replyError(402, "INSUFFICIENT_FUNDS", "Insufficient balance.", before.balance, before.currency);
        }
        throw e;
      }
      const after = await walletState(u.id);
      return NextResponse.json({ balance: after.balance, currency: after.currency, player_id: u.id });
    }

    // Keep the original generic callback contract working for existing providers.
    const b = legacySchema.parse(payload);
    let userId = b.userId;
    let gameSlug = b.gameSlug;
    if (b.token) {
      const t = verifyGameToken(b.token);
      if (!t) return replyError(401, "INVALID_TOKEN", "Invalid or expired token.");
      userId = t.uid;
      gameSlug ??= t.g;
    }
    if (!userId) throw new ApiError(400, "token or userId is required.");
    const [u] = await db.select({ id: users.id, name: users.name, status: users.status }).from(users).where(eq(users.id, userId));
    if (!u) return replyError(404, "PLAYER_NOT_FOUND", "Player not found.");
    const current = await balancesLegacy(u.id);
    if (b.action === "authenticate" || b.action === "balance") return NextResponse.json({ ok: true, playerId: u.id, playerName: u.name, ...current });
    if (u.status !== "active" && b.action === "bet") return NextResponse.json({ ok: false, error: "Player is restricted.", code: "PLAYER_BLOCKED" }, { status: 403 });
    if (!b.roundId) throw new ApiError(400, "roundId is required.");
    const result = await processGameEvent({ action: b.action === "refund" ? "rollback" : b.action, userId: u.id, amount: b.amount ?? 0, roundId: b.roundId, transactionId: b.transactionId, gameSlug });
    return NextResponse.json({ ok: true, duplicate: result.duplicate, transactionId: result.transaction?.reference ?? null, ...await balancesLegacy(u.id) });
  } catch (e) {
    if (e instanceof z.ZodError) return replyError(400, "INVALID_REQUEST", "Invalid wallet callback payload.");
    return errorResponse(e);
  }
}

async function balancesLegacy(userId: string) {
  const [w] = await db.select().from(wallets).where(eq(wallets.userId, userId));
  const mainBalance = Number(w?.mainBalance ?? 0);
  const bonusBalance = Number(w?.bonusBalance ?? 0);
  return { balance: Number((mainBalance + bonusBalance).toFixed(2)), mainBalance, bonusBalance, currency: w?.currency ?? "EUR" };
}
