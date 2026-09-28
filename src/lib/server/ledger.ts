import "server-only";
import { and, asc, desc, eq, lte, lt, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { auditLogs, notifications, transactions, userBonuses, vipLevels, vipUsers, wallets } from "@/db/schema";
import { genReference } from "./crypto";
import { ApiError } from "./http";
import { getSettings } from "./settings";

type Exec = Tx | typeof db;
export type TxType = (typeof transactions.$inferInsert)["type"];
export type BonusKind = (typeof userBonuses.$inferInsert)["type"];

export const toCents = (v: string | number | null | undefined) => Math.round(Number(v ?? 0) * 100);
export const fromCents = (c: number) => (c / 100).toFixed(2);

/** Locks (and lazily creates) the wallet row for update inside a DB transaction. */
export async function lockWallet(tx: Tx, userId: string) {
  let [w] = await tx.select().from(wallets).where(eq(wallets.userId, userId)).for("update");
  if (!w) {
    await tx.insert(wallets).values({ userId }).onConflictDoNothing();
    [w] = await tx.select().from(wallets).where(eq(wallets.userId, userId)).for("update");
  }
  return w;
}

export type LedgerInput = {
  userId: string;
  balanceType: "main" | "bonus";
  amountCents: number; // signed: + credit, - debit
  type: TxType;
  description: string;
  status?: "pending" | "completed" | "failed" | "reversed";
  relatedType?: string;
  relatedId?: string;
  adminId?: string | null;
  metadata?: Record<string, unknown>;
  externalRef?: string;
  allowNegative?: boolean;
};

/**
 * The ONLY function allowed to change wallet balances.
 * Every change writes an immutable, uniquely-referenced ledger row with before/after balances.
 */
export async function applyLedger(tx: Tx, input: LedgerInput) {
  if (!Number.isInteger(input.amountCents)) throw new ApiError(400, "Invalid amount precision.");
  const w = await lockWallet(tx, input.userId);
  const field = input.balanceType === "main" ? "mainBalance" : "bonusBalance";
  const before = toCents(w[field]);
  const after = before + input.amountCents;
  if (after < 0 && !input.allowNegative) throw new ApiError(400, input.balanceType === "main" ? "Insufficient balance." : "Insufficient bonus balance.", "INSUFFICIENT_FUNDS");
  await tx
    .update(wallets)
    .set({ [field]: fromCents(after), updatedAt: new Date() })
    .where(eq(wallets.id, w.id));
  const [row] = await tx
    .insert(transactions)
    .values({
      reference: genReference("TX"),
      externalRef: input.externalRef,
      userId: input.userId,
      walletId: w.id,
      type: input.type,
      balanceType: input.balanceType,
      amount: fromCents(input.amountCents),
      balanceBefore: fromCents(before),
      balanceAfter: fromCents(after),
      status: input.status ?? "completed",
      description: input.description,
      relatedType: input.relatedType,
      relatedId: input.relatedId,
      adminId: input.adminId ?? null,
      metadata: input.metadata,
    })
    .returning();
  return row;
}

/* ------------------------------ notifications / audit ------------------------------ */
export async function notify(
  exec: Exec,
  userId: string,
  n: { type: (typeof notifications.$inferInsert)["type"]; title: string; body?: string; link?: string },
) {
  await exec.insert(notifications).values({ userId, ...n });
}

export type AuditActor = { id: string; email: string } | null;
export async function audit(
  exec: Exec,
  actor: AuditActor,
  e: { action: string; targetType?: string; targetId?: string; description?: string; metadata?: Record<string, unknown>; ip?: string },
) {
  await exec.insert(auditLogs).values({ adminId: actor?.id, adminEmail: actor?.email, ...e });
}

/* ------------------------------ bonuses ------------------------------ */
export async function grantBonus(
  tx: Tx,
  g: {
    userId: string;
    name: string;
    type: BonusKind;
    amountCents: number;
    wageringMultiplier: number;
    expiryDays: number;
    freeSpins?: number;
    bonusId?: number | null;
    promoCodeId?: number | null;
    depositId?: string | null;
    adminId?: string | null;
  },
) {
  const [ub] = await tx
    .insert(userBonuses)
    .values({
      userId: g.userId,
      bonusId: g.bonusId ?? null,
      promoCodeId: g.promoCodeId ?? null,
      depositId: g.depositId ?? null,
      type: g.type,
      name: g.name,
      amount: fromCents(g.amountCents),
      freeSpins: g.freeSpins ?? 0,
      wageringRequired: fromCents(Math.round(g.amountCents * g.wageringMultiplier)),
      status: g.amountCents > 0 || (g.freeSpins ?? 0) > 0 ? "active" : "completed",
      expiresAt: new Date(Date.now() + Math.max(1, g.expiryDays) * 86400000),
    })
    .returning();
  if (g.amountCents > 0) {
    await applyLedger(tx, {
      userId: g.userId,
      balanceType: "bonus",
      amountCents: g.amountCents,
      type: "bonus",
      description: `Bonus credited: ${g.name}`,
      relatedType: "user_bonus",
      relatedId: ub.id,
      adminId: g.adminId,
    });
  }
  await notify(tx, g.userId, {
    type: "bonus",
    title: `Bonus activated: ${g.name}`,
    body:
      g.amountCents > 0
        ? `${fromCents(g.amountCents)} bonus credited${g.freeSpins ? ` + ${g.freeSpins} free spins` : ""}. Wagering required: ${fromCents(Math.round(g.amountCents * g.wageringMultiplier))}.`
        : `${g.freeSpins ?? 0} free spins added to your account.`,
    link: "/account?tab=bonuses",
  });
  return ub;
}

/** Expire overdue bonuses and forfeit their remaining bonus funds. */
export async function expireBonuses(tx: Tx, userId: string) {
  const overdue = await tx
    .select()
    .from(userBonuses)
    .where(and(eq(userBonuses.userId, userId), eq(userBonuses.status, "active"), lt(userBonuses.expiresAt, new Date())))
    .for("update");
  for (const b of overdue) {
    await tx.update(userBonuses).set({ status: "expired" }).where(eq(userBonuses.id, b.id));
    const w = await lockWallet(tx, userId);
    const forfeit = Math.min(toCents(b.amount), toCents(w.bonusBalance));
    if (forfeit > 0) {
      await applyLedger(tx, {
        userId,
        balanceType: "bonus",
        amountCents: -forfeit,
        type: "bonus_forfeit",
        description: `Bonus expired: ${b.name}`,
        relatedType: "user_bonus",
        relatedId: b.id,
      });
    }
    await notify(tx, userId, { type: "bonus", title: `Bonus expired: ${b.name}`, link: "/account?tab=bonuses" });
  }
}

/** Apply a wager towards active bonus wagering requirements (oldest first) and award VIP points. */
export async function recordWager(tx: Tx, userId: string, amountCents: number) {
  if (amountCents <= 0) return;
  await expireBonuses(tx, userId);
  let remaining = amountCents;
  const active = await tx
    .select()
    .from(userBonuses)
    .where(and(eq(userBonuses.userId, userId), eq(userBonuses.status, "active")))
    .orderBy(asc(userBonuses.createdAt))
    .for("update");
  for (const b of active) {
    if (remaining <= 0) break;
    const req = toCents(b.wageringRequired);
    const done = toCents(b.wageringCompleted);
    const apply = Math.min(remaining, Math.max(0, req - done));
    remaining -= apply;
    const newDone = done + apply;
    if (newDone >= req) {
      await tx.update(userBonuses).set({ wageringCompleted: fromCents(req), status: "completed", completedAt: new Date() }).where(eq(userBonuses.id, b.id));
      const w = await lockWallet(tx, userId);
      const convert = Math.min(toCents(b.amount), toCents(w.bonusBalance));
      if (convert > 0) {
        await applyLedger(tx, { userId, balanceType: "bonus", amountCents: -convert, type: "bonus_conversion", description: `Wagering complete: ${b.name}`, relatedType: "user_bonus", relatedId: b.id });
        await applyLedger(tx, { userId, balanceType: "main", amountCents: convert, type: "bonus_conversion", description: `Bonus converted to cash: ${b.name}`, relatedType: "user_bonus", relatedId: b.id });
      }
      await notify(tx, userId, { type: "bonus", title: `Wagering complete: ${b.name}`, body: `${fromCents(convert)} moved to your main balance.`, link: "/account?tab=wallet" });
    } else {
      await tx.update(userBonuses).set({ wageringCompleted: fromCents(newDone) }).where(eq(userBonuses.id, b.id));
    }
  }
  const s = await getSettings();
  await addVipPoints(tx, userId, Math.floor((amountCents / 100) * s.vip.pointsPerWager));
}

/* ------------------------------ VIP ------------------------------ */
export async function addVipPoints(tx: Tx, userId: string, points: number) {
  if (points <= 0) return;
  const [cur] = await tx
    .insert(vipUsers)
    .values({ userId, points, lifetimePoints: points })
    .onConflictDoUpdate({
      target: vipUsers.userId,
      set: { points: sql`${vipUsers.points} + ${points}`, lifetimePoints: sql`${vipUsers.lifetimePoints} + ${points}`, updatedAt: new Date() },
    })
    .returning();
  const [lvl] = await tx.select().from(vipLevels).where(lte(vipLevels.minPoints, cur.points)).orderBy(desc(vipLevels.minPoints)).limit(1);
  if (lvl && lvl.id !== cur.levelId) {
    await tx.update(vipUsers).set({ levelId: lvl.id }).where(eq(vipUsers.userId, userId));
    await notify(tx, userId, { type: "system", title: `Welcome to VIP ${lvl.name}!`, body: lvl.rewards ?? undefined, link: "/account?tab=vip" });
  }
}
