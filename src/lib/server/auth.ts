import "server-only";
import { and, eq, gt, inArray } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { adminSessions, adminUsers, permissions, rolePermissions, roles, sessions, userRoles, users } from "@/db/schema";
import { randomToken, sha256 } from "./crypto";
import { forbidden, getIp, unauthorized } from "./http";
import { getSettings } from "./settings";

export const USER_COOKIE = "ar_session";
export const ADMIN_COOKIE = "ar_admin";
const secure = process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "true";

export type UserRow = typeof users.$inferSelect;
export type AdminRow = typeof adminUsers.$inferSelect;

/* ============================== USER SESSIONS ============================== */
export async function createUserSession(userId: string, req: Request) {
  const s = await getSettings();
  const token = randomToken(32);
  const maxAge = s.security.sessionDays * 86400;
  await db.insert(sessions).values({
    id: sha256(token),
    userId,
    ip: getIp(req),
    userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
    expiresAt: new Date(Date.now() + maxAge * 1000),
  });
  await db.update(users).set({ lastLoginAt: new Date(), lastLoginIp: getIp(req) }).where(eq(users.id, userId));
  (await cookies()).set(USER_COOKIE, token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge });
}

export async function getCurrentUser(): Promise<{ user: UserRow; sessionId: string } | null> {
  const token = (await cookies()).get(USER_COOKIE)?.value;
  if (!token) return null;
  const id = sha256(token);
  const rows = await db
    .select({ user: users, session: sessions })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row || row.user.status === "banned") return null;
  if (Date.now() - row.session.lastSeenAt.getTime() > 5 * 60 * 1000) {
    await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, id));
  }
  return { user: row.user, sessionId: id };
}

/** Require a signed-in user. `active` additionally blocks suspended accounts from financial/game actions. */
export async function requireUser(opts: { active?: boolean } = {}) {
  const cur = await getCurrentUser();
  if (!cur) throw unauthorized();
  if (opts.active && cur.user.status !== "active") throw forbidden("Your account is restricted. Please contact support.", "ACCOUNT_RESTRICTED");
  return cur;
}

export async function destroyUserSession() {
  const store = await cookies();
  const token = store.get(USER_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, sha256(token)));
  store.delete(USER_COOKIE);
}

/* ============================== ADMIN SESSIONS ============================== */
export async function createAdminSession(adminId: string, req: Request) {
  const s = await getSettings();
  const token = randomToken(32);
  const maxAge = s.security.adminSessionHours * 3600;
  await db.insert(adminSessions).values({
    id: sha256(token),
    adminId,
    ip: getIp(req),
    userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
    expiresAt: new Date(Date.now() + maxAge * 1000),
  });
  await db.update(adminUsers).set({ lastLoginAt: new Date(), lastLoginIp: getIp(req) }).where(eq(adminUsers.id, adminId));
  (await cookies()).set(ADMIN_COOKIE, token, { httpOnly: true, secure, sameSite: "strict", path: "/", maxAge });
}

export async function destroyAdminSession() {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  if (token) await db.delete(adminSessions).where(eq(adminSessions.id, sha256(token)));
  store.delete(ADMIN_COOKIE);
}

export type AdminContext = {
  admin: AdminRow;
  sessionId: string;
  roles: { id: number; name: string; slug: string }[];
  permissions: Set<string>;
  needs2faSetup: boolean;
};

export async function loadAdminPermissions(adminId: string) {
  const roleRows = await db
    .select({ id: roles.id, name: roles.name, slug: roles.slug })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(userRoles.adminId, adminId));
  const perms = new Set<string>();
  if (roleRows.some((r) => r.slug === "super_admin")) perms.add("*");
  if (roleRows.length) {
    const p = await db
      .select({ key: permissions.key })
      .from(rolePermissions)
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(inArray(rolePermissions.roleId, roleRows.map((r) => r.id)));
    p.forEach((x) => perms.add(x.key));
  }
  return { roles: roleRows, permissions: perms };
}

export async function getAdminContext(): Promise<AdminContext | null> {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  const id = sha256(token);
  const rows = await db
    .select({ admin: adminUsers, session: adminSessions })
    .from(adminSessions)
    .innerJoin(adminUsers, eq(adminUsers.id, adminSessions.adminId))
    .where(and(eq(adminSessions.id, id), gt(adminSessions.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row || row.admin.status !== "active") return null;
  if (Date.now() - row.session.lastSeenAt.getTime() > 60 * 1000) {
    await db.update(adminSessions).set({ lastSeenAt: new Date() }).where(eq(adminSessions.id, id));
  }
  const { roles: r, permissions: p } = await loadAdminPermissions(row.admin.id);
  const s = await getSettings();
  return { admin: row.admin, sessionId: id, roles: r, permissions: p, needs2faSetup: s.security.adminRequire2fa && !row.admin.twoFactorEnabled };
}

export const can = (ctx: Pick<AdminContext, "permissions">, perm: string) => ctx.permissions.has("*") || ctx.permissions.has(perm);

export async function requireAdmin(perm?: string, opts: { allowWithout2fa?: boolean } = {}) {
  const ctx = await getAdminContext();
  if (!ctx) throw unauthorized("Admin authentication required.");
  if (ctx.needs2faSetup && !opts.allowWithout2fa) throw forbidden("Two-factor authentication must be enabled for admin accounts.", "2FA_SETUP_REQUIRED");
  if (perm && !can(ctx, perm)) throw forbidden(`Missing permission: ${perm}`);
  return ctx;
}
