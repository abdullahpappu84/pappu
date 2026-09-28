import "server-only";
import { and, eq, isNull, gt } from "drizzle-orm";
import { z } from "zod";
import { db, type Tx } from "@/db";
import { agents, profiles, referrals, users, verificationTokens, vipLevels, vipUsers, wallets } from "@/db/schema";
import { genReferralCode, randomCode, randomToken, sha256 } from "./crypto";
import { grantRegistrationBonus } from "./finance";
import { badRequest } from "./http";
import { notify } from "./ledger";
import { appUrl, devTokensExposed, sendEmail, sendSms } from "./mailer";
import { getSettings } from "./settings";

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128)
  .regex(/[A-Za-z]/, "Password must contain a letter")
  .regex(/\d/, "Password must contain a number");
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9\s-]{7,20}$/, "Enter a valid phone number")
  .transform((v) => v.replace(/[\s-]/g, ""));

export async function createUserAccount(
  tx: Tx,
  input: { name: string; email: string; phone?: string | null; passwordHash?: string | null; referralCode?: string | null; googleId?: string; facebookId?: string; avatarUrl?: string; emailVerified?: boolean },
) {
  let referrerId: string | null = null;
  let agentId: number | null = null;
  const code = input.referralCode?.trim().toUpperCase();
  const s = await getSettings();
  if (code && s.referral.enabled) {
    const [ref] = await tx.select({ id: users.id, disabled: users.referralDisabled }).from(users).where(eq(users.referralCode, code));
    if (ref && !ref.disabled) referrerId = ref.id;
    else {
      const [ag] = await tx.select().from(agents).where(and(eq(agents.code, code), eq(agents.status, "active")));
      if (ag) agentId = ag.id;
      else if (!ref) throw badRequest("Referral code not found.");
    }
  }
  let referral = genReferralCode();
  for (let i = 0; i < 5; i++) {
    const [clash] = await tx.select({ id: users.id }).from(users).where(eq(users.referralCode, referral));
    if (!clash) break;
    referral = genReferralCode();
  }
  const [user] = await tx
    .insert(users)
    .values({
      name: input.name,
      email: input.email.toLowerCase(),
      phone: input.phone || null,
      passwordHash: input.passwordHash ?? null,
      referralCode: referral,
      referredById: referrerId,
      googleId: input.googleId,
      facebookId: input.facebookId,
      avatarUrl: input.avatarUrl,
      emailVerifiedAt: input.emailVerified ? new Date() : null,
    })
    .returning();
  await tx.insert(profiles).values({ userId: user.id, currency: s.locale.currency, language: s.locale.language });
  await tx.insert(wallets).values({ userId: user.id, currency: s.locale.currency });
  const [base] = await tx.select().from(vipLevels).orderBy(vipLevels.minPoints).limit(1);
  await tx.insert(vipUsers).values({ userId: user.id, levelId: base?.id ?? null });
  if (referrerId || agentId) {
    await tx.insert(referrals).values({ referrerId, agentId, referredId: user.id });
    if (referrerId) await notify(tx, referrerId, { type: "system", title: "New referral joined!", body: `${input.name} signed up with your code.`, link: "/account?tab=referrals" });
  }
  await notify(tx, user.id, { type: "system", title: `Welcome to ${s.site.name}!`, body: "Your account is ready. Make your first deposit to claim the welcome bonus.", link: "/account?tab=deposit" });
  await grantRegistrationBonus(tx, user.id);
  return user;
}

type VType = "email_verify" | "password_reset" | "phone_verify";

async function storeToken(userId: string, type: VType, secret: string, ttlMin: number, target?: string) {
  await db.update(verificationTokens).set({ usedAt: new Date() }).where(and(eq(verificationTokens.userId, userId), eq(verificationTokens.type, type), isNull(verificationTokens.usedAt)));
  await db.insert(verificationTokens).values({ userId, type, tokenHash: sha256(`${type}:${secret}`), target, expiresAt: new Date(Date.now() + ttlMin * 60000) });
}

export async function consumeToken(type: VType, secret: string, userId?: string) {
  const [row] = await db
    .select()
    .from(verificationTokens)
    .where(and(eq(verificationTokens.tokenHash, sha256(`${type}:${secret}`)), isNull(verificationTokens.usedAt), gt(verificationTokens.expiresAt, new Date())));
  if (!row || (userId && row.userId !== userId)) return null;
  await db.update(verificationTokens).set({ usedAt: new Date() }).where(eq(verificationTokens.id, row.id));
  return row;
}

export async function sendEmailVerification(user: { id: string; email: string; name: string }, req: Request) {
  const token = randomToken(24);
  await storeToken(user.id, "email_verify", token, 60 * 24, user.email);
  const link = `${appUrl(req)}/auth/verify-email?token=${token}`;
  const { delivered } = await sendEmail(user.email, "Verify your email", `Hi ${user.name},\n\nConfirm your email address: ${link}\n\nThis link expires in 24 hours.`);
  return !delivered && devTokensExposed() ? { devLink: link } : {};
}

export async function sendPasswordReset(user: { id: string; email: string; name: string }, req: Request) {
  const token = randomToken(24);
  await storeToken(user.id, "password_reset", token, 60, user.email);
  const link = `${appUrl(req)}/auth/reset-password?token=${token}`;
  const { delivered } = await sendEmail(user.email, "Reset your password", `Hi ${user.name},\n\nReset your password: ${link}\n\nThis link expires in 1 hour. If you didn't request it, ignore this email.`);
  return !delivered && devTokensExposed() ? { devLink: link } : {};
}

export async function sendPhoneCode(user: { id: string }, phone: string) {
  const code = randomCode(6);
  await storeToken(user.id, "phone_verify", code, 10, phone);
  const { delivered } = await sendSms(phone, `Your verification code is ${code}. It expires in 10 minutes.`);
  return !delivered && devTokensExposed() ? { devCode: code } : {};
}
