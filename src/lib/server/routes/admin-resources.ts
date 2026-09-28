import "server-only";
import { asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { db, type Tx } from "@/db";
import * as t from "@/db/schema";
import { RESOURCE_MAP, type FieldDef, type OptionSource, type ResourceDef } from "@/lib/admin/resources";
import { can, type AdminContext } from "../auth";
import { hashPassword } from "../crypto";
import { badRequest, forbidden, notFound, pageParams, query } from "../http";
import { audit, fromCents, toCents } from "../ledger";
import { listAllPaymentAdapters, resolvePaymentAdapter } from "../payments";
import { GAME_ADAPTER_CODES } from "../games/adapters";
import { loadIntegrations } from "../integrations/store";

type AnyTable = PgTable;
type Row = Record<string, unknown>;

const TABLES: Record<string, AnyTable> = {
  games: t.games as unknown as AnyTable,
  categories: t.categories as unknown as AnyTable,
  providers: t.providers as unknown as AnyTable,
  "payment-methods": t.paymentMethods as unknown as AnyTable,
  bonuses: t.bonuses as unknown as AnyTable,
  "promo-codes": t.promoCodes as unknown as AnyTable,
  "vip-levels": t.vipLevels as unknown as AnyTable,
  banners: t.banners as unknown as AnyTable,
  promotions: t.promotions as unknown as AnyTable,
  pages: t.pages as unknown as AnyTable,
  agents: t.agents as unknown as AnyTable,
  "canned-responses": t.cannedResponses as unknown as AnyTable,
  roles: t.roles as unknown as AnyTable,
  admins: t.adminUsers as unknown as AnyTable,
};

const col = (table: AnyTable, name: string) => (table as unknown as Record<string, Parameters<typeof eq>[0]>)[name];
const slugify = (v: string) => v.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function coerce(f: FieldDef, v: unknown): unknown {
  if (v === undefined) return undefined;
  const empty = v === "" || v === null;
  switch (f.type) {
    case "boolean":
      return Boolean(v);
    case "number":
      if (empty) return null;
      if (Number.isNaN(Number(v))) throw badRequest(`${f.label} must be a number.`);
      return f.name === "rtp" || /Percent|percentage|Multiplier/.test(f.name) ? String(Number(v)) : Math.round(Number(v));
    case "money":
      if (empty) return null;
      if (Number.isNaN(Number(v)) || Number(v) < 0) throw badRequest(`${f.label} must be a positive amount.`);
      return fromCents(toCents(v as string));
    case "datetime":
      if (empty) return null;
      if (Number.isNaN(Date.parse(String(v)))) throw badRequest(`${f.label} is not a valid date.`);
      return new Date(String(v));
    case "json":
      if (empty) return null;
      if (typeof v === "string") {
        try {
          return JSON.parse(v);
        } catch {
          throw badRequest(`${f.label} must be valid JSON.`);
        }
      }
      return v;
    case "tags":
      if (empty) return [];
      return (Array.isArray(v) ? v : String(v).split(",")).map((x) => String(x).trim()).filter(Boolean);
    case "select":
      if (empty) return null;
      return f.optionsFrom && !["paymentAdapters", "gameAdapters"].includes(f.optionsFrom) ? Number(v) : String(v);
    default:
      if (empty) return null;
      return String(v).slice(0, f.type === "textarea" ? 100000 : 2000);
  }
}

function buildValues(def: ResourceDef, body: Row, isCreate: boolean) {
  const values: Row = {};
  for (const f of def.fields) {
    if (f.virtual) continue;
    const v = coerce(f, body[f.name]);
    if (v === undefined) continue;
    if ((v === null || v === "") && f.required) throw badRequest(`${f.label} is required.`);
    if (v === null && isCreate) continue; // let DB defaults apply
    values[f.name] = v;
  }
  if (isCreate) for (const f of def.fields) if (f.required && !f.virtual && values[f.name] == null && f.type !== "boolean") throw badRequest(`${f.label} is required.`);
  if (typeof values.slug === "string") values.slug = slugify(values.slug);
  if (def.key === "promo-codes" && typeof values.code === "string") values.code = values.code.toUpperCase().replace(/\s/g, "");
  if (def.key === "agents" && typeof values.code === "string") values.code = values.code.toUpperCase().replace(/\s/g, "");
  if (typeof values.email === "string") values.email = values.email.toLowerCase().trim();
  if ("updatedAt" in (TABLES[def.key] as object)) values.updatedAt = new Date();
  return values;
}

async function loadOptions(sources: OptionSource[]) {
  const out: Partial<Record<OptionSource, { value: string; label: string }[]>> = {};
  for (const s of new Set(sources)) {
    if (s === "providers") out[s] = (await db.select({ id: t.providers.id, name: t.providers.name }).from(t.providers).orderBy(asc(t.providers.name))).map((r) => ({ value: String(r.id), label: r.name }));
    if (s === "categories") out[s] = (await db.select({ id: t.categories.id, name: t.categories.name }).from(t.categories).orderBy(asc(t.categories.sortOrder))).map((r) => ({ value: String(r.id), label: r.name }));
    if (s === "bonuses") out[s] = (await db.select({ id: t.bonuses.id, name: t.bonuses.name }).from(t.bonuses)).map((r) => ({ value: String(r.id), label: r.name }));
    if (s === "roles") out[s] = (await db.select({ id: t.roles.id, name: t.roles.name }).from(t.roles)).map((r) => ({ value: String(r.id), label: r.name }));
    if (s === "games") out[s] = (await db.select({ id: t.games.id, name: t.games.name }).from(t.games).orderBy(asc(t.games.name))).map((r) => ({ value: String(r.id), label: r.name }));
    if (s === "paymentAdapters") out[s] = (await listAllPaymentAdapters()).map((a) => ({ value: a.code, label: `${a.label}${a.kind === "gateway" && !a.configured ? " — not configured" : ""}` }));
    if (s === "gameAdapters")
      out[s] = [
        ...GAME_ADAPTER_CODES.map((c) => ({ value: c, label: c })),
        ...(await loadIntegrations()).filter((r) => r.kind === "game").map((r) => ({ value: r.code, label: `${r.name} (custom)` })),
      ];
    if (s === "permissions") out[s] = (await db.select().from(t.permissions).orderBy(asc(t.permissions.group), asc(t.permissions.key))).map((r) => ({ value: r.key, label: `${r.group} · ${r.label}` }));
  }
  return out;
}

async function expand(key: string, rows: Row[]) {
  const ids = rows.map((r) => r.id as number);
  if (!ids.length) return rows;
  if (key === "games") {
    const links = await db.select().from(t.gameCategories).where(inArray(t.gameCategories.gameId, ids));
    const provs = await db.select({ id: t.providers.id, name: t.providers.name }).from(t.providers);
    return rows.map((r) => ({ ...r, categoryIds: links.filter((l) => l.gameId === r.id).map((l) => String(l.categoryId)), providerName: provs.find((p) => p.id === r.providerId)?.name ?? "—" }));
  }
  if (key === "categories") {
    const links = await db.select().from(t.gameCategories).where(inArray(t.gameCategories.categoryId, ids));
    return rows.map((r) => {
      const g = links.filter((l) => l.categoryId === r.id).map((l) => String(l.gameId));
      return { ...r, gameIds: g, gameCount: g.length };
    });
  }
  if (key === "payment-methods") {
    return Promise.all(
      rows.map(async (r) => {
        const a = await resolvePaymentAdapter(String(r.adapter));
        return { ...r, gatewayStatus: a.kind === "manual" ? "manual" : a.isConfigured() ? "configured" : "missing env" };
      }),
    );
  }
  if (key === "providers") {
    const counts = await db.select({ pid: t.games.providerId, n: count() }).from(t.games).where(inArray(t.games.providerId, ids)).groupBy(t.games.providerId);
    return rows.map((r) => ({ ...r, gameCount: counts.find((c) => c.pid === r.id)?.n ?? 0 }));
  }
  if (key === "roles") {
    const rp = await db.select({ roleId: t.rolePermissions.roleId, key: t.permissions.key }).from(t.rolePermissions).innerJoin(t.permissions, eq(t.permissions.id, t.rolePermissions.permissionId)).where(inArray(t.rolePermissions.roleId, ids));
    return rows.map((r) => {
      const keys = rp.filter((x) => x.roleId === r.id).map((x) => x.key);
      return { ...r, permissionKeys: keys, permissionCount: keys.length };
    });
  }
  if (key === "admins") {
    const ur = await db.select({ adminId: t.userRoles.adminId, roleId: t.roles.id, name: t.roles.name }).from(t.userRoles).innerJoin(t.roles, eq(t.roles.id, t.userRoles.roleId)).where(inArray(t.userRoles.adminId, ids as unknown as string[]));
    return rows.map(({ passwordHash: _p, twoFactorSecret: _s, twoFactorTempSecret: _ts, recoveryCodes: _rc, ...r }) => {
      void _p; void _s; void _ts; void _rc;
      const mine = ur.filter((x) => x.adminId === r.id);
      return { ...r, roleIds: mine.map((x) => String(x.roleId)), roleNames: mine.map((x) => x.name) };
    });
  }
  if (key === "agents") {
    const refs = await db.select({ agentId: t.referrals.agentId, n: count() }).from(t.referrals).where(inArray(t.referrals.agentId, ids)).groupBy(t.referrals.agentId);
    const comms = await db
      .select({ agentId: t.commissions.agentId, total: sql<string>`coalesce(sum(${t.commissions.amount}),0)`, paid: sql<string>`coalesce(sum(case when ${t.commissions.status}='paid' then ${t.commissions.amount} else 0 end),0)` })
      .from(t.commissions)
      .where(inArray(t.commissions.agentId, ids))
      .groupBy(t.commissions.agentId);
    return rows.map((r) => ({ ...r, referralCount: refs.find((x) => x.agentId === r.id)?.n ?? 0, commissionTotal: comms.find((x) => x.agentId === r.id)?.total ?? "0", commissionPaid: comms.find((x) => x.agentId === r.id)?.paid ?? "0" }));
  }
  return rows;
}

async function afterSave(tx: Tx, key: string, id: number | string, body: Row, ctx: AdminContext) {
  if (key === "games" && Array.isArray(body.categoryIds)) {
    await tx.delete(t.gameCategories).where(eq(t.gameCategories.gameId, id as number));
    const ids = (body.categoryIds as string[]).map(Number).filter(Boolean);
    if (ids.length) await tx.insert(t.gameCategories).values(ids.map((c) => ({ gameId: id as number, categoryId: c })));
  }
  if (key === "categories" && Array.isArray(body.gameIds)) {
    await tx.delete(t.gameCategories).where(eq(t.gameCategories.categoryId, id as number));
    const ids = (body.gameIds as string[]).map(Number).filter(Boolean);
    if (ids.length) await tx.insert(t.gameCategories).values(ids.map((g) => ({ gameId: g, categoryId: id as number })));
  }
  if (key === "roles" && Array.isArray(body.permissionKeys)) {
    const [role] = await tx.select().from(t.roles).where(eq(t.roles.id, id as number));
    if (role?.slug === "super_admin") return; // super admin always has everything
    await tx.delete(t.rolePermissions).where(eq(t.rolePermissions.roleId, id as number));
    const keys = body.permissionKeys as string[];
    if (keys.length) {
      const perms = await tx.select().from(t.permissions).where(inArray(t.permissions.key, keys));
      if (perms.length) await tx.insert(t.rolePermissions).values(perms.map((p) => ({ roleId: id as number, permissionId: p.id })));
    }
  }
  if (key === "admins" && Array.isArray(body.roleIds)) {
    const roleIds = (body.roleIds as string[]).map(Number).filter(Boolean);
    const superRole = (await tx.select().from(t.roles).where(eq(t.roles.slug, "super_admin")))[0];
    if (superRole && roleIds.includes(superRole.id) && !ctx.permissions.has("*")) throw forbidden("Only a Super Admin can grant the Super Admin role.");
    if (id === ctx.admin.id && superRole && ctx.permissions.has("*") && !roleIds.includes(superRole.id)) throw badRequest("You cannot remove your own Super Admin role.");
    await tx.delete(t.userRoles).where(eq(t.userRoles.adminId, id as string));
    if (roleIds.length) await tx.insert(t.userRoles).values(roleIds.map((r) => ({ adminId: id as string, roleId: r })));
  }
}

async function beforeSave(key: string, values: Row, body: Row, isCreate: boolean, ctx: AdminContext, id?: string | number) {
  if (key === "admins") {
    const pw = typeof body.password === "string" ? body.password : "";
    if (isCreate && pw.length < 10) throw badRequest("Admin passwords must be at least 10 characters.");
    if (pw) {
      if (pw.length < 10 || !/\d/.test(pw) || !/[A-Za-z]/.test(pw)) throw badRequest("Admin passwords need 10+ characters with letters and numbers.");
      values.passwordHash = await hashPassword(pw);
    }
    if (body.reset2fa) Object.assign(values, { twoFactorEnabled: false, twoFactorSecret: null, twoFactorTempSecret: null, recoveryCodes: null });
    if (!isCreate && id === ctx.admin.id && values.status === "suspended") throw badRequest("You cannot suspend your own account.");
  }
  if (key === "roles" && !isCreate) {
    const [role] = await db.select().from(t.roles).where(eq(t.roles.id, id as number));
    if (role?.isSystem && values.slug && values.slug !== role.slug) throw badRequest("System role slugs cannot be changed.");
  }
}

function assertPerm(ctx: AdminContext, perm: string) {
  if (!can(ctx, perm)) throw forbidden(`Missing permission: ${perm}`);
}

function getDef(key: string) {
  const def = RESOURCE_MAP[key];
  if (!def || !TABLES[key]) throw notFound("Unknown resource.");
  return def;
}

export async function listResource(ctx: AdminContext, req: Request, key: string) {
  const def = getDef(key);
  assertPerm(ctx, def.viewPerm);
  const table = TABLES[key];
  const q = query(req).get("q")?.trim();
  const { page, pageSize, offset } = pageParams(req, 25);
  const filters: SQL[] = [];
  if (q) filters.push(or(...def.search.map((s) => ilike(col(table, s) as never, `%${q}%`)))!);
  const provider = query(req).get("providerId");
  if (key === "games" && provider) filters.push(eq(t.games.providerId, Number(provider)));
  const where = filters.length ? filters[0] : undefined;
  const order = "sortOrder" in (table as object) ? asc(col(table, "sortOrder") as never) : "level" in (table as object) ? asc(col(table, "level") as never) : desc(col(table, "id") as never);
  const [rows, [{ total }]] = await Promise.all([
    db.select().from(table).where(where).orderBy(order).limit(pageSize).offset(offset) as unknown as Promise<Row[]>,
    db.select({ total: count() }).from(table).where(where),
  ]);
  const options = await loadOptions(def.fields.map((f) => f.optionsFrom).filter(Boolean) as OptionSource[]);
  return { items: await expand(key, rows), total, page, pageSize, options, canEdit: can(ctx, def.editPerm), canCreate: can(ctx, def.createPerm ?? def.editPerm), canDelete: can(ctx, def.deletePerm ?? def.editPerm) };
}

export async function createResource(ctx: AdminContext, req: Request, key: string, body: Row, ip: string) {
  const def = getDef(key);
  assertPerm(ctx, def.createPerm ?? def.editPerm);
  const table = TABLES[key];
  const values = buildValues(def, body, true);
  await beforeSave(key, values, body, true, ctx);
  const row = await db.transaction(async (tx) => {
    const [r] = (await tx.insert(table).values(values as never).returning()) as Row[];
    await afterSave(tx, key, r.id as number, body, ctx);
    await audit(tx, { id: ctx.admin.id, email: ctx.admin.email }, { action: `${key}.create`, targetType: key, targetId: String(r.id), description: `Created ${def.singular}: ${r.name ?? r.title ?? r.code ?? r.id}`, ip });
    return r;
  });
  return { item: row };
}

export async function updateResource(ctx: AdminContext, req: Request, key: string, id: string, body: Row, ip: string) {
  const def = getDef(key);
  assertPerm(ctx, def.editPerm);
  const table = TABLES[key];
  const pk = key === "admins" ? id : Number(id);
  const values = buildValues(def, body, false);
  await beforeSave(key, values, body, false, ctx, pk);
  const row = await db.transaction(async (tx) => {
    let r: Row | undefined;
    if (Object.keys(values).length) [r] = (await tx.update(table).set(values as never).where(eq(col(table, "id"), pk)).returning()) as Row[];
    else [r] = (await tx.select().from(table).where(eq(col(table, "id"), pk))) as Row[];
    if (!r) throw notFound(`${def.singular} not found.`);
    await afterSave(tx, key, pk, body, ctx);
    const changed = Object.keys(values).filter((k) => k !== "updatedAt" && k !== "passwordHash");
    await audit(tx, { id: ctx.admin.id, email: ctx.admin.email }, {
      action: `${key}.update`,
      targetType: key,
      targetId: id,
      description: `Updated ${def.singular} ${r.name ?? r.title ?? r.code ?? id}${changed.length ? ` (${changed.join(", ")})` : ""}${body.permissionKeys ? " — permissions changed" : ""}${body.roleIds ? " — roles changed" : ""}`,
      ip,
    });
    return r;
  });
  return { item: row };
}

export async function deleteResource(ctx: AdminContext, key: string, id: string, ip: string) {
  const def = getDef(key);
  assertPerm(ctx, def.deletePerm ?? def.editPerm);
  const table = TABLES[key];
  const pk = key === "admins" ? id : Number(id);
  if (key === "admins" && id === ctx.admin.id) throw badRequest("You cannot delete your own account.");
  if (key === "pages") {
    const [p] = await db.select().from(t.pages).where(eq(t.pages.id, pk as number));
    if (p?.isSystem) throw badRequest("System pages can be unpublished but not deleted.");
  }
  if (key === "roles") {
    const [r] = await db.select().from(t.roles).where(eq(t.roles.id, pk as number));
    if (r?.isSystem) throw badRequest("System roles cannot be deleted.");
  }
  if (key === "categories") {
    const [c] = await db.select().from(t.categories).where(eq(t.categories.id, pk as number));
    if (c && ["all"].includes(c.slug)) throw badRequest("The 'all' category is required.");
  }
  const [r] = (await db.delete(table).where(eq(col(table, "id"), pk)).returning()) as Row[];
  if (!r) throw notFound();
  await audit(db, { id: ctx.admin.id, email: ctx.admin.email }, { action: `${key}.delete`, targetType: key, targetId: id, description: `Deleted ${def.singular}: ${r.name ?? r.title ?? r.code ?? id}`, ip });
  return { ok: true };
}
