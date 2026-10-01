import "server-only";
import { createHash } from "crypto";
import { and, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import {
  agents,
  bonuses,
  commissions,
  deposits,
  games,
  paymentMethods,
  promoCodes,
  promoRedemptions,
  referrals,
  transactions,
  userBonuses,
  users,
  wallets,
  vipLevels,
  vipUsers,
  withdrawals,
  type Eligibility,
} from "@/db/schema";
import { genReference } from "./crypto";
import { ApiError, badRequest, conflict, notFound } from "./http";
import { addVipPoints, applyLedger, audit, fromCents, grantBonus, lockWallet, notify, recordWager, toCents, type AuditActor } from "./ledger";
import { resolvePaymentAdapter, type DepositResult, type GatewayResult } from "./payments";
import { getSettings } from "./settings";

/* ------------------------------ eligibility ------------------------------ */
export async function checkEligibility(tx: Tx | typeof db, userId: string, e: Eligibility | null | undefined) {
  if (!e) return;
  const [u] = await tx.select().from(users).where(eq(users.id, userId));
  if (!u) throw notFound("User not found.");
  if (e.newUsersOnly && Date.now() - u.createdAt.getTime() > 7 * 86400000) throw badRequest("This offer is only for new players.");
  if (e.requireEmailVerified && !u.emailVerifiedAt) throw badRequest("Please verify your email to claim this offer.");
  if (e.requireKyc && u.kycStatus !== "approved") throw badRequest("Identity verification (KYC) is required for this offer.");
  if (e.minVipLevel) {
    const [v] = await tx.select({ level: vipLevels.level }).from(vipUsers).leftJoin(vipLevels, eq(vipLevels.id, vipUsers.levelId)).where(eq(vipUsers.userId, userId));
    if ((v?.level ?? 0) < e.minVipLevel) throw badRequest("Your VIP level is not eligible for this offer.");
  }
}

function pctBonus(depositCents: number, percentage: string, maxBonus: string) {
  const raw = Math.round((depositCents * Number(percentage)) / 100);
  const cap = toCents(maxBonus);
  return cap > 0 ? Math.min(raw, cap) : raw;
}

/* ------------------------------ promo codes ------------------------------ */
async function promoGuards(tx: Tx | typeof db, promo: typeof promoCodes.$inferSelect, userId: string) {
  if (!promo.isActive) throw badRequest("This promo code is not active.");
  if (promo.expiresAt && promo.expiresAt < new Date()) throw badRequest("This promo code has expired.");
  if (promo.maxUsage != null && promo.usageCount >= promo.maxUsage) throw badRequest("This promo code has reached its usage limit.");
  const [{ n }] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(promoRedemptions)
    .where(and(eq(promoRedemptions.promoCodeId, promo.id), eq(promoRedemptions.userId, userId)));
  if (n >= promo.perUserLimit) throw badRequest("You have already used this promo code.");
  await checkEligibility(tx, userId, promo.eligibility);
}

export async function validatePromo(userId: string, code: string, depositAmount?: number) {
  const [promo] = await db.select().from(promoCodes).where(eq(promoCodes.code, code.trim().toUpperCase()));
  if (!promo) throw badRequest("Invalid promo code.");
  await promoGuards(db, promo, userId);
  const isDeposit = promo.bonusType === "deposit";
  if (isDeposit && depositAmount != null && toCents(depositAmount) < toCents(promo.minDeposit))
    throw badRequest(`Minimum deposit for this code is ${promo.minDeposit}.`);
  const estimated = isDeposit ? (depositAmount != null ? fromCents(pctBonus(toCents(depositAmount), promo.percentage, promo.maxBonus)) : null) : promo.bonusAmount;
  return {
    code: promo.code,
    description: promo.description,
    bonusType: promo.bonusType,
    requiresDeposit: isDeposit,
    percentage: promo.percentage,
    minDeposit: promo.minDeposit,
    maxBonus: promo.maxBonus,
    bonusAmount: promo.bonusAmount,
    freeSpins: promo.freeSpins,
    wageringMultiplier: promo.wageringMultiplier,
    estimatedBonus: estimated,
  };
}

export async function redeemPromoInTx(tx: Tx, userId: string, code: string, opts: { depositId?: string; depositCents?: number } = {}) {
  const [promo] = await tx.select().from(promoCodes).where(eq(promoCodes.code, code.trim().toUpperCase())).for("update");
  if (!promo) throw badRequest("Invalid promo code.");
  await promoGuards(tx, promo, userId);
  let amount: number;
  if (promo.bonusType === "deposit") {
    if (opts.depositCents == null) throw badRequest("This code must be used with a deposit.");
    if (opts.depositCents < toCents(promo.minDeposit)) throw badRequest(`Minimum deposit for this code is ${promo.minDeposit}.`);
    amount = pctBonus(opts.depositCents, promo.percentage, promo.maxBonus);
  } else amount = toCents(promo.bonusAmount);
  const ub = await grantBonus(tx, {
    userId,
    name: promo.description || `Promo ${promo.code}`,
    type: promo.bonusType,
    amountCents: amount,
    wageringMultiplier: Number(promo.wageringMultiplier),
    expiryDays: 30,
    freeSpins: promo.freeSpins,
    promoCodeId: promo.id,
    depositId: opts.depositId,
  });
  await tx.insert(promoRedemptions).values({ promoCodeId: promo.id, userId, userBonusId: ub.id, depositId: opts.depositId });
  await tx.update(promoCodes).set({ usageCount: sql`${promoCodes.usageCount} + 1` }).where(eq(promoCodes.id, promo.id));
  return ub;
}

export async function redeemPromoStandalone(userId: string, code: string) {
  const [promo] = await db.select().from(promoCodes).where(eq(promoCodes.code, code.trim().toUpperCase()));
  if (!promo) throw badRequest("Invalid promo code.");
  if (promo.bonusType === "deposit") throw badRequest("This is a deposit code — enter it on the deposit form to claim your bonus.");
  return db.transaction((tx) => redeemPromoInTx(tx, userId, code));
}

/* ------------------------------ bonus templates ------------------------------ */
async function grantBonusTemplate(tx: Tx, userId: string, bonusId: number, depositId?: string, depositCents?: number) {
  const [b] = await tx.select().from(bonuses).where(eq(bonuses.id, bonusId)).for("update");
  if (!b || !b.isActive) throw badRequest("This bonus is not available.");
  const now = new Date();
  if ((b.startsAt && b.startsAt > now) || (b.endsAt && b.endsAt < now)) throw badRequest("This bonus is not currently running.");
  if (b.usageLimit != null && b.usageCount >= b.usageLimit) throw badRequest("This bonus has reached its usage limit.");
  const [{ n }] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(userBonuses)
    .where(and(eq(userBonuses.userId, userId), eq(userBonuses.bonusId, b.id), ne(userBonuses.status, "cancelled")));
  if (n >= b.perUserLimit) throw badRequest("You have already claimed this bonus.");
  await checkEligibility(tx, userId, b.eligibility);
  let amount = toCents(b.amount);
  if (b.type === "deposit") {
    if (depositCents == null) throw badRequest("This bonus requires a deposit.");
    if (depositCents < toCents(b.minDeposit)) throw badRequest(`Minimum deposit for ${b.name} is ${b.minDeposit}.`);
    amount = pctBonus(depositCents, b.percentage, b.maxBonus);
  }
  const ub = await grantBonus(tx, {
    userId,
    name: b.name,
    type: b.type,
    amountCents: amount,
    wageringMultiplier: Number(b.wageringMultiplier),
    expiryDays: b.expiryDays,
    freeSpins: b.freeSpins,
    bonusId: b.id,
    depositId,
  });
  await tx.update(bonuses).set({ usageCount: sql`${bonuses.usageCount} + 1` }).where(eq(bonuses.id, b.id));
  return ub;
}

export async function grantRegistrationBonus(tx: Tx, userId: string) {
  const [b] = await tx.select().from(bonuses).where(and(eq(bonuses.type, "registration"), eq(bonuses.isActive, true))).limit(1);
  if (!b) return;
  try {
    await tx.transaction((sp) => grantBonusTemplate(sp, userId, b.id));
  } catch {
    /* not eligible — registration still succeeds */
  }
}

/* ------------------------------ deposits ------------------------------ */
export async function createDeposit(
  user: typeof users.$inferSelect,
  input: { paymentMethodId: number; amount: number; promoCode?: string; bonusId?: number; proofUrl?: string | null; note?: string; idempotencyKey?: string; baseUrl: string },
) {
  const s = await getSettings();
  const [pm] = await db.select().from(paymentMethods).where(eq(paymentMethods.id, input.paymentMethodId));
  if (!pm || !pm.isActive || pm.direction === "withdrawal") throw badRequest("Payment method unavailable.");
  const adapter = await resolvePaymentAdapter(pm.adapter);
  if (!adapter.isConfigured()) throw badRequest("This payment method is temporarily unavailable.");
  const cents = toCents(input.amount);
  const min = Math.max(toCents(pm.minAmount), toCents(s.deposit.min));
  const max = Math.min(toCents(pm.maxAmount), toCents(s.deposit.max));
  if (cents < min) throw badRequest(`Minimum deposit is ${fromCents(min)}.`);
  if (cents > max) throw badRequest(`Maximum deposit is ${fromCents(max)}.`);
  if (pm.requiresProof && !input.proofUrl) throw badRequest("Please upload your payment proof.");
  if (input.promoCode) await validatePromo(user.id, input.promoCode, input.amount);
  if (input.idempotencyKey) {
    const [dup] = await db.select().from(deposits).where(and(eq(deposits.userId, user.id), eq(deposits.idempotencyKey, input.idempotencyKey)));
    if (dup) return { deposit: dup, instructions: pm.instructions, duplicate: true };
  }
  const fee = Math.round((cents * Number(pm.feePercent)) / 100) + toCents(pm.feeFixed);
  const [dep] = await db
    .insert(deposits)
    .values({
      reference: genReference("DEP"),
      userId: user.id,
      paymentMethodId: pm.id,
      amount: fromCents(cents),
      fee: fromCents(fee),
      proofUrl: input.proofUrl ?? null,
      promoCode: input.promoCode?.trim().toUpperCase() || null,
      bonusId: input.bonusId ?? null,
      userNote: input.note,
      idempotencyKey: input.idempotencyKey,
    })
    .returning();
  const base = input.baseUrl.replace(/\/$/, "");
  const ret = `${base}/api/payments/return/${adapter.code}?ref=${encodeURIComponent(dep.reference)}`;
  let result: DepositResult;
  try {
    result = await adapter.createDeposit({
      depositId: dep.id,
      reference: dep.reference,
      amount: dep.amount,
      currency: s.locale.currency,
      userId: user.id,
      customer: { name: user.name, email: user.email, phone: user.phone },
      method: pm,
      urls: { base, success: ret, cancel: `${ret}&result=cancel`, webhook: `${base}/api/payments/webhook/${adapter.code}` },
    });
  } catch (e) {
    await db.update(deposits).set({ status: "cancelled", adminNote: `Gateway error: ${e instanceof Error ? e.message : "unknown"}`.slice(0, 900), updatedAt: new Date() }).where(eq(deposits.id, dep.id));
    throw e;
  }
  await db
    .update(deposits)
    .set({ providerReference: result.providerReference ?? null, chargeAmount: result.charge?.amount ?? null, chargeCurrency: result.charge?.currency ?? null })
    .where(eq(deposits.id, dep.id));
  const online = adapter.kind === "gateway";
  await notify(db, user.id, {
    type: "deposit",
    title: `Deposit ${dep.reference} ${online ? "started" : "submitted"}`,
    body: online ? `${dep.amount} via ${pm.name} — complete the payment to credit your balance.` : `${dep.amount} via ${pm.name} is pending review.`,
    link: "/account?tab=deposit",
  });
  return { deposit: dep, instructions: result.instructions ?? pm.instructions, redirectUrl: result.redirectUrl };
}

/**
 * Applies a verified gateway result to a deposit (called by /api/payments/webhook/* and /return/*).
 * Safe to call many times for the same payment — crediting happens exactly once.
 */
export async function settleGatewayDeposit(code: string, r: GatewayResult, source: "webhook" | "return") {
  let [dep] = r.reference ? await db.select().from(deposits).where(eq(deposits.reference, r.reference)) : [];
  if (!dep && r.providerReference) [dep] = await db.select().from(deposits).where(eq(deposits.providerReference, r.providerReference));
  if (!dep) return { outcome: "unknown" as const };
  const [pm] = dep.paymentMethodId ? await db.select().from(paymentMethods).where(eq(paymentMethods.id, dep.paymentMethodId)) : [];
  if (!pm || pm.adapter !== code) {
    console.warn(`[payments:${code}] result for ${dep.reference} does not match its payment method (${pm?.adapter})`);
    return { outcome: "mismatch" as const, deposit: dep };
  }
  if (!r.verified) return { outcome: r.status, deposit: dep }; // unverified browser signal → no state change
  const tag = `[${code}${r.providerReference ? ` ${r.providerReference}` : ""}]`;
  const flag = async (msg: string) => {
    await db.update(deposits).set({ adminNote: `${tag} ${msg}`.slice(0, 900), updatedAt: new Date() }).where(eq(deposits.id, dep.id));
    await audit(db, null, { action: "deposit.gateway_review", targetType: "deposit", targetId: dep.id, description: `${dep.reference}: ${msg}` });
    return { outcome: "review" as const, deposit: dep };
  };

  if (r.status === "paid") {
    if (dep.status === "approved") return { outcome: "paid" as const, deposit: dep };
    if (dep.status === "rejected") return flag("payment received after the deposit was rejected — review and adjust manually");
    if (dep.chargeCurrency && r.currency && r.currency.toUpperCase() !== dep.chargeCurrency.toUpperCase())
      return flag(`currency mismatch: paid ${r.amount} ${r.currency}, expected ${dep.chargeAmount} ${dep.chargeCurrency}`);
    if (dep.chargeAmount && r.amount != null && toCents(r.amount) + 1 < toCents(dep.chargeAmount))
      return flag(`underpaid: received ${r.amount} ${r.currency ?? ""}, expected ${dep.chargeAmount} ${dep.chargeCurrency ?? ""}`);
    if (dep.status === "cancelled") await db.update(deposits).set({ status: "pending" }).where(and(eq(deposits.id, dep.id), eq(deposits.status, "cancelled")));
    try {
      await approveDeposit(dep.id, null, `${tag} auto-approved via ${source}${r.note ? ` · ${r.note}` : ""}`.slice(0, 900));
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 409)) throw e; // already approved by a parallel callback
    }
    return { outcome: "paid" as const, deposit: dep };
  }
  if ((r.status === "failed" || r.status === "cancelled") && dep.status === "pending") {
    if (r.status === "failed") await rejectDeposit(dep.id, null, `${tag} payment failed${r.note ? ` · ${r.note}` : ""}`).catch(() => null);
    else await db.update(deposits).set({ status: "cancelled", adminNote: `${tag} checkout expired or cancelled`, updatedAt: new Date() }).where(and(eq(deposits.id, dep.id), eq(deposits.status, "pending")));
  }
  return { outcome: r.status, deposit: dep };
}

export async function approveDeposit(depositId: string, actor: AuditActor, note?: string, ip?: string) {
  return db.transaction(async (tx) => {
    const [dep] = await tx.select().from(deposits).where(eq(deposits.id, depositId)).for("update");
    if (!dep) throw notFound("Deposit not found.");
    if (dep.status !== "pending") throw conflict(`Deposit is already ${dep.status}.`);
    await tx.update(deposits).set({ status: "approved", adminNote: note ?? dep.adminNote, reviewedBy: actor?.id, reviewedAt: new Date(), updatedAt: new Date() }).where(eq(deposits.id, dep.id));
    const cents = toCents(dep.amount) - toCents(dep.fee);
    await applyLedger(tx, {
      userId: dep.userId,
      balanceType: "main",
      amountCents: cents,
      type: "deposit",
      description: `Deposit ${dep.reference}${toCents(dep.fee) ? ` (fee ${dep.fee})` : ""}`,
      relatedType: "deposit",
      relatedId: dep.id,
      adminId: actor?.id,
      externalRef: `deposit:${dep.id}`,
    });
    let bonusNote = "";
    try {
      if (dep.promoCode) await tx.transaction((sp) => redeemPromoInTx(sp, dep.userId, dep.promoCode!, { depositId: dep.id, depositCents: toCents(dep.amount) }));
      else if (dep.bonusId) await tx.transaction((sp) => grantBonusTemplate(sp, dep.userId, dep.bonusId!, dep.id, toCents(dep.amount)));
    } catch (e) {
      bonusNote = e instanceof ApiError ? e.message : "Bonus could not be applied.";
      await notify(tx, dep.userId, { type: "bonus", title: "Bonus not applied", body: bonusNote });
    }
    await createCommission(tx, dep.userId, "deposit", dep.id, toCents(dep.amount));
    const s = await getSettings();
    await addVipPoints(tx, dep.userId, Math.floor((toCents(dep.amount) / 100) * s.vip.pointsPerDeposit));
    await notify(tx, dep.userId, { type: "deposit", title: `Deposit approved: ${dep.amount}`, body: `Reference ${dep.reference} has been credited to your balance.`, link: "/account?tab=transactions" });
    await audit(tx, actor, { action: "deposit.approve", targetType: "deposit", targetId: dep.id, description: `Approved deposit ${dep.reference} (${dep.amount})${bonusNote ? ` — ${bonusNote}` : ""}`, ip });
    return { ok: true, bonusNote };
  });
}

export async function rejectDeposit(depositId: string, actor: AuditActor, note: string, ip?: string) {
  return db.transaction(async (tx) => {
    const [dep] = await tx.select().from(deposits).where(eq(deposits.id, depositId)).for("update");
    if (!dep) throw notFound("Deposit not found.");
    if (dep.status !== "pending") throw conflict(`Deposit is already ${dep.status}.`);
    await tx.update(deposits).set({ status: "rejected", adminNote: note, reviewedBy: actor?.id, reviewedAt: new Date(), updatedAt: new Date() }).where(eq(deposits.id, dep.id));
    await notify(tx, dep.userId, { type: "deposit", title: `Deposit ${dep.reference} rejected`, body: note, link: "/account?tab=deposit" });
    await audit(tx, actor, { action: "deposit.reject", targetType: "deposit", targetId: dep.id, description: `Rejected deposit ${dep.reference}: ${note}`, ip });
    return { ok: true };
  });
}

export async function cancelDeposit(userId: string, depositId: string) {
  const [dep] = await db
    .update(deposits)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(deposits.id, depositId), eq(deposits.userId, userId), eq(deposits.status, "pending")))
    .returning();
  if (!dep) throw conflict("Only pending deposits can be cancelled.");
  return { ok: true };
}

/* ------------------------------ withdrawals ------------------------------ */
export async function createWithdrawal(
  user: typeof users.$inferSelect,
  input: { paymentMethodId: number; amount: number; details: Record<string, string>; note?: string; idempotencyKey?: string },
) {
  const s = await getSettings();
  const w = s.withdrawal;
  if (w.requireEmailVerified && !user.emailVerifiedAt) throw badRequest("Please verify your email before withdrawing.");
  if (w.requireKyc && user.kycStatus !== "approved") throw badRequest("Identity verification (KYC) is required before withdrawing.");
  const [pm] = await db.select().from(paymentMethods).where(eq(paymentMethods.id, input.paymentMethodId));
  if (!pm || !pm.isActive || pm.direction === "deposit") throw badRequest("Withdrawal method unavailable.");
  for (const f of pm.fields ?? []) if (!input.details[f.name]?.trim()) throw badRequest(`${f.label} is required.`);
  const cents = toCents(input.amount);
  const min = Math.max(toCents(pm.minAmount), toCents(w.min));
  const max = Math.min(toCents(pm.maxAmount), toCents(w.max));
  if (cents < min) throw badRequest(`Minimum withdrawal is ${fromCents(min)}.`);
  if (cents > max) throw badRequest(`Maximum withdrawal is ${fromCents(max)}.`);
  const fee = Math.round((cents * (Number(pm.feePercent) + w.feePercent)) / 100) + toCents(pm.feeFixed) + toCents(w.feeFixed);
  if (fee >= cents) throw badRequest("Amount is too low to cover withdrawal fees.");

  return db.transaction(async (tx) => {
    await lockWallet(tx, user.id); // serialises concurrent withdrawals for this user
    if (input.idempotencyKey) {
      const [dup] = await tx.select().from(withdrawals).where(and(eq(withdrawals.userId, user.id), eq(withdrawals.idempotencyKey, input.idempotencyKey)));
      if (dup) return dup;
    }
    const since = new Date(Date.now() - 86400000);
    const [agg] = await tx
      .select({ n: sql<number>`count(*)::int`, total: sql<string>`coalesce(sum(${withdrawals.amount}),0)` })
      .from(withdrawals)
      .where(and(eq(withdrawals.userId, user.id), gte(withdrawals.createdAt, since), inArray(withdrawals.status, ["pending", "processing", "approved", "completed"])));
    if (agg.n >= w.dailyLimitCount) throw badRequest(`Daily withdrawal limit reached (${w.dailyLimitCount} requests per 24h).`);
    if (toCents(agg.total) + cents > toCents(w.dailyLimitAmount)) throw badRequest(`Daily withdrawal amount limit is ${w.dailyLimitAmount}.`);
    const [wd] = await tx
      .insert(withdrawals)
      .values({
        reference: genReference("WDR"),
        userId: user.id,
        paymentMethodId: pm.id,
        amount: fromCents(cents),
        fee: fromCents(fee),
        netAmount: fromCents(cents - fee),
        paymentDetails: input.details,
        userNote: input.note,
        idempotencyKey: input.idempotencyKey,
      })
      .returning();
    const hold = await applyLedger(tx, {
      userId: user.id,
      balanceType: "main",
      amountCents: -cents,
      type: "withdrawal",
      status: "pending",
      description: `Withdrawal ${wd.reference} via ${pm.name}`,
      relatedType: "withdrawal",
      relatedId: wd.id,
    });
    await tx.update(withdrawals).set({ holdTransactionId: hold.id }).where(eq(withdrawals.id, wd.id));
    await notify(tx, user.id, { type: "withdrawal", title: `Withdrawal ${wd.reference} requested`, body: `${wd.amount} (net ${wd.netAmount}) is pending review.`, link: "/account?tab=withdraw" });
    return wd;
  });
}

const W_TRANSITIONS: Record<string, string[]> = {
  pending: ["processing", "approved", "rejected", "completed"],
  processing: ["approved", "completed", "rejected"],
  approved: ["processing", "completed", "rejected"],
};

async function refundWithdrawal(tx: Tx, wd: typeof withdrawals.$inferSelect, reason: string, actorId?: string | null) {
  await applyLedger(tx, {
    userId: wd.userId,
    balanceType: "main",
    amountCents: toCents(wd.amount),
    type: "refund",
    description: `Withdrawal ${wd.reference} ${reason}`,
    relatedType: "withdrawal",
    relatedId: wd.id,
    adminId: actorId,
    externalRef: `withdrawal-refund:${wd.id}`,
  });
  if (wd.holdTransactionId) await tx.update(transactions).set({ status: "reversed" }).where(eq(transactions.id, wd.holdTransactionId));
}

export async function updateWithdrawalStatus(id: string, status: "processing" | "approved" | "rejected" | "completed", actor: AuditActor, note?: string, ip?: string) {
  return db.transaction(async (tx) => {
    const [wd] = await tx.select().from(withdrawals).where(eq(withdrawals.id, id)).for("update");
    if (!wd) throw notFound("Withdrawal not found.");
    if (!W_TRANSITIONS[wd.status]?.includes(status)) throw conflict(`Cannot move a ${wd.status} withdrawal to ${status}.`);
    if (status === "rejected" && !note) throw badRequest("A rejection reason is required.");
    await tx.update(withdrawals).set({ status, adminNote: note ?? wd.adminNote, reviewedBy: actor?.id, reviewedAt: new Date(), updatedAt: new Date() }).where(eq(withdrawals.id, wd.id));
    if (status === "rejected") await refundWithdrawal(tx, wd, "rejected — funds returned", actor?.id);
    if (status === "completed" && wd.holdTransactionId) await tx.update(transactions).set({ status: "completed" }).where(eq(transactions.id, wd.holdTransactionId));
    const labels = { processing: "is being processed", approved: "was approved", rejected: "was rejected", completed: "has been paid out" };
    await notify(tx, wd.userId, { type: "withdrawal", title: `Withdrawal ${wd.reference} ${labels[status]}`, body: note, link: "/account?tab=withdraw" });
    await audit(tx, actor, { action: `withdrawal.${status}`, targetType: "withdrawal", targetId: wd.id, description: `Withdrawal ${wd.reference} (${wd.amount}) → ${status}${note ? `: ${note}` : ""}`, ip });
    return { ok: true };
  });
}

export async function cancelWithdrawal(userId: string, id: string) {
  return db.transaction(async (tx) => {
    const [wd] = await tx.select().from(withdrawals).where(and(eq(withdrawals.id, id), eq(withdrawals.userId, userId))).for("update");
    if (!wd) throw notFound("Withdrawal not found.");
    if (wd.status !== "pending") throw conflict("Only pending withdrawals can be cancelled.");
    await tx.update(withdrawals).set({ status: "cancelled", updatedAt: new Date() }).where(eq(withdrawals.id, id));
    await refundWithdrawal(tx, wd, "cancelled — funds returned");
    return { ok: true };
  });
}

/* ------------------------------ referrals / commissions ------------------------------ */
export async function createCommission(tx: Tx, referredUserId: string, sourceType: string, sourceId: string, baseCents: number) {
  const s = await getSettings();
  if (!s.referral.enabled) return;
  const [ref] = await tx.select().from(referrals).where(eq(referrals.referredId, referredUserId));
  if (!ref || ref.status !== "active") return;
  let percent = s.referral.commissionPercent;
  if (ref.agentId) {
    const [ag] = await tx.select().from(agents).where(eq(agents.id, ref.agentId));
    if (!ag || ag.status !== "active") return;
    percent = Number(ag.commissionPercent);
  } else if (ref.referrerId) {
    const [r] = await tx.select({ disabled: users.referralDisabled, status: users.status }).from(users).where(eq(users.id, ref.referrerId));
    if (!r || r.disabled || r.status === "banned") return;
  } else return;
  const amount = Math.round((baseCents * percent) / 100);
  if (amount <= 0) return;
  await tx
    .insert(commissions)
    .values({
      referrerId: ref.referrerId,
      agentId: ref.agentId,
      referredUserId,
      sourceType,
      sourceId,
      baseAmount: fromCents(baseCents),
      percent: String(percent),
      amount: fromCents(amount),
    })
    .onConflictDoNothing();
}

export async function setCommissionStatus(id: string, status: "approved" | "paid" | "rejected", actor: AuditActor, ip?: string) {
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(commissions).where(eq(commissions.id, id)).for("update");
    if (!c) throw notFound("Commission not found.");
    const allowed: Record<string, string[]> = { pending: ["approved", "rejected", "paid"], approved: ["paid", "rejected"] };
    if (!allowed[c.status]?.includes(status)) throw conflict(`Commission is already ${c.status}.`);
    const patch: Partial<typeof commissions.$inferInsert> = { status };
    if (status === "approved" || status === "paid") Object.assign(patch, { approvedBy: actor?.id, approvedAt: c.approvedAt ?? new Date() });
    if (status === "paid") {
      patch.paidAt = new Date();
      if (c.referrerId) {
        const t = await applyLedger(tx, {
          userId: c.referrerId,
          balanceType: "main",
          amountCents: toCents(c.amount),
          type: "commission",
          description: `Referral commission (${c.percent}% of ${c.baseAmount})`,
          relatedType: "commission",
          relatedId: c.id,
          adminId: actor?.id,
          externalRef: `commission:${c.id}`,
        });
        patch.transactionId = t.id;
        await notify(tx, c.referrerId, { type: "system", title: `Referral commission paid: ${c.amount}`, link: "/account?tab=referrals" });
      }
    }
    await tx.update(commissions).set(patch).where(eq(commissions.id, id));
    await audit(tx, actor, { action: `commission.${status}`, targetType: "commission", targetId: id, description: `Commission ${c.amount} → ${status}`, ip });
    return { ok: true };
  });
}

/* ------------------------------ cashback ------------------------------ */
export async function runCashback(days: number, actor: AuditActor, ip?: string) {
  const since = new Date(Date.now() - days * 86400000);
  const periodKey = `${since.toISOString().slice(0, 10)}:${days}`;
  const rows = await db
    .select({
      userId: transactions.userId,
      net: sql<string>`coalesce(sum(case when ${transactions.type} in ('bet','win') then ${transactions.amount} else 0 end),0)`,
      pct: vipLevels.cashbackPercent,
    })
    .from(transactions)
    .innerJoin(vipUsers, eq(vipUsers.userId, transactions.userId))
    .innerJoin(vipLevels, eq(vipLevels.id, vipUsers.levelId))
    .where(and(gte(transactions.createdAt, since), eq(transactions.balanceType, "main")))
    .groupBy(transactions.userId, vipLevels.cashbackPercent);
  let paid = 0;
  let total = 0;
  for (const r of rows) {
    const loss = -toCents(r.net);
    const amount = Math.round((loss * Number(r.pct)) / 100);
    if (amount <= 0) continue;
    try {
      await db.transaction(async (tx) => {
        await applyLedger(tx, {
          userId: r.userId,
          balanceType: "main",
          amountCents: amount,
          type: "cashback",
          description: `VIP cashback ${r.pct}% for the last ${days} days`,
          externalRef: `cashback:${r.userId}:${periodKey}`,
          adminId: actor?.id,
        });
        await notify(tx, r.userId, { type: "bonus", title: `Cashback credited: ${fromCents(amount)}`, link: "/account?tab=transactions" });
      });
      paid++;
      total += amount;
    } catch {
      /* already paid for this period */
    }
  }
  await audit(db, actor, { action: "cashback.run", description: `Cashback run (${days}d): ${paid} users, total ${fromCents(total)}`, ip });
  return { users: paid, total: fromCents(total) };
}

/* ------------------------------ game provider events ------------------------------ */
export type GameEvent = { action: "bet" | "win" | "rollback"; userId: string; amount: number; roundId: string; transactionId?: string; originalTransactionId?: string; gameSlug?: string; idempotencyScope?: string; callbackCurrency?: string };

function gameExternalRef(action: string, key: string, scope?: string) {
  if (!scope) return `game:${action}:${key}`;
  const scoped = createHash("sha256").update(`${scope}\0${key}`).digest("hex");
  return `game:agg:${action}:${scoped}`;
}
type TxRow = typeof transactions.$inferSelect;

/**
 * Seamless-wallet engine used by /api/games/callback.
 *  - bet:      debits main balance first, bonus balance if main is insufficient; counts towards wagering + VIP
 *  - win:      credited to the same wallet (main/bonus) the round's bet came from; amount 0 = no-op
 *  - rollback: reverses the original bet(s) of the round/transaction back to their wallets
 * Idempotent: the same provider transaction is never applied twice.
 */
export async function processGameEvent(e: GameEvent): Promise<{ duplicate: boolean; transaction: TxRow | null }> {
  const key = e.transactionId ?? e.roundId;
  const ext = gameExternalRef(e.action, key, e.idempotencyScope);
  const [existing] = await db.select().from(transactions).where(eq(transactions.externalRef, ext));
  if (existing) return { duplicate: true, transaction: existing };
  const cents = toCents(e.amount);
  if (e.action === "bet" && cents <= 0) throw badRequest("Invalid bet amount.");
  if (e.action === "win" && cents === 0) return { duplicate: false, transaction: null };
  if (cents < 0) throw badRequest("Invalid amount.");

  return db.transaction(async (tx) => {
    const w = await lockWallet(tx, e.userId);
    const [racedDuplicate] = await tx.select().from(transactions).where(eq(transactions.externalRef, ext));
    if (racedDuplicate) return { duplicate: true, transaction: racedDuplicate };
    const [g] = e.gameSlug ? await tx.select({ id: games.id }).from(games).where(eq(games.slug, e.gameSlug)) : [];
    const meta = { roundId: e.roundId, transactionId: e.transactionId, gameSlug: e.gameSlug, gameId: g?.id, idempotencyScope: e.idempotencyScope };
    const on = e.gameSlug ? ` on ${e.gameSlug}` : "";
    const rememberCallbackReply = async (transaction: TxRow | null) => {
      if (!transaction || !e.idempotencyScope || !e.callbackCurrency) return transaction;
      const [current] = await tx.select().from(wallets).where(eq(wallets.userId, e.userId));
      const callbackResponse = {
        balance: Math.round((Number(current?.mainBalance ?? 0) + Number(current?.bonusBalance ?? 0)) * 100),
        currency: e.callbackCurrency,
        player_id: e.userId,
      };
      const [updated] = await tx.update(transactions)
        .set({ metadata: { ...(transaction.metadata ?? {}), callbackResponse } })
        .where(eq(transactions.id, transaction.id))
        .returning();
      return updated;
    };
    const roundBets = () =>
      tx
        .select()
        .from(transactions)
        .where(and(eq(transactions.userId, e.userId), eq(transactions.type, "bet"), sql`${transactions.metadata}->>'roundId' = ${e.roundId}`));

    if (e.action === "bet") {
      if (toCents(w.mainBalance) < cents && toCents(w.bonusBalance) < cents) throw new ApiError(400, "Insufficient balance.", "INSUFFICIENT_FUNDS");
      const useMain = toCents(w.mainBalance) >= cents;
      const t = await applyLedger(tx, { userId: e.userId, balanceType: useMain ? "main" : "bonus", amountCents: -cents, type: "bet", description: `Bet${on}`, externalRef: ext, metadata: meta });
      await recordWager(tx, e.userId, cents);
      return { duplicate: false, transaction: await rememberCallbackReply(t) };
    }

    if (e.action === "win") {
      const bets = await roundBets();
      const toBonus = bets.length > 0 && bets.every((b) => b.balanceType === "bonus");
      const t = await applyLedger(tx, { userId: e.userId, balanceType: toBonus ? "bonus" : "main", amountCents: cents, type: "win", description: `Win${on}`, externalRef: ext, metadata: meta });
      return { duplicate: false, transaction: await rememberCallbackReply(t) };
    }

    // rollback — reverse the specific bet (by provider transactionId) or all bets of the round
    const originalId = e.originalTransactionId ?? (e.idempotencyScope ? undefined : e.transactionId);
    const bets = (await roundBets()).filter((b) => (originalId ? b.externalRef === gameExternalRef("bet", originalId, e.idempotencyScope) || (b.metadata?.transactionId === originalId && b.metadata?.idempotencyScope === e.idempotencyScope) : !e.idempotencyScope) && b.status !== "reversed");
    if (!bets.length) return { duplicate: false, transaction: null }; // nothing to roll back (bet never arrived)
    let last: TxRow | null = null;
    for (const b of bets) {
      last = await applyLedger(tx, {
        userId: e.userId,
        balanceType: b.balanceType,
        amountCents: -toCents(b.amount),
        type: "refund",
        description: `Bet rollback${on}`,
        externalRef: bets.length === 1 ? ext : `${ext}:${b.id}`,
        relatedType: "transaction",
        relatedId: b.id,
        metadata: meta,
      });
      await tx.update(transactions).set({ status: "reversed" }).where(eq(transactions.id, b.id));
    }
    return { duplicate: false, transaction: await rememberCallbackReply(last) };
  });
}
