import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { z } from "zod";
import { db } from "@/db";
import { adminSessions, adminUsers } from "@/db/schema";
import { ensureSeeded } from "@/db/seed";
import { createAdminSession, destroyAdminSession, getAdminContext, requireAdmin, type AdminContext } from "@/lib/server/auth";
import { decrypt, encrypt, generateRecoveryCodes, generateTotpSecret, hashPassword, sha256, signTicket, totpUri, verifyPassword, verifyTicket, verifyTotp } from "@/lib/server/crypto";
import { ApiError, assertSameOrigin, badRequest, errorResponse, getIp, rateLimit, readJson, unauthorized } from "@/lib/server/http";
import { audit } from "@/lib/server/ledger";
import { getSettings } from "@/lib/server/settings";

export const dynamic = "force-dynamic";

const serialize = (ctx: AdminContext) => ({
  admin: { id: ctx.admin.id, name: ctx.admin.name, email: ctx.admin.email, twoFactorEnabled: ctx.admin.twoFactorEnabled, lastLoginAt: ctx.admin.lastLoginAt },
  roles: ctx.roles,
  permissions: [...ctx.permissions],
  needs2faSetup: ctx.needs2faSetup,
});

type Ctx = { params: Promise<{ action: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    if ((await params).action !== "me") throw new ApiError(404, "Not found");
    const ctx = await getAdminContext();
    if (!ctx) throw unauthorized("Admin authentication required.");
    return NextResponse.json(serialize(ctx));
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
      case "login": {
        const b = await readJson(req, z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) }));
        rateLimit(`admin-login:${ip}`, 10, 15 * 60 * 1000);
        rateLimit(`admin-login:${b.email}`, 5, 15 * 60 * 1000);
        const [a] = await db.select().from(adminUsers).where(eq(adminUsers.email, b.email));
        if (!a || !(await verifyPassword(b.password, a.passwordHash)) || a.status !== "active") {
          await audit(db, null, { action: "admin.login_failed", description: `Failed admin login for ${b.email}`, ip });
          throw unauthorized("Invalid credentials.");
        }
        if (a.twoFactorEnabled) return NextResponse.json({ requires2fa: true, ticket: signTicket({ aid: a.id, k: "admin-2fa" }, 300) });
        await createAdminSession(a.id, req);
        await audit(db, { id: a.id, email: a.email }, { action: "admin.login", description: "Admin signed in", ip });
        const s = await getSettings();
        return NextResponse.json({ ok: true, needs2faSetup: s.security.adminRequire2fa });
      }
      case "login-2fa": {
        const b = await readJson(req, z.object({ ticket: z.string(), code: z.string().trim().min(6).max(16) }));
        rateLimit(`admin-2fa:${ip}`, 8, 10 * 60 * 1000);
        const tk = verifyTicket<{ aid: string; k: string }>(b.ticket);
        if (!tk || tk.k !== "admin-2fa") throw unauthorized("Login expired, please sign in again.");
        const [a] = await db.select().from(adminUsers).where(eq(adminUsers.id, tk.aid));
        if (!a) throw unauthorized();
        const secret = decrypt(a.twoFactorSecret);
        let ok = secret ? verifyTotp(secret, b.code) : false;
        if (!ok && a.recoveryCodes?.includes(sha256(b.code.toUpperCase()))) {
          ok = true;
          await db.update(adminUsers).set({ recoveryCodes: a.recoveryCodes.filter((c) => c !== sha256(b.code.toUpperCase())) }).where(eq(adminUsers.id, a.id));
        }
        if (!ok) throw unauthorized("Invalid authentication code.");
        await createAdminSession(a.id, req);
        await audit(db, { id: a.id, email: a.email }, { action: "admin.login", description: "Admin signed in (2FA)", ip });
        return NextResponse.json({ ok: true });
      }
      case "logout":
        await destroyAdminSession();
        return NextResponse.json({ ok: true });
      case "2fa-setup": {
        const ctx = await requireAdmin(undefined, { allowWithout2fa: true });
        const secret = generateTotpSecret();
        await db.update(adminUsers).set({ twoFactorTempSecret: encrypt(secret) }).where(eq(adminUsers.id, ctx.admin.id));
        const s = await getSettings();
        return NextResponse.json({ secret, qr: await QRCode.toDataURL(totpUri(secret, ctx.admin.email, `${s.site.name} Admin`), { margin: 1, width: 220 }) });
      }
      case "2fa-enable": {
        const ctx = await requireAdmin(undefined, { allowWithout2fa: true });
        const b = await readJson(req, z.object({ code: z.string().trim() }));
        const secret = decrypt(ctx.admin.twoFactorTempSecret);
        if (!secret || !verifyTotp(secret, b.code)) throw badRequest("Invalid code.");
        const { codes, hashes } = generateRecoveryCodes();
        await db.update(adminUsers).set({ twoFactorEnabled: true, twoFactorSecret: encrypt(secret), twoFactorTempSecret: null, recoveryCodes: hashes }).where(eq(adminUsers.id, ctx.admin.id));
        await audit(db, { id: ctx.admin.id, email: ctx.admin.email }, { action: "admin.2fa_enabled", ip });
        return NextResponse.json({ recoveryCodes: codes });
      }
      case "2fa-disable": {
        const ctx = await requireAdmin(undefined, { allowWithout2fa: true });
        const s = await getSettings();
        if (s.security.adminRequire2fa) throw badRequest("2FA is mandatory for admin accounts and cannot be disabled.");
        const b = await readJson(req, z.object({ code: z.string().trim() }));
        const secret = decrypt(ctx.admin.twoFactorSecret);
        if (!secret || !verifyTotp(secret, b.code)) throw badRequest("Invalid code.");
        await db.update(adminUsers).set({ twoFactorEnabled: false, twoFactorSecret: null, recoveryCodes: null }).where(eq(adminUsers.id, ctx.admin.id));
        await audit(db, { id: ctx.admin.id, email: ctx.admin.email }, { action: "admin.2fa_disabled", ip });
        return NextResponse.json({ ok: true });
      }
      case "password": {
        const ctx = await requireAdmin(undefined, { allowWithout2fa: true });
        const b = await readJson(req, z.object({ currentPassword: z.string(), newPassword: z.string().min(10).max(200).regex(/\d/, "Include a number").regex(/[A-Za-z]/, "Include a letter") }));
        if (!(await verifyPassword(b.currentPassword, ctx.admin.passwordHash))) throw badRequest("Current password is incorrect.");
        await db.update(adminUsers).set({ passwordHash: await hashPassword(b.newPassword), updatedAt: new Date() }).where(eq(adminUsers.id, ctx.admin.id));
        await db.delete(adminSessions).where(eq(adminSessions.adminId, ctx.admin.id));
        await createAdminSession(ctx.admin.id, req);
        await audit(db, { id: ctx.admin.id, email: ctx.admin.email }, { action: "admin.password_changed", ip });
        return NextResponse.json({ ok: true });
      }
      default:
        throw new ApiError(404, "Unknown action.");
    }
  } catch (e) {
    return errorResponse(e);
  }
}
