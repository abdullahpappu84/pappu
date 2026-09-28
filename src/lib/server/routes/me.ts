import "server-only";
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import QRCode from "qrcode";
import { z } from "zod";
import { db } from "@/db";
import {
  bonuses,
  commissions,
  deposits,
  favorites,
  games,
  kycSubmissions,
  notifications,
  paymentMethods,
  profiles,
  recentlyPlayed,
  referrals,
  sessions,
  supportMessages,
  supportTickets,
  transactions,
  userBonuses,
  users,
  vipLevels,
  vipUsers,
  wallets,
  withdrawals,
} from "@/db/schema";
import { requireUser, type UserRow } from "@/lib/server/auth";
import { buildSessionUser, loadGames } from "@/lib/server/catalog";
import { decrypt, encrypt, generateRecoveryCodes, generateTotpSecret, genReference, hashPassword, totpUri, verifyPassword, verifyTotp } from "@/lib/server/crypto";
import { cancelDeposit, cancelWithdrawal, createDeposit, createWithdrawal, redeemPromoStandalone, validatePromo } from "@/lib/server/finance";
import { ApiError, assertSameOrigin, badRequest, conflict, errorResponse, matchRoute, notFound, pageParams, query, rateLimit, readJson, toResponse, type Route } from "@/lib/server/http";
import { applyLedger, expireBonuses, fromCents, lockWallet, notify, toCents } from "@/lib/server/ledger";
import { appUrl } from "@/lib/server/mailer";
import { getSettings } from "@/lib/server/settings";
import { saveUpload } from "@/lib/server/storage";
import { passwordSchema, phoneSchema } from "@/lib/server/users";
import { launchGame } from "@/lib/server/games/launch";
import { resolvePaymentAdapter } from "@/lib/server/payments";

type C = { user: UserRow; sessionId: string };
type TxTypeValue = (typeof transactions.$inferSelect)["type"];

const TX_GROUPS: Record<string, TxTypeValue[]> = {
  deposit: ["deposit"],
  withdrawal: ["withdrawal"],
  bonus: ["bonus", "bonus_conversion", "bonus_forfeit"],
  cashback: ["cashback"],
  refund: ["refund"],
  adjustment: ["adjustment"],
  commission: ["commission"],
  game: ["bet", "win"],
};

export function dateRange(col: Parameters<typeof gte>[0], from?: string | null, to?: string | null) {
  const out: SQL[] = [];
  if (from && !Number.isNaN(Date.parse(from))) out.push(gte(col, new Date(from)));
  if (to && !Number.isNaN(Date.parse(to))) out.push(lte(col, new Date(`${to}T23:59:59.999Z`)));
  return out;
}

async function gameBySlug(slug: string) {
  const [g] = await db.select().from(games).where(eq(games.slug, slug));
  if (!g || g.status === "inactive") throw notFound("Game not found.");
  return g;
}

export async function formData(req: Request) {
  try {
    return await req.formData();
  } catch {
    throw badRequest("Invalid form submission.");
  }
}

const vipSummary = async (userId: string) => {
  const [levels, [vip]] = await Promise.all([db.select().from(vipLevels).orderBy(asc(vipLevels.level)), db.select().from(vipUsers).where(eq(vipUsers.userId, userId))]);
  const points = vip?.points ?? 0;
  const current = [...levels].reverse().find((l) => l.minPoints <= points) ?? levels[0];
  const next = levels.find((l) => l.minPoints > points) ?? null;
  const progress = next && current ? Math.min(100, Math.round(((points - current.minPoints) / (next.minPoints - current.minPoints)) * 100)) : 100;
  return { levels, current, next, points, lifetimePoints: vip?.lifetimePoints ?? 0, progress, pointsToNext: next ? next.minPoints - points : 0 };
};

const activeChat = (userId: string) =>
  db
    .select()
    .from(supportTickets)
    .where(and(eq(supportTickets.userId, userId), eq(supportTickets.channel, "chat"), inArray(supportTickets.status, ["open", "pending", "in_progress"])))
    .orderBy(desc(supportTickets.createdAt))
    .limit(1);

const restricted = (user: UserRow) => {
  if (user.status !== "active") throw new ApiError(403, "Your account is restricted. Please contact support.", "ACCOUNT_RESTRICTED");
};

const routes: Route<C>[] = [
  /* ------------------------------ dashboard & profile ------------------------------ */
  {
    method: "GET",
    path: "dashboard",
    handler: async ({ user }) => {
      await db.transaction((tx) => expireBonuses(tx, user.id));
      const [session, recentTx, activeBonuses, notes, [{ refs }], [prof]] = await Promise.all([
        buildSessionUser(user),
        db.select().from(transactions).where(eq(transactions.userId, user.id)).orderBy(desc(transactions.createdAt)).limit(6),
        db.select().from(userBonuses).where(and(eq(userBonuses.userId, user.id), eq(userBonuses.status, "active"))),
        db.select().from(notifications).where(eq(notifications.userId, user.id)).orderBy(desc(notifications.createdAt)).limit(5),
        db.select({ refs: count() }).from(referrals).where(eq(referrals.referrerId, user.id)),
        db.select().from(profiles).where(eq(profiles.userId, user.id)),
      ]);
      return { user: session, profile: prof ?? null, recentTransactions: recentTx, activeBonuses, notifications: notes, referrals: refs, memberSince: user.createdAt };
    },
  },
  {
    method: "PATCH",
    path: "profile",
    handler: async ({ req, user }) => {
      const b = await readJson(
        req,
        z.object({
          name: z.string().trim().min(2).max(120).optional(),
          phone: z.union([phoneSchema, z.literal("")]).optional(),
          dateOfBirth: z.string().max(16).optional(),
          country: z.string().max(64).optional(),
          city: z.string().max(64).optional(),
          address: z.string().max(300).optional(),
          postalCode: z.string().max(16).optional(),
          language: z.string().max(8).optional(),
          marketingOptIn: z.boolean().optional(),
        }),
      );
      const patch: Partial<UserRow> = { updatedAt: new Date() };
      if (b.name) patch.name = b.name;
      if (b.phone !== undefined && (b.phone || null) !== user.phone) {
        if (b.phone) {
          const [dup] = await db.select({ id: users.id }).from(users).where(and(eq(users.phone, b.phone), ne(users.id, user.id)));
          if (dup) throw conflict("This phone number is linked to another account.");
        }
        patch.phone = b.phone || null;
        patch.phoneVerifiedAt = null;
      }
      await db.update(users).set(patch).where(eq(users.id, user.id));
      const { name: _n, phone: _p, ...prof } = b;
      void _n;
      void _p;
      await db.insert(profiles).values({ userId: user.id, ...prof }).onConflictDoUpdate({ target: profiles.userId, set: { ...prof, updatedAt: new Date() } });
      const [u] = await db.select().from(users).where(eq(users.id, user.id));
      return { user: await buildSessionUser(u) };
    },
  },
  {
    method: "POST",
    path: "avatar",
    handler: async ({ req, user }) => {
      rateLimit(`avatar:${user.id}`, 10, 60 * 60 * 1000);
      const fd = await formData(req);
      const url = await saveUpload(fd.get("file"), { folder: "avatars", visibility: "public", maxBytes: 2 * 1024 * 1024 });
      const [u] = await db.update(users).set({ avatarUrl: url, updatedAt: new Date() }).where(eq(users.id, user.id)).returning();
      return { user: await buildSessionUser(u) };
    },
  },
  {
    method: "POST",
    path: "password",
    handler: async ({ req, user, sessionId }) => {
      rateLimit(`pw:${user.id}`, 6, 15 * 60 * 1000);
      const b = await readJson(req, z.object({ currentPassword: z.string().optional(), newPassword: passwordSchema }));
      if (user.passwordHash && !(await verifyPassword(b.currentPassword ?? "", user.passwordHash))) throw badRequest("Current password is incorrect.");
      await db.update(users).set({ passwordHash: await hashPassword(b.newPassword), updatedAt: new Date() }).where(eq(users.id, user.id));
      await db.delete(sessions).where(and(eq(sessions.userId, user.id), ne(sessions.id, sessionId)));
      await notify(db, user.id, { type: "security", title: "Your password was changed", body: "Other sessions have been signed out." });
      return { ok: true };
    },
  },
  {
    method: "GET",
    path: "sessions",
    handler: async ({ user, sessionId }) => {
      const rows = await db.select().from(sessions).where(eq(sessions.userId, user.id)).orderBy(desc(sessions.lastSeenAt));
      return { items: rows.map((s) => ({ id: s.id.slice(0, 16), ip: s.ip, userAgent: s.userAgent, createdAt: s.createdAt, lastSeenAt: s.lastSeenAt, current: s.id === sessionId })) };
    },
  },
  {
    method: "DELETE",
    path: "sessions/:id",
    handler: async ({ user, params, sessionId }) => {
      if (sessionId.startsWith(params.id)) throw badRequest("Use Sign out to end your current session.");
      await db.delete(sessions).where(and(eq(sessions.userId, user.id), sql`left(${sessions.id}, 16) = ${params.id}`));
      return { ok: true };
    },
  },
  {
    method: "POST",
    path: "sessions/revoke-others",
    handler: async ({ user, sessionId }) => {
      await db.delete(sessions).where(and(eq(sessions.userId, user.id), ne(sessions.id, sessionId)));
      return { ok: true };
    },
  },
  /* ------------------------------ 2FA ------------------------------ */
  {
    method: "POST",
    path: "2fa/setup",
    handler: async ({ user }) => {
      if (user.twoFactorEnabled) throw badRequest("Two-factor authentication is already enabled.");
      const s = await getSettings();
      const secret = generateTotpSecret();
      await db.update(users).set({ twoFactorTempSecret: encrypt(secret) }).where(eq(users.id, user.id));
      return { secret, qr: await QRCode.toDataURL(totpUri(secret, user.email, s.site.name), { margin: 1, width: 220 }) };
    },
  },
  {
    method: "POST",
    path: "2fa/enable",
    handler: async ({ req, user }) => {
      rateLimit(`2fae:${user.id}`, 10, 10 * 60 * 1000);
      const b = await readJson(req, z.object({ code: z.string().trim() }));
      const secret = decrypt(user.twoFactorTempSecret);
      if (!secret || !verifyTotp(secret, b.code)) throw badRequest("Invalid code. Check your authenticator app and try again.");
      const { codes, hashes } = generateRecoveryCodes();
      await db.update(users).set({ twoFactorEnabled: true, twoFactorSecret: encrypt(secret), twoFactorTempSecret: null, recoveryCodes: hashes }).where(eq(users.id, user.id));
      await notify(db, user.id, { type: "security", title: "Two-factor authentication enabled" });
      return { recoveryCodes: codes };
    },
  },
  {
    method: "POST",
    path: "2fa/disable",
    handler: async ({ req, user }) => {
      rateLimit(`2fad:${user.id}`, 6, 10 * 60 * 1000);
      const b = await readJson(req, z.object({ password: z.string().optional(), code: z.string().trim() }));
      if (user.passwordHash && !(await verifyPassword(b.password ?? "", user.passwordHash))) throw badRequest("Password is incorrect.");
      const secret = decrypt(user.twoFactorSecret);
      if (!secret || !verifyTotp(secret, b.code)) throw badRequest("Invalid authentication code.");
      await db.update(users).set({ twoFactorEnabled: false, twoFactorSecret: null, recoveryCodes: null }).where(eq(users.id, user.id));
      await notify(db, user.id, { type: "security", title: "Two-factor authentication disabled" });
      return { ok: true };
    },
  },
  {
    method: "POST",
    path: "2fa/recovery",
    handler: async ({ req, user }) => {
      const b = await readJson(req, z.object({ code: z.string().trim() }));
      const secret = decrypt(user.twoFactorSecret);
      if (!secret || !verifyTotp(secret, b.code)) throw badRequest("Invalid authentication code.");
      const { codes, hashes } = generateRecoveryCodes();
      await db.update(users).set({ recoveryCodes: hashes }).where(eq(users.id, user.id));
      return { recoveryCodes: codes };
    },
  },
  /* ------------------------------ wallet & ledger ------------------------------ */
  {
    method: "GET",
    path: "wallet",
    handler: async ({ user }) => {
      await db.transaction((tx) => expireBonuses(tx, user.id));
      const [[w], [pending]] = await Promise.all([
        db.select().from(wallets).where(eq(wallets.userId, user.id)),
        db
          .select({ total: sql<string>`coalesce(sum(${withdrawals.amount}),0)` })
          .from(withdrawals)
          .where(and(eq(withdrawals.userId, user.id), inArray(withdrawals.status, ["pending", "processing", "approved"]))),
      ]);
      return { mainBalance: w?.mainBalance ?? "0.00", bonusBalance: w?.bonusBalance ?? "0.00", currency: w?.currency ?? "EUR", pendingWithdrawals: pending.total };
    },
  },
  {
    method: "GET",
    path: "transactions",
    handler: async ({ req, user }) => {
      const q = query(req);
      const { page, pageSize, offset } = pageParams(req, 15);
      const conds: SQL[] = [eq(transactions.userId, user.id), ...dateRange(transactions.createdAt, q.get("from"), q.get("to"))];
      const type = q.get("type");
      if (type && TX_GROUPS[type]) conds.push(inArray(transactions.type, TX_GROUPS[type]));
      const status = q.get("status");
      if (status && ["pending", "completed", "failed", "reversed"].includes(status)) conds.push(eq(transactions.status, status as "completed"));
      const search = q.get("q")?.trim();
      if (search) conds.push(or(ilike(transactions.reference, `%${search}%`), ilike(transactions.description, `%${search}%`))!);
      const where = and(...conds);
      const [items, [{ total }]] = await Promise.all([
        db.select().from(transactions).where(where).orderBy(desc(transactions.createdAt)).limit(pageSize).offset(offset),
        db.select({ total: count() }).from(transactions).where(where),
      ]);
      return { items, total, page, pageSize };
    },
  },
  {
    method: "GET",
    path: "payment-methods",
    handler: async ({ req }) => {
      const dir = query(req).get("direction") === "withdrawal" ? "withdrawal" : "deposit";
      const s = await getSettings();
      const rows = await db
        .select()
        .from(paymentMethods)
        .where(and(eq(paymentMethods.isActive, true), inArray(paymentMethods.direction, [dir, "both"])))
        .orderBy(asc(paymentMethods.sortOrder));
      const depositBonuses =
        dir === "deposit"
          ? await db
              .select({ id: bonuses.id, name: bonuses.name, description: bonuses.description, percentage: bonuses.percentage, minDeposit: bonuses.minDeposit, maxBonus: bonuses.maxBonus, wageringMultiplier: bonuses.wageringMultiplier })
              .from(bonuses)
              .where(and(eq(bonuses.isActive, true), eq(bonuses.type, "deposit")))
          : [];
      return {
        items: (await Promise.all(rows.map(async (pm) => ({ pm, a: await resolvePaymentAdapter(pm.adapter) }))))
          .filter(({ a }) => a.isConfigured())
          .map(({ pm, a }) => ({ ...pm, adapter: undefined, online: a.kind === "gateway" })),
        limits: dir === "deposit" ? s.deposit : s.withdrawal,
        bonuses: depositBonuses,
      };
    },
  },
  {
    method: "GET",
    path: "deposits",
    handler: async ({ req, user }) => {
      const { page, pageSize, offset } = pageParams(req, 10);
      const where = eq(deposits.userId, user.id);
      const [items, [{ total }]] = await Promise.all([
        db.select({ d: deposits, method: paymentMethods.name }).from(deposits).leftJoin(paymentMethods, eq(paymentMethods.id, deposits.paymentMethodId)).where(where).orderBy(desc(deposits.createdAt)).limit(pageSize).offset(offset),
        db.select({ total: count() }).from(deposits).where(where),
      ]);
      return { items: items.map((r) => ({ ...r.d, method: r.method })), total, page, pageSize };
    },
  },
  {
    method: "POST",
    path: "deposits",
    handler: async ({ req, user }) => {
      restricted(user);
      rateLimit(`dep:${user.id}`, 10, 60 * 60 * 1000);
      const fd = await formData(req);
      const b = z
        .object({
          paymentMethodId: z.coerce.number().int().positive(),
          amount: z.coerce.number().positive().max(1_000_000),
          promoCode: z.string().trim().max(40).optional(),
          bonusId: z.coerce.number().int().positive().optional(),
          note: z.string().max(500).optional(),
          idempotencyKey: z.string().max(80).optional(),
        })
        .parse(Object.fromEntries([...fd.entries()].filter(([k, v]) => k !== "proof" && typeof v === "string" && v !== "")));
      const proof = fd.get("proof");
      const proofUrl = proof instanceof File && proof.size > 0 ? await saveUpload(proof, { folder: "proofs", visibility: "private", allowPdf: true }) : null;
      return createDeposit(user, { ...b, proofUrl, baseUrl: appUrl(req) });
    },
  },
  { method: "POST", path: "deposits/:id/cancel", handler: ({ user, params }) => cancelDeposit(user.id, params.id) },
  {
    method: "GET",
    path: "withdrawals",
    handler: async ({ req, user }) => {
      const { page, pageSize, offset } = pageParams(req, 10);
      const where = eq(withdrawals.userId, user.id);
      const [items, [{ total }]] = await Promise.all([
        db.select({ w: withdrawals, method: paymentMethods.name }).from(withdrawals).leftJoin(paymentMethods, eq(paymentMethods.id, withdrawals.paymentMethodId)).where(where).orderBy(desc(withdrawals.createdAt)).limit(pageSize).offset(offset),
        db.select({ total: count() }).from(withdrawals).where(where),
      ]);
      return { items: items.map((r) => ({ ...r.w, method: r.method })), total, page, pageSize };
    },
  },
  {
    method: "POST",
    path: "withdrawals",
    handler: async ({ req, user }) => {
      restricted(user);
      rateLimit(`wd:${user.id}`, 10, 60 * 60 * 1000);
      const b = await readJson(
        req,
        z.object({
          paymentMethodId: z.number().int().positive(),
          amount: z.number().positive().max(1_000_000),
          details: z.record(z.string(), z.string().max(200)).default({}),
          note: z.string().max(500).optional(),
          idempotencyKey: z.string().max(80).optional(),
        }),
      );
      return createWithdrawal(user, b);
    },
  },
  { method: "POST", path: "withdrawals/:id/cancel", handler: ({ user, params }) => cancelWithdrawal(user.id, params.id) },
  /* ------------------------------ games ------------------------------ */
  {
    method: "GET",
    path: "favorites",
    handler: async ({ user }) => {
      const favs = await db.select({ gameId: favorites.gameId }).from(favorites).where(eq(favorites.userId, user.id)).orderBy(desc(favorites.createdAt));
      if (!favs.length) return { items: [] };
      const list = await loadGames(inArray(games.id, favs.map((f) => f.gameId)));
      return { items: favs.map((f) => list.find((g) => g.dbId === f.gameId)).filter(Boolean) };
    },
  },
  {
    method: "POST",
    path: "favorites",
    handler: async ({ req, user }) => {
      const { slug } = await readJson(req, z.object({ slug: z.string().min(1).max(120) }));
      const g = await gameBySlug(slug);
      await db.insert(favorites).values({ userId: user.id, gameId: g.id }).onConflictDoNothing();
      return { ok: true };
    },
  },
  {
    method: "DELETE",
    path: "favorites/:slug",
    handler: async ({ user, params }) => {
      const g = await gameBySlug(params.slug);
      await db.delete(favorites).where(and(eq(favorites.userId, user.id), eq(favorites.gameId, g.id)));
      return { ok: true };
    },
  },
  {
    method: "GET",
    path: "recent",
    handler: async ({ user }) => {
      const rec = await db.select().from(recentlyPlayed).where(eq(recentlyPlayed.userId, user.id)).orderBy(desc(recentlyPlayed.lastPlayedAt)).limit(24);
      if (!rec.length) return { items: [] };
      const list = await loadGames(inArray(games.id, rec.map((r) => r.gameId)));
      return { items: rec.map((r) => ({ game: list.find((g) => g.dbId === r.gameId), lastPlayedAt: r.lastPlayedAt, playCount: r.playCount })).filter((r) => r.game) };
    },
  },
  {
    method: "POST",
    path: "play",
    handler: async ({ req, user }) => {
      const b = await readJson(req, z.object({ slug: z.string().min(1).max(120), mode: z.enum(["real", "demo"]).default("real"), device: z.enum(["desktop", "mobile"]).default("desktop") }));
      return launchGame(req, { ...b, user });
    },
  },
  /* ------------------------------ bonuses / promo / wagering ------------------------------ */
  {
    method: "GET",
    path: "bonuses",
    handler: async ({ user }) => {
      await db.transaction((tx) => expireBonuses(tx, user.id));
      const rows = await db.select().from(userBonuses).where(eq(userBonuses.userId, user.id)).orderBy(desc(userBonuses.createdAt)).limit(50);
      const items = rows.map((b) => {
        const req = toCents(b.wageringRequired);
        const done = toCents(b.wageringCompleted);
        return { ...b, remaining: fromCents(Math.max(0, req - done)), progress: req > 0 ? Math.min(100, Math.round((done / req) * 100)) : 100 };
      });
      const available = await db.select().from(bonuses).where(and(eq(bonuses.isActive, true), eq(bonuses.type, "deposit")));
      return { items, available };
    },
  },
  {
    method: "POST",
    path: "bonuses/:id/forfeit",
    handler: async ({ user, params }) =>
      db.transaction(async (tx) => {
        const [b] = await tx.select().from(userBonuses).where(and(eq(userBonuses.id, params.id), eq(userBonuses.userId, user.id))).for("update");
        if (!b || b.status !== "active") throw conflict("Only active bonuses can be forfeited.");
        await tx.update(userBonuses).set({ status: "forfeited" }).where(eq(userBonuses.id, b.id));
        const w = await lockWallet(tx, user.id);
        const amt = Math.min(toCents(b.amount), toCents(w.bonusBalance));
        if (amt > 0) await applyLedger(tx, { userId: user.id, balanceType: "bonus", amountCents: -amt, type: "bonus_forfeit", description: `Bonus forfeited: ${b.name}`, relatedType: "user_bonus", relatedId: b.id });
        return { ok: true };
      }),
  },
  {
    method: "POST",
    path: "promo/validate",
    handler: async ({ req, user }) => {
      rateLimit(`promo:${user.id}`, 20, 10 * 60 * 1000);
      const b = await readJson(req, z.object({ code: z.string().trim().min(2).max(40), amount: z.number().positive().optional() }));
      return validatePromo(user.id, b.code, b.amount);
    },
  },
  {
    method: "POST",
    path: "promo/redeem",
    handler: async ({ req, user }) => {
      restricted(user);
      rateLimit(`promo:${user.id}`, 20, 10 * 60 * 1000);
      const b = await readJson(req, z.object({ code: z.string().trim().min(2).max(40) }));
      return { ok: true, bonus: await redeemPromoStandalone(user.id, b.code) };
    },
  },
  /* ------------------------------ VIP & referrals ------------------------------ */
  { method: "GET", path: "vip", handler: ({ user }) => vipSummary(user.id) },
  {
    method: "GET",
    path: "referrals",
    handler: async ({ req, user }) => {
      const s = await getSettings();
      const refs = await db
        .select({ id: referrals.id, name: users.name, createdAt: referrals.createdAt, status: referrals.status, userId: users.id })
        .from(referrals)
        .innerJoin(users, eq(users.id, referrals.referredId))
        .where(eq(referrals.referrerId, user.id))
        .orderBy(desc(referrals.createdAt));
      const depositors = refs.length
        ? await db.selectDistinct({ userId: deposits.userId }).from(deposits).where(and(inArray(deposits.userId, refs.map((r) => r.userId)), eq(deposits.status, "approved")))
        : [];
      const active = new Set(depositors.map((d) => d.userId));
      const comms = await db.select().from(commissions).where(eq(commissions.referrerId, user.id)).orderBy(desc(commissions.createdAt)).limit(50);
      const sum = (st: string[]) => fromCents(comms.filter((c) => st.includes(c.status)).reduce((a, c) => a + toCents(c.amount), 0));
      const mask = (n: string) => (n.length <= 2 ? n : `${n[0]}${"*".repeat(Math.min(6, n.length - 2))}${n[n.length - 1]}`);
      return {
        enabled: s.referral.enabled && !user.referralDisabled,
        code: user.referralCode,
        link: `${appUrl(req)}/?ref=${user.referralCode}`,
        commissionPercent: s.referral.commissionPercent,
        totalReferrals: refs.length,
        activeReferrals: active.size,
        commissionPaid: sum(["paid"]),
        commissionPending: sum(["pending", "approved"]),
        referred: refs.map((r) => ({ id: r.id, name: mask(r.name), createdAt: r.createdAt, active: active.has(r.userId) })),
        commissions: comms,
      };
    },
  },
  /* ------------------------------ notifications ------------------------------ */
  {
    method: "GET",
    path: "notifications",
    handler: async ({ req, user }) => {
      const { page, pageSize, offset } = pageParams(req, 20);
      const where = eq(notifications.userId, user.id);
      const [items, [{ total }], [{ unread }]] = await Promise.all([
        db.select().from(notifications).where(where).orderBy(desc(notifications.createdAt)).limit(pageSize).offset(offset),
        db.select({ total: count() }).from(notifications).where(where),
        db.select({ unread: count() }).from(notifications).where(and(where, isNull(notifications.readAt))),
      ]);
      return { items, total, unread, page, pageSize };
    },
  },
  {
    method: "POST",
    path: "notifications/read",
    handler: async ({ req, user }) => {
      const b = await readJson(req, z.object({ ids: z.array(z.string().uuid()).max(100).optional() }));
      const conds = [eq(notifications.userId, user.id), isNull(notifications.readAt)];
      if (b.ids?.length) conds.push(inArray(notifications.id, b.ids));
      await db.update(notifications).set({ readAt: new Date() }).where(and(...conds));
      return { ok: true };
    },
  },
  /* ------------------------------ support ------------------------------ */
  {
    method: "GET",
    path: "tickets",
    handler: async ({ user }) => ({
      items: await db.select().from(supportTickets).where(and(eq(supportTickets.userId, user.id), eq(supportTickets.channel, "ticket"))).orderBy(desc(supportTickets.lastMessageAt)),
    }),
  },
  {
    method: "POST",
    path: "tickets",
    handler: async ({ req, user }) => {
      rateLimit(`ticket:${user.id}`, 10, 60 * 60 * 1000);
      const b = await readJson(req, z.object({ subject: z.string().trim().min(3).max(200), category: z.string().max(40).default("general"), message: z.string().trim().min(5).max(5000) }));
      const [t] = await db.insert(supportTickets).values({ reference: genReference("TKT"), userId: user.id, subject: b.subject, category: b.category }).returning();
      await db.insert(supportMessages).values({ ticketId: t.id, senderType: "user", senderId: user.id, senderName: user.name, body: b.message });
      return { ticket: t };
    },
  },
  {
    method: "GET",
    path: "tickets/:id",
    handler: async ({ user, params }) => {
      const [t] = await db.select().from(supportTickets).where(and(eq(supportTickets.id, params.id), eq(supportTickets.userId, user.id)));
      if (!t) throw notFound("Ticket not found.");
      const msgs = await db.select().from(supportMessages).where(and(eq(supportMessages.ticketId, t.id), eq(supportMessages.isInternal, false))).orderBy(asc(supportMessages.createdAt));
      return { ticket: t, messages: msgs };
    },
  },
  {
    method: "POST",
    path: "tickets/:id/messages",
    handler: async ({ req, user, params }) => {
      rateLimit(`msg:${user.id}`, 40, 10 * 60 * 1000);
      const b = await readJson(req, z.object({ body: z.string().trim().min(1).max(5000) }));
      const [t] = await db.select().from(supportTickets).where(and(eq(supportTickets.id, params.id), eq(supportTickets.userId, user.id)));
      if (!t) throw notFound("Ticket not found.");
      if (t.status === "closed") throw conflict("This ticket is closed. Please open a new one.");
      const [m] = await db.insert(supportMessages).values({ ticketId: t.id, senderType: "user", senderId: user.id, senderName: user.name, body: b.body }).returning();
      const next = t.status === "resolved" ? "open" : t.status === "pending" ? "in_progress" : t.status;
      await db.update(supportTickets).set({ status: next, lastMessageAt: new Date(), updatedAt: new Date() }).where(eq(supportTickets.id, t.id));
      return { message: m };
    },
  },
  {
    method: "POST",
    path: "tickets/:id/close",
    handler: async ({ user, params }) => {
      await db.update(supportTickets).set({ status: "closed", updatedAt: new Date() }).where(and(eq(supportTickets.id, params.id), eq(supportTickets.userId, user.id)));
      return { ok: true };
    },
  },
  {
    method: "GET",
    path: "chat",
    handler: async ({ user }) => {
      const [t] = await activeChat(user.id);
      if (!t) return { ticket: null, messages: [] };
      const msgs = await db.select().from(supportMessages).where(and(eq(supportMessages.ticketId, t.id), eq(supportMessages.isInternal, false))).orderBy(asc(supportMessages.createdAt));
      return { ticket: t, messages: msgs };
    },
  },
  {
    method: "POST",
    path: "chat",
    handler: async ({ req, user }) => {
      rateLimit(`chat:${user.id}`, 60, 10 * 60 * 1000);
      const s = await getSettings();
      if (!s.support.liveChatEnabled) throw conflict("Live chat is currently offline. Please open a support ticket.");
      const b = await readJson(req, z.object({ body: z.string().trim().min(1).max(2000) }));
      let [t] = await activeChat(user.id);
      if (!t) {
        [t] = await db.insert(supportTickets).values({ reference: genReference("CHT"), userId: user.id, subject: b.body.slice(0, 80), channel: "chat", category: "live-chat" }).returning();
        await db.insert(supportMessages).values({ ticketId: t.id, senderType: "system", senderName: s.site.name, body: "Thanks for reaching out! An agent will join the conversation shortly." });
      }
      const [m] = await db.insert(supportMessages).values({ ticketId: t.id, senderType: "user", senderId: user.id, senderName: user.name, body: b.body }).returning();
      await db.update(supportTickets).set({ lastMessageAt: new Date(), updatedAt: new Date(), status: t.status === "pending" ? "in_progress" : t.status }).where(eq(supportTickets.id, t.id));
      return { message: m, ticketId: t.id };
    },
  },
  /* ------------------------------ KYC ------------------------------ */
  {
    method: "GET",
    path: "kyc",
    handler: async ({ user }) => {
      const [latest] = await db.select().from(kycSubmissions).where(eq(kycSubmissions.userId, user.id)).orderBy(desc(kycSubmissions.createdAt)).limit(1);
      return { status: user.kycStatus, submission: latest ?? null };
    },
  },
  {
    method: "POST",
    path: "kyc",
    handler: async ({ req, user }) => {
      rateLimit(`kyc:${user.id}`, 5, 60 * 60 * 1000);
      if (["pending", "under_review", "approved"].includes(user.kycStatus)) throw conflict(`Your verification is already ${user.kycStatus.replace("_", " ")}.`);
      const fd = await formData(req);
      const b = z
        .object({
          fullName: z.string().trim().min(3).max(160),
          dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
          country: z.string().trim().min(2).max(64),
          address: z.string().trim().min(5).max(300),
          documentType: z.enum(["passport", "national_id", "driving_licence"]),
          documentNumber: z.string().trim().min(3).max(64),
        })
        .parse(Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string")));
      const age = (Date.now() - new Date(b.dateOfBirth).getTime()) / (365.25 * 86400000);
      if (!(age >= (await getSettings()).registration.minAge)) throw badRequest("You must meet the minimum age requirement.");
      const opts = { folder: "kyc", visibility: "private" as const, allowPdf: true, maxBytes: 8 * 1024 * 1024 };
      const frontUrl = await saveUpload(fd.get("front"), opts);
      const back = fd.get("back");
      const backUrl = back instanceof File && back.size ? await saveUpload(back, opts) : null;
      const selfie = fd.get("selfie");
      const selfieUrl = selfie instanceof File && selfie.size ? await saveUpload(selfie, { ...opts, allowPdf: false }) : null;
      await db.insert(kycSubmissions).values({ userId: user.id, ...b, frontUrl, backUrl, selfieUrl });
      await db.update(users).set({ kycStatus: "pending" }).where(eq(users.id, user.id));
      return { ok: true };
    },
  },
];

export async function meDispatch(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  try {
    assertSameOrigin(req);
    const { path } = await ctx.params;
    const m = matchRoute(routes, req.method, path);
    if (!m) throw notFound("Endpoint not found.");
    const cur = await requireUser();
    return toResponse(await m.route.handler({ ...cur, req, params: m.params }));
  } catch (e) {
    return errorResponse(e);
  }
}
