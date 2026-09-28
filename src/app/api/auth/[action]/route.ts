import { and, eq, gt, isNull, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { sessions, users, verificationTokens } from "@/db/schema";
import { ensureSeeded } from "@/db/seed";
import { createUserSession, destroyUserSession, getCurrentUser, requireUser } from "@/lib/server/auth";
import { buildSessionUser } from "@/lib/server/catalog";
import { decrypt, hashPassword, sha256, signTicket, verifyPassword, verifyTicket, verifyTotp } from "@/lib/server/crypto";
import { ApiError, assertSameOrigin, badRequest, conflict, errorResponse, forbidden, getIp, rateLimit, readJson, unauthorized } from "@/lib/server/http";
import { getSettings } from "@/lib/server/settings";
import { consumeToken, createUserAccount, passwordSchema, phoneSchema, sendEmailVerification, sendPasswordReset, sendPhoneCode } from "@/lib/server/users";

export const dynamic = "force-dynamic";

const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(255);

async function sessionResponse(userId: string) {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  return NextResponse.json({ user: await buildSessionUser(u) });
}

async function finishLogin(u: typeof users.$inferSelect, req: Request) {
  if (u.status === "banned") throw forbidden("This account has been banned. Contact support for details.", "BANNED");
  await createUserSession(u.id, req);
  return sessionResponse(u.id);
}

type Ctx = { params: Promise<{ action: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { action } = await params;
    if (action !== "session") throw new ApiError(404, "Not found");
    await ensureSeeded();
    const cur = await getCurrentUser();
    return NextResponse.json({ user: cur ? await buildSessionUser(cur.user) : null });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    assertSameOrigin(req);
    await ensureSeeded();
    const { action } = await params;
    const ip = getIp(req);

    switch (action) {
      case "register": {
        rateLimit(`register:${ip}`, 8, 60 * 60 * 1000);
        const s = await getSettings();
        if (!s.registration.enabled) throw forbidden("Registration is temporarily closed.");
        const body = await readJson(
          req,
          z.object({
            name: z.string().trim().min(2, "Enter your full name").max(120),
            email,
            phone: s.registration.requirePhone ? phoneSchema : z.union([phoneSchema, z.literal("")]).optional(),
            password: passwordSchema,
            referralCode: z.string().trim().max(24).optional(),
            acceptTerms: z.literal(true, { message: "You must accept the terms and confirm you are 18+" }),
          }),
        );
        const [dupEmail] = await db.select({ id: users.id }).from(users).where(eq(users.email, body.email));
        if (dupEmail) throw conflict("An account with this email already exists.");
        if (body.phone) {
          const [dupPhone] = await db.select({ id: users.id }).from(users).where(eq(users.phone, body.phone));
          if (dupPhone) throw conflict("An account with this phone number already exists.");
        }
        const passwordHash = await hashPassword(body.password);
        const user = await db.transaction((tx) =>
          createUserAccount(tx, { name: body.name, email: body.email, phone: body.phone || null, passwordHash, referralCode: body.referralCode || null }),
        );
        const dev = await sendEmailVerification(user, req);
        await createUserSession(user.id, req);
        const res = await sessionResponse(user.id);
        const data = await res.json();
        return NextResponse.json({ ...data, ...dev, verificationRequired: s.registration.requireEmailVerification });
      }

      case "login": {
        const body = await readJson(req, z.object({ email: z.string().trim().toLowerCase().min(3), password: z.string().min(1).max(128) }));
        rateLimit(`login:${ip}`, 20, 15 * 60 * 1000);
        rateLimit(`login:${body.email}`, 8, 15 * 60 * 1000);
        const isPhone = /^\+?[0-9\s-]{7,20}$/.test(body.email);
        const [u] = await db.select().from(users).where(isPhone ? eq(users.phone, body.email.replace(/[\s-]/g, "")) : eq(users.email, body.email));
        const ok = await verifyPassword(body.password, u?.passwordHash);
        if (!u || !ok) throw unauthorized("Incorrect email or password.");
        const s = await getSettings();
        if (s.registration.requireEmailVerification && !u.emailVerifiedAt) {
          const dev = await sendEmailVerification(u, req);
          throw new ApiError(403, "Please verify your email first. We've sent you a new link.", "EMAIL_UNVERIFIED", dev);
        }
        if (u.twoFactorEnabled) return NextResponse.json({ requires2fa: true, ticket: signTicket({ uid: u.id, k: "user-2fa" }, 300) });
        return finishLogin(u, req);
      }

      case "login-2fa": {
        const body = await readJson(req, z.object({ ticket: z.string().min(10), code: z.string().trim().min(6).max(16) }));
        rateLimit(`2fa:${ip}`, 10, 10 * 60 * 1000);
        const t = verifyTicket<{ uid: string; k: string }>(body.ticket);
        if (!t || t.k !== "user-2fa") throw unauthorized("Your login session expired. Please sign in again.");
        const [u] = await db.select().from(users).where(eq(users.id, t.uid));
        if (!u) throw unauthorized();
        const secret = decrypt(u.twoFactorSecret);
        let ok = secret ? verifyTotp(secret, body.code) : false;
        if (!ok && u.recoveryCodes?.length) {
          const h = sha256(body.code.toUpperCase());
          if (u.recoveryCodes.includes(h)) {
            ok = true;
            await db.update(users).set({ recoveryCodes: u.recoveryCodes.filter((c) => c !== h) }).where(eq(users.id, u.id));
          }
        }
        if (!ok) throw unauthorized("Invalid authentication code.");
        return finishLogin(u, req);
      }

      case "logout":
        await destroyUserSession();
        return NextResponse.json({ ok: true });

      case "forgot-password": {
        rateLimit(`forgot:${ip}`, 6, 60 * 60 * 1000);
        const body = await readJson(req, z.object({ email }));
        const [u] = await db.select().from(users).where(eq(users.email, body.email));
        const dev = u && u.status !== "banned" ? await sendPasswordReset(u, req) : {};
        return NextResponse.json({ ok: true, message: "If an account exists for that email, a reset link has been sent.", ...dev });
      }

      case "reset-password": {
        rateLimit(`reset:${ip}`, 10, 60 * 60 * 1000);
        const body = await readJson(req, z.object({ token: z.string().min(10), password: passwordSchema }));
        const tok = await consumeToken("password_reset", body.token);
        if (!tok) throw badRequest("This reset link is invalid or has expired.");
        await db.update(users).set({ passwordHash: await hashPassword(body.password), updatedAt: new Date() }).where(eq(users.id, tok.userId));
        await db.delete(sessions).where(eq(sessions.userId, tok.userId)); // sign out everywhere
        return NextResponse.json({ ok: true });
      }

      case "verify-email": {
        const body = await readJson(req, z.object({ token: z.string().min(10) }));
        const tok = await consumeToken("email_verify", body.token);
        if (!tok) throw badRequest("This verification link is invalid or has expired.");
        await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, tok.userId));
        return NextResponse.json({ ok: true });
      }

      case "resend-verification": {
        const { user } = await requireUser();
        rateLimit(`resend:${user.id}`, 5, 60 * 60 * 1000);
        if (user.emailVerifiedAt) return NextResponse.json({ ok: true, alreadyVerified: true });
        return NextResponse.json({ ok: true, ...(await sendEmailVerification(user, req)) });
      }

      case "phone-send": {
        const { user } = await requireUser();
        rateLimit(`phone:${user.id}`, 5, 60 * 60 * 1000);
        const body = await readJson(req, z.object({ phone: phoneSchema.optional() }));
        const phone = body.phone ?? user.phone;
        if (!phone) throw badRequest("Add a phone number first.");
        const [dup] = await db.select({ id: users.id }).from(users).where(and(eq(users.phone, phone), ne(users.id, user.id)));
        if (dup) throw conflict("This phone number is linked to another account.");
        return NextResponse.json({ ok: true, ...(await sendPhoneCode(user, phone)) });
      }

      case "phone-verify": {
        const { user } = await requireUser();
        rateLimit(`phonev:${user.id}`, 10, 60 * 60 * 1000);
        const body = await readJson(req, z.object({ code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code") }));
        const [pending] = await db
          .select()
          .from(verificationTokens)
          .where(and(eq(verificationTokens.userId, user.id), eq(verificationTokens.type, "phone_verify"), isNull(verificationTokens.usedAt), gt(verificationTokens.expiresAt, new Date())));
        if (!pending) throw badRequest("Code expired. Request a new one.");
        if (pending.attempts >= 5) throw badRequest("Too many attempts. Request a new code.");
        const tok = await consumeToken("phone_verify", body.code, user.id);
        if (!tok) {
          await db.update(verificationTokens).set({ attempts: pending.attempts + 1 }).where(eq(verificationTokens.id, pending.id));
          throw badRequest("Incorrect code.");
        }
        await db.update(users).set({ phone: tok.target, phoneVerifiedAt: new Date() }).where(eq(users.id, user.id));
        return sessionResponse(user.id);
      }

      default:
        throw new ApiError(404, "Unknown auth action.");
    }
  } catch (e) {
    return errorResponse(e);
  }
}
