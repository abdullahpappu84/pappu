import "server-only";
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import * as t from "@/db/schema";
import { PERMISSIONS } from "@/lib/permissions";
import { can, requireAdmin, type AdminContext } from "../auth";
import { approveDeposit, rejectDeposit, runCashback, setCommissionStatus, updateWithdrawalStatus } from "../finance";
import { assertSameOrigin, badRequest, conflict, errorResponse, forbidden, getIp, matchRoute, notFound, pageParams, query, readJson, toResponse, type Route } from "../http";
import { applyLedger, audit, grantBonus, notify, toCents } from "../ledger";
import { listPaymentAdapters } from "../payments";
import { DEFAULT_SETTINGS, getSettings, updateSetting, type SettingsKey } from "../settings";
import { saveUpload } from "../storage";
import { createResource, deleteResource, listResource, updateResource } from "./admin-resources";
import { appUrl } from "../mailer";
import { buildPaymentAdapter } from "../integrations/payment";
import { buildGameAdapter } from "../integrations/game";
import { clearIntegrationCache, describeSecrets, mergeSecrets, RESERVED_CODES, resolveSecrets } from "../integrations/store";
import { ensureAggregatorGameApi, isAggregatorApi, safeAggregatorError, testAggregatorApi } from "../integrations/aggregator";
import { detectCatalogMapping, fetchCatalog, syncIntegrationCatalog, testCatalogConnection } from "../integrations/catalog";
import { syncCasinoApiProCatalog, testCasinoApiProCatalog } from "../integrations/casinoapipro";
import { syncAggregatorCatalog } from "../aggregator-sync";
import { dateRange, formData } from "./me";

type C = { ctx: AdminContext; ip: string };
const actor = (c: AdminContext) => ({ id: c.admin.id, email: c.admin.email });
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

async function paged<T>(rows: Promise<T[]>, total: Promise<{ total: number }[]>, page: number, pageSize: number) {
  const [items, [{ total: n }]] = await Promise.all([rows, total]);
  return { items, total: n, page, pageSize };
}

function csv(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return new NextResponse("", { headers: { "Content-Type": "text/csv" } });
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => `"${String(v instanceof Date ? v.toISOString() : (v ?? "")).replace(/"/g, '""')}"`;
  const body = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
  return new NextResponse(body, { headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="${filename}"` } });
}

const intBody = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_-]{1,39}$/, "Code: 2-40 chars, lowercase letters, numbers, - or _").optional(),
  kind: z.enum(["payment", "game"]).optional(),
  isActive: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional(),
  config: z.record(z.string(), z.string().max(20000)).optional(),
  secrets: z.record(z.string(), z.string().max(5000).nullable()).optional(),
});
const assertIntPerm = (ctx: AdminContext, kind: string) => {
  const perm = kind === "game" ? "games.edit" : "finance.settings";
  if (!can(ctx, perm)) throw forbidden(`Missing permission: ${perm}`);
};
const safeIntegration = (r: typeof t.integrations.$inferSelect) => ({ ...r, secrets: undefined, secretInfo: describeSecrets(r.secrets) });
const safeEndpoint = (raw: string) => {
  try { const url = new URL(raw); return `${url.origin}${url.pathname.replace(/\/$/, "")}`; }
  catch { return "Not configured"; }
};

const TX_TYPES = t.txType.enumValues;
const SETTINGS_PERM: Record<string, string> = { withdrawal: "finance.settings", deposit: "finance.settings", referral: "affiliates.manage", vip: "bonuses.manage" };

const routes: Route<C>[] = [
  {
    method: "GET",
    path: "providers/:id/games",
    perm: "games.view",
    handler: async ({ params, req }) => {
      const providerId = Number(params.id);
      if (!Number.isInteger(providerId) || providerId <= 0) throw badRequest("Invalid provider.");
      const [provider] = await db.select({ id: t.providers.id, name: t.providers.name }).from(t.providers).where(eq(t.providers.id, providerId));
      if (!provider) throw notFound("Provider not found.");
      const { page, pageSize, offset } = pageParams(req, 50);
      const search = query(req).get("q")?.trim();
      const providerConditions: SQL[] = [eq(t.games.providerId, providerId)];
      if (search) providerConditions.push(or(ilike(t.games.name, `%${search}%`), ilike(t.games.providerGameId, `%${search}%`), ilike(t.games.apiExternalId, `%${search}%`))!);
      const status = query(req).get("status");
      if (status) providerConditions.push(eq(t.games.status, status as "active" | "inactive" | "maintenance"));
      const categoryId = Number(query(req).get("categoryId") || 0);
      if (categoryId > 0) providerConditions.push(sql`exists (select 1 from game_categories gc where gc.game_id = ${t.games.id} and gc.category_id = ${categoryId})`);
      const where = and(...providerConditions);
      const [items, [{ totalGames }], statusCounts] = await Promise.all([
        db.select({ id: t.games.id, name: t.games.name, thumbnail: t.games.thumbnail, status: t.games.status, providerGameId: t.games.providerGameId, aggregatorGameId: t.games.aggregatorGameId })
          .from(t.games).where(where).orderBy(asc(t.games.name)).limit(pageSize).offset(offset),
        db.select({ totalGames: count() }).from(t.games).where(eq(t.games.providerId, providerId)),
        db.select({ status: t.games.status, total: count() }).from(t.games).where(eq(t.games.providerId, providerId)).groupBy(t.games.status),
      ]);
      const links = items.length ? await db.select({ gameId: t.gameCategories.gameId, categoryId: t.gameCategories.categoryId }).from(t.gameCategories).where(inArray(t.gameCategories.gameId, items.map((g) => g.id))) : [];
      const categoryItems = await db.select({ id: t.categories.id, name: t.categories.name, isActive: t.categories.isActive }).from(t.categories).orderBy(asc(t.categories.sortOrder), asc(t.categories.name));
      return {
        provider: {
          ...provider,
          totalGames,
          activeGames: statusCounts.find((row) => row.status === "active")?.total ?? 0,
          inactiveGames: statusCounts.find((row) => row.status === "inactive")?.total ?? 0,
          maintenanceGames: statusCounts.find((row) => row.status === "maintenance")?.total ?? 0,
        },
        games: items.map((game) => ({ ...game, categoryIds: links.filter((link) => link.gameId === game.id).map((link) => link.categoryId) })),
        categories: categoryItems,
        page,
        pageSize,
        total: search ? (await db.select({ total: count() }).from(t.games).where(where))[0]?.total ?? 0 : totalGames,
      };
    },
  },
  {
    method: "POST",
    path: "providers/:id/games/categories",
    perm: "games.edit",
    handler: async ({ ctx, params, req, ip }) => {
      const providerId = Number(params.id);
      if (!Number.isInteger(providerId) || providerId <= 0) throw badRequest("Invalid provider.");
      const body = await readJson(req, z.object({
        gameIds: z.array(z.number().int().positive()).min(1).max(5000).optional(),
        allProviderGames: z.boolean().optional(),
        categoryId: z.number().int().positive(),
      }).refine((value) => value.allProviderGames === true || Boolean(value.gameIds?.length), "Select games or choose all provider games."));
      const [provider] = await db.select({ id: t.providers.id, name: t.providers.name }).from(t.providers).where(eq(t.providers.id, providerId));
      if (!provider) throw notFound("Provider not found.");
      const [category] = await db.select({ id: t.categories.id, name: t.categories.name }).from(t.categories).where(eq(t.categories.id, body.categoryId));
      if (!category) throw notFound("Category not found.");
      const selectedIds = body.allProviderGames ? null : [...new Set(body.gameIds ?? [])];
      const selectedCount = body.allProviderGames
        ? (await db.select({ total: count() }).from(t.games).where(eq(t.games.providerId, providerId)))[0]?.total ?? 0
        : (await db.select({ total: count() }).from(t.games).where(and(eq(t.games.providerId, providerId), inArray(t.games.id, selectedIds!))))[0]?.total ?? 0;
      if (!body.allProviderGames && selectedCount !== selectedIds!.length) throw badRequest("Every selected game must belong to this provider.");
      await db.transaction(async (tx) => {
        const sourceGames = tx.select({ gameId: t.games.id, categoryId: sql<number>`${category.id}`.as("categoryId") }).from(t.games).where(
          body.allProviderGames ? eq(t.games.providerId, providerId) : and(eq(t.games.providerId, providerId), inArray(t.games.id, selectedIds!)),
        );
        await tx.insert(t.gameCategories).select(sourceGames).onConflictDoNothing();
        await audit(tx, actor(ctx), { action: "providers.games.assign_category", targetType: "category", targetId: String(category.id), description: `Assigned ${selectedCount} ${provider.name} game(s) to ${category.name}`, ip });
      });
      return { assigned: selectedCount, category: category.name, allProviderGames: Boolean(body.allProviderGames) };
    },
  },
  {
    method: "GET",
    path: "game-management/summary",
    perm: "games.view",
    handler: async () => {
      await ensureAggregatorGameApi();
      const [totals] = await db.select({ total: count(), active: sql<number>`count(*) filter (where ${t.games.status} = 'active')`, inactive: sql<number>`count(*) filter (where ${t.games.status} <> 'active')` }).from(t.games);
      const [[providerCount], [categoryCount], [customApiCount]] = await Promise.all([
        db.select({ total: count() }).from(t.providers),
        db.select({ total: count() }).from(t.categories),
        db.select({ total: count() }).from(t.integrations).where(eq(t.integrations.kind, "game")),
      ]);
      const configuredBuiltIns = Number(Boolean((process.env.CASINOAPIPRO_API_KEY?.trim() || process.env.CASINO_API_KEY?.trim()) && (process.env.CASINOAPIPRO_API_SECRET?.trim() || process.env.CASINO_API_SECRET?.trim())));
      return { ...totals, providers: providerCount.total, categories: categoryCount.total, gameApis: customApiCount.total + configuredBuiltIns };
    },
  },
  {
    method: "GET",
    path: "game-management/games",
    perm: "games.view",
    handler: async ({ req }) => {
      const { page, pageSize, offset } = pageParams(req, 50);
      const q = query(req);
      const search = q.get("q")?.trim();
      const conditions: SQL[] = [];
      if (search) conditions.push(or(
        ilike(t.games.name, `${search}%`), ilike(t.games.slug, `${search}%`),
        ilike(t.games.apiExternalId, `${search}%`), ilike(t.games.providerGameId, `${search}%`),
        ilike(t.games.providerCode, `${search}%`), ilike(t.games.apiSource, `${search}%`), ilike(t.providers.name, `${search}%`),
      )!);
      if (q.get("providerId")) conditions.push(eq(t.games.providerId, Number(q.get("providerId"))));
      if (q.get("apiSource")) conditions.push(eq(t.games.apiSource, q.get("apiSource")!));
      if (q.get("status")) conditions.push(eq(t.games.status, q.get("status") as "active" | "inactive" | "maintenance"));
      if (q.get("gameType")) conditions.push(eq(t.games.gameType, q.get("gameType")!));
      if (q.get("categoryId")) conditions.push(sql`exists (select 1 from game_categories gc where gc.game_id = ${t.games.id} and gc.category_id = ${Number(q.get("categoryId"))})`);
      const where = conditions.length ? and(...conditions) : undefined;
      const [joined, [{ total }], providerOptions, categoriesList] = await Promise.all([
        db.select({ game: t.games, providerName: t.providers.name }).from(t.games).leftJoin(t.providers, eq(t.providers.id, t.games.providerId)).where(where).orderBy(asc(t.games.name)).limit(pageSize).offset(offset),
        db.select({ total: count() }).from(t.games).leftJoin(t.providers, eq(t.providers.id, t.games.providerId)).where(where),
        db.select({ value: t.providers.id, label: t.providers.name }).from(t.providers).orderBy(asc(t.providers.name)),
        db.select({ value: t.categories.id, label: t.categories.name }).from(t.categories).orderBy(asc(t.categories.sortOrder), asc(t.categories.name)),
      ]);
      const ids = joined.map((row) => row.game.id);
      const links = ids.length ? await db.select({ gameId: t.gameCategories.gameId, categoryId: t.gameCategories.categoryId }).from(t.gameCategories).where(inArray(t.gameCategories.gameId, ids)) : [];
      const cats = categoriesList.length ? await db.select({ id: t.categories.id, name: t.categories.name }).from(t.categories).where(inArray(t.categories.id, [...new Set(links.map((link) => link.categoryId))])) : [];
      const categoryName = new Map(cats.map((cat) => [cat.id, cat.name]));
      const apiSources = await db.select({ code: t.integrations.code, name: t.integrations.name }).from(t.integrations).where(eq(t.integrations.kind, "game"));
      const sourceNames = new Map([["aggregator", "Aggregator.gg"], ["casino_api_pro", "Casino API Pro"], ["game_api_env", "Generic Game API (environment)"], ...apiSources.map((source) => [source.code, source.name] as [string, string])]);
      return {
        items: joined.map(({ game, providerName }) => {
          const gameCats = links.filter((link) => link.gameId === game.id).map((link) => link.categoryId);
          return { ...game, providerName: providerName ?? "Unassigned", apiSourceName: sourceNames.get(game.apiSource ?? "") ?? (game.aggregatorGameId ? "Aggregator.gg" : "Manual"), categoryIds: gameCats, categoryNames: gameCats.map((id) => categoryName.get(id)).filter(Boolean) };
        }),
        total, page, pageSize,
        providers: providerOptions,
        categories: categoriesList,
        apiSources: [...sourceNames].map(([value, label]) => ({ value, label })),
        gameTypes: [...new Set(joined.map((row) => row.game.gameType).filter((value): value is string => Boolean(value)))].map((value) => ({ value, label: value })),
      };
    },
  },
  {
    method: "PATCH",
    path: "game-management/games/:id",
    perm: "games.edit",
    handler: async ({ ctx, params, req, ip }) => {
      const id = Number(params.id);
      const body = await readJson(req, z.object({ name: z.string().trim().min(1).max(120).optional(), status: z.enum(["active", "inactive", "maintenance"]).optional(), isFeatured: z.boolean().optional(), isPopular: z.boolean().optional(), isNew: z.boolean().optional(), sortOrder: z.number().int().optional() }));
      const [updated] = await db.update(t.games).set({ ...body, updatedAt: new Date() }).where(eq(t.games.id, id)).returning();
      if (!updated) throw notFound("Game not found.");
      await audit(db, actor(ctx), { action: "games.update", targetType: "game", targetId: String(id), description: `Updated game ${updated.name}`, ip });
      return { item: updated };
    },
  },
  {
    method: "DELETE",
    path: "game-management/games/:id",
    perm: "games.delete",
    handler: async ({ ctx, params, ip }) => {
      const id = Number(params.id);
      const [game] = await db.select({ name: t.games.name }).from(t.games).where(eq(t.games.id, id));
      if (!game) throw notFound("Game not found.");
      await db.delete(t.games).where(eq(t.games.id, id));
      await audit(db, actor(ctx), { action: "games.delete", targetType: "game", targetId: String(id), description: `Deleted game ${game.name}`, ip });
      return { ok: true };
    },
  },
  {
    method: "POST",
    path: "game-management/games/categories",
    perm: "games.edit",
    handler: async ({ req, ctx, ip }) => {
      const body = await readJson(req, z.object({ gameIds: z.array(z.number().int().positive()).min(1).max(5000), categoryId: z.number().int().positive(), action: z.enum(["add", "remove"]) }));
      const uniqueIds = [...new Set(body.gameIds)];
      const [category] = await db.select({ id: t.categories.id }).from(t.categories).where(eq(t.categories.id, body.categoryId));
      if (!category) throw notFound("Category not found.");
      const [{ total: foundGames }] = await db.select({ total: count() }).from(t.games).where(inArray(t.games.id, uniqueIds));
      if (foundGames !== uniqueIds.length) throw badRequest("One or more selected games no longer exist.");
      if (body.action === "add") {
        await db.insert(t.gameCategories).select(db.select({ gameId: t.games.id, categoryId: sql<number>`${body.categoryId}`.as("categoryId") }).from(t.games).where(inArray(t.games.id, uniqueIds))).onConflictDoNothing();
      } else {
        await db.delete(t.gameCategories).where(and(eq(t.gameCategories.categoryId, body.categoryId), inArray(t.gameCategories.gameId, uniqueIds)));
      }
      await audit(db, actor(ctx), { action: `games.categories.${body.action}`, targetType: "category", targetId: String(body.categoryId), description: `${body.action === "add" ? "Added" : "Removed"} ${uniqueIds.length} game(s) ${body.action === "add" ? "to" : "from"} category`, ip });
      return { affected: uniqueIds.length };
    },
  },
  {
    method: "GET",
    path: "game-management/categories",
    perm: "games.view",
    handler: async ({ req }) => {
      const { page, pageSize, offset } = pageParams(req, 50);
      const search = query(req).get("q")?.trim();
      const where = search ? or(ilike(t.categories.name, `${search}%`), ilike(t.categories.slug, `${search}%`)) : undefined;
      const [items, [{ total }]] = await Promise.all([
        db.select().from(t.categories).where(where).orderBy(asc(t.categories.sortOrder), asc(t.categories.name)).limit(pageSize).offset(offset),
        db.select({ total: count() }).from(t.categories).where(where),
      ]);
      const ids = items.map((item) => item.id);
      const counts = ids.length ? await db.select({ categoryId: t.gameCategories.categoryId, total: count() }).from(t.gameCategories).where(inArray(t.gameCategories.categoryId, ids)).groupBy(t.gameCategories.categoryId) : [];
      return { items: items.map((item) => ({ ...item, gameCount: counts.find((row) => row.categoryId === item.id)?.total ?? 0 })), total, page, pageSize };
    },
  },
  {
    method: "POST",
    path: "game-management/categories",
    perm: "games.edit",
    handler: async ({ req, ctx, ip }) => {
      const body = await readJson(req, z.object({ name: z.string().trim().min(1).max(80), slug: z.string().trim().max(80).optional(), icon: z.string().max(40).default("LayoutGrid"), color: z.string().max(16).default("#f9cf66") }));
      const slug = (body.slug || body.name).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
      if (!slug) throw badRequest("Enter a category name with letters or numbers.");
      const [item] = await db.insert(t.categories).values({ name: body.name, slug, icon: body.icon, color: body.color, sortOrder: 0 }).returning();
      await audit(db, actor(ctx), { action: "categories.create", targetType: "category", targetId: String(item.id), description: `Created category ${item.name}`, ip });
      return { item };
    },
  },
  {
    method: "PATCH",
    path: "game-management/categories/:id",
    perm: "games.edit",
    handler: async ({ req, ctx, params, ip }) => {
      const id = Number(params.id);
      const body = await readJson(req, z.object({ name: z.string().trim().min(1).max(80).optional(), slug: z.string().trim().min(1).max(80).optional(), icon: z.string().max(40).optional(), color: z.string().max(16).optional(), isActive: z.boolean().optional(), sortOrder: z.number().int().optional() }));
      const [item] = await db.update(t.categories).set(body).where(eq(t.categories.id, id)).returning();
      if (!item) throw notFound("Category not found.");
      await audit(db, actor(ctx), { action: "categories.update", targetType: "category", targetId: String(item.id), description: `Updated category ${item.name}`, ip });
      return { item };
    },
  },
  {
    method: "DELETE",
    path: "game-management/categories/:id",
    perm: "games.delete",
    handler: async ({ ctx, params, ip }) => {
      const id = Number(params.id);
      const [item] = await db.select().from(t.categories).where(eq(t.categories.id, id));
      if (!item) throw notFound("Category not found.");
      if (item.slug === "all") throw badRequest("The required All category cannot be deleted.");
      await db.delete(t.categories).where(eq(t.categories.id, id));
      await audit(db, actor(ctx), { action: "categories.delete", targetType: "category", targetId: String(id), description: `Deleted category ${item.name}; games were retained`, ip });
      return { ok: true };
    },
  },
  {
    method: "POST",
    path: "game-management/categories/:id/games",
    perm: "games.edit",
    handler: async ({ req, ctx, params, ip }) => {
      const categoryId = Number(params.id);
      const body = await readJson(req, z.object({ action: z.enum(["add", "remove"]), gameIds: z.array(z.number().int().positive()).max(5000).optional(), providerId: z.number().int().positive().optional(), allProviderGames: z.boolean().optional() }).refine((value) => value.allProviderGames || value.gameIds?.length, "Select games or choose all provider games."));
      const [category] = await db.select({ id: t.categories.id, name: t.categories.name }).from(t.categories).where(eq(t.categories.id, categoryId));
      if (!category) throw notFound("Category not found.");
      let affected = 0;
      if (body.action === "remove") {
        if (body.allProviderGames && body.providerId) {
          const gameRows = await db.select({ id: t.games.id }).from(t.games).where(eq(t.games.providerId, body.providerId));
          affected = gameRows.length;
          if (gameRows.length) await db.delete(t.gameCategories).where(and(eq(t.gameCategories.categoryId, categoryId), inArray(t.gameCategories.gameId, gameRows.map((game) => game.id))));
        } else {
          const ids = [...new Set(body.gameIds ?? [])]; affected = ids.length;
          if (ids.length) await db.delete(t.gameCategories).where(and(eq(t.gameCategories.categoryId, categoryId), inArray(t.gameCategories.gameId, ids)));
        }
      } else if (body.allProviderGames && body.providerId) {
        affected = (await db.select({ total: count() }).from(t.games).where(eq(t.games.providerId, body.providerId)))[0]?.total ?? 0;
        await db.insert(t.gameCategories).select(db.select({ gameId: t.games.id, categoryId: sql<number>`${categoryId}`.as("categoryId") }).from(t.games).where(eq(t.games.providerId, body.providerId))).onConflictDoNothing();
      } else {
        const ids = [...new Set(body.gameIds ?? [])]; affected = ids.length;
        if (ids.length) await db.insert(t.gameCategories).select(db.select({ gameId: t.games.id, categoryId: sql<number>`${categoryId}`.as("categoryId") }).from(t.games).where(inArray(t.games.id, ids))).onConflictDoNothing();
      }
      await audit(db, actor(ctx), { action: `categories.games.${body.action}`, targetType: "category", targetId: String(categoryId), description: `${body.action === "add" ? "Added" : "Removed"} ${affected} game(s) ${body.action === "add" ? "to" : "from"} ${category.name}`, ip });
      return { affected, category: category.name };
    },
  },
  /* ------------------------------ meta & dashboard ------------------------------ */
  {
    method: "GET",
    path: "meta",
    handler: async () => ({ permissions: PERMISSIONS, adapters: listPaymentAdapters(), vipLevels: await db.select({ id: t.vipLevels.id, name: t.vipLevels.name }).from(t.vipLevels).orderBy(asc(t.vipLevels.level)) }),
  },
  {
    method: "GET",
    path: "dashboard",
    perm: "dashboard.view",
    handler: async () => {
      const day = new Date(Date.now() - 86400000);
      const week = new Date(Date.now() - 7 * 86400000);
      const sum = (col: AnyPgColumn) => sql<string>`coalesce(sum(${col}),0)`;
      const [[users], [newUsers], [activeUsers], [dep], [wd], [pendDep], [pendWd], [bonusStats], [games], [ggr], [tickets], recentTx, recentUsers, recentTickets, depositSeries, topGames, [kyc]] = await Promise.all([
        db.select({ n: count() }).from(t.users),
        db.select({ day: sql<number>`count(*) filter (where ${t.users.createdAt} > ${day})::int`, week: sql<number>`count(*) filter (where ${t.users.createdAt} > ${week})::int` }).from(t.users),
        db.select({ n: count() }).from(t.users).where(gte(t.users.lastLoginAt, week)),
        db.select({ total: sum(t.deposits.amount), n: count() }).from(t.deposits).where(eq(t.deposits.status, "approved")),
        db.select({ total: sum(t.withdrawals.amount), n: count() }).from(t.withdrawals).where(inArray(t.withdrawals.status, ["approved", "completed"])),
        db.select({ n: count(), total: sum(t.deposits.amount) }).from(t.deposits).where(eq(t.deposits.status, "pending")),
        db.select({ n: count(), total: sum(t.withdrawals.amount) }).from(t.withdrawals).where(inArray(t.withdrawals.status, ["pending", "processing"])),
        db.select({ active: sql<number>`count(*) filter (where ${t.userBonuses.status}='active')::int`, granted: sum(t.userBonuses.amount), completed: sql<number>`count(*) filter (where ${t.userBonuses.status}='completed')::int` }).from(t.userBonuses),
        db.select({ plays: sql<number>`coalesce(sum(${t.games.playCount}),0)::int`, active: sql<number>`count(*) filter (where ${t.games.status}='active')::int` }).from(t.games),
        db.select({ bets: sql<string>`coalesce(-sum(${t.transactions.amount}) filter (where ${t.transactions.type}='bet'),0)`, wins: sql<string>`coalesce(sum(${t.transactions.amount}) filter (where ${t.transactions.type}='win'),0)`, bonusCost: sql<string>`coalesce(sum(${t.transactions.amount}) filter (where ${t.transactions.type}='bonus_conversion' and ${t.transactions.balanceType}='main'),0)`, cashback: sql<string>`coalesce(sum(${t.transactions.amount}) filter (where ${t.transactions.type} in ('cashback','commission')),0)` }).from(t.transactions),
        db.select({ open: sql<number>`count(*) filter (where ${t.supportTickets.status} in ('open','pending','in_progress'))::int`, unassigned: sql<number>`count(*) filter (where ${t.supportTickets.assignedTo} is null and ${t.supportTickets.status} in ('open','pending','in_progress'))::int` }).from(t.supportTickets),
        db.select({ tx: t.transactions, name: t.users.name }).from(t.transactions).innerJoin(t.users, eq(t.users.id, t.transactions.userId)).orderBy(desc(t.transactions.createdAt)).limit(8),
        db.select({ id: t.users.id, name: t.users.name, email: t.users.email, status: t.users.status, createdAt: t.users.createdAt }).from(t.users).orderBy(desc(t.users.createdAt)).limit(6),
        db.select({ id: t.supportTickets.id, reference: t.supportTickets.reference, subject: t.supportTickets.subject, status: t.supportTickets.status, channel: t.supportTickets.channel, lastMessageAt: t.supportTickets.lastMessageAt }).from(t.supportTickets).orderBy(desc(t.supportTickets.lastMessageAt)).limit(6),
        db.execute<{ day: string; deposits: string; withdrawals: string }>(sql`
          select to_char(d::date,'YYYY-MM-DD') as day,
            coalesce((select sum(amount) from deposits where status='approved' and created_at::date=d::date),0) as deposits,
            coalesce((select sum(amount) from withdrawals where status in ('approved','completed') and created_at::date=d::date),0) as withdrawals
          from generate_series(current_date - interval '13 days', current_date, interval '1 day') d order by d`),
        db.select({ name: t.games.name, plays: t.games.playCount }).from(t.games).orderBy(desc(t.games.playCount)).limit(5),
        db.select({ n: count() }).from(t.kycSubmissions).where(inArray(t.kycSubmissions.status, ["pending", "under_review"])),
      ]);
      const ggrValue = Number(ggr.bets) - Number(ggr.wins);
      return {
        users: { total: users.n, newToday: newUsers.day, newWeek: newUsers.week, active: activeUsers.n },
        deposits: { total: dep.total, count: dep.n, pending: pendDep.n, pendingAmount: pendDep.total },
        withdrawals: { total: wd.total, count: wd.n, pending: pendWd.n, pendingAmount: pendWd.total },
        bonuses: bonusStats,
        games,
        revenue: { bets: ggr.bets, wins: ggr.wins, ggr: ggrValue.toFixed(2), ngr: (ggrValue - Number(ggr.bonusCost) - Number(ggr.cashback)).toFixed(2), netDeposits: (Number(dep.total) - Number(wd.total)).toFixed(2), holdPct: pct(ggrValue, Number(ggr.bets)) },
        tickets,
        kycPending: kyc.n,
        recentTransactions: recentTx.map((r) => ({ ...r.tx, userName: r.name })),
        recentUsers,
        recentTickets,
        series: depositSeries.rows,
        topGames,
      };
    },
  },
  {
    method: "GET",
    path: "reports",
    perm: "reports.view",
    handler: async ({ req }) => {
      const q = query(req);
      const from = q.get("from") ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const to = q.get("to") ?? new Date().toISOString().slice(0, 10);
      const rows = await db
        .select({ type: t.transactions.type, balanceType: t.transactions.balanceType, n: count(), total: sql<string>`coalesce(sum(${t.transactions.amount}),0)` })
        .from(t.transactions)
        .where(and(...dateRange(t.transactions.createdAt, from, to), sql`${t.transactions.status} <> 'reversed'`))
        .groupBy(t.transactions.type, t.transactions.balanceType)
        .orderBy(t.transactions.type);
      const byMethod = await db
        .select({ method: t.paymentMethods.name, n: count(), total: sql<string>`coalesce(sum(${t.deposits.amount}),0)` })
        .from(t.deposits)
        .leftJoin(t.paymentMethods, eq(t.paymentMethods.id, t.deposits.paymentMethodId))
        .where(and(eq(t.deposits.status, "approved"), ...dateRange(t.deposits.createdAt, from, to)))
        .groupBy(t.paymentMethods.name);
      const fees = await db.select({ dep: sql<string>`coalesce(sum(${t.deposits.fee}),0)` }).from(t.deposits).where(and(eq(t.deposits.status, "approved"), ...dateRange(t.deposits.createdAt, from, to)));
      const wfees = await db.select({ wd: sql<string>`coalesce(sum(${t.withdrawals.fee}),0)` }).from(t.withdrawals).where(and(inArray(t.withdrawals.status, ["approved", "completed"]), ...dateRange(t.withdrawals.createdAt, from, to)));
      return { from, to, summary: rows, depositsByMethod: byMethod, fees: { deposits: fees[0].dep, withdrawals: wfees[0].wd } };
    },
  },
  /* ------------------------------ users ------------------------------ */
  {
    method: "GET",
    path: "users",
    perm: "users.view",
    handler: async ({ req }) => {
      const q = query(req);
      const { page, pageSize, offset } = pageParams(req, 20);
      const conds: SQL[] = [];
      const s = q.get("q")?.trim();
      if (s) conds.push(or(ilike(t.users.name, `%${s}%`), ilike(t.users.email, `%${s}%`), ilike(t.users.phone, `%${s}%`), ilike(t.users.referralCode, `%${s}%`))!);
      const status = q.get("status");
      if (status && t.userStatus.enumValues.includes(status as "active")) conds.push(eq(t.users.status, status as "active"));
      const kyc = q.get("kyc");
      if (kyc && t.kycStatus.enumValues.includes(kyc as "none")) conds.push(eq(t.users.kycStatus, kyc as "none"));
      if (q.get("verified") === "yes") conds.push(sql`${t.users.emailVerifiedAt} is not null`);
      if (q.get("verified") === "no") conds.push(isNull(t.users.emailVerifiedAt));
      const where = conds.length ? and(...conds) : undefined;
      return paged(
        db
          .select({ id: t.users.id, name: t.users.name, email: t.users.email, phone: t.users.phone, status: t.users.status, kycStatus: t.users.kycStatus, emailVerifiedAt: t.users.emailVerifiedAt, createdAt: t.users.createdAt, lastLoginAt: t.users.lastLoginAt, mainBalance: t.wallets.mainBalance, bonusBalance: t.wallets.bonusBalance })
          .from(t.users)
          .leftJoin(t.wallets, eq(t.wallets.userId, t.users.id))
          .where(where)
          .orderBy(desc(t.users.createdAt))
          .limit(pageSize)
          .offset(offset),
        db.select({ total: count() }).from(t.users).where(where),
        page,
        pageSize,
      );
    },
  },
  {
    method: "GET",
    path: "users/:id",
    perm: "users.view",
    handler: async ({ params }) => {
      const [u] = await db.select().from(t.users).where(eq(t.users.id, params.id));
      if (!u) throw notFound("User not found.");
      const { passwordHash: _p, twoFactorSecret: _s, twoFactorTempSecret: _ts, recoveryCodes: _r, ...user } = u;
      void _p; void _s; void _ts; void _r;
      const [[profile], [wallet], [vip], notes, [agg], [referrer], sessionsCount, [kyc]] = await Promise.all([
        db.select().from(t.profiles).where(eq(t.profiles.userId, u.id)),
        db.select().from(t.wallets).where(eq(t.wallets.userId, u.id)),
        db.select({ points: t.vipUsers.points, level: t.vipLevels.name }).from(t.vipUsers).leftJoin(t.vipLevels, eq(t.vipLevels.id, t.vipUsers.levelId)).where(eq(t.vipUsers.userId, u.id)),
        db.select().from(t.userNotes).where(eq(t.userNotes.userId, u.id)).orderBy(desc(t.userNotes.createdAt)),
        db
          .select({
            deposits: sql<string>`coalesce(sum(${t.transactions.amount}) filter (where ${t.transactions.type}='deposit'),0)`,
            withdrawals: sql<string>`coalesce(-sum(${t.transactions.amount}) filter (where ${t.transactions.type}='withdrawal' and ${t.transactions.status}<>'reversed'),0)`,
            bets: sql<string>`coalesce(-sum(${t.transactions.amount}) filter (where ${t.transactions.type}='bet'),0)`,
            wins: sql<string>`coalesce(sum(${t.transactions.amount}) filter (where ${t.transactions.type}='win'),0)`,
          })
          .from(t.transactions)
          .where(eq(t.transactions.userId, u.id)),
        u.referredById ? db.select({ id: t.users.id, name: t.users.name }).from(t.users).where(eq(t.users.id, u.referredById)) : Promise.resolve([]),
        db.select({ n: count() }).from(t.sessions).where(eq(t.sessions.userId, u.id)),
        db.select().from(t.kycSubmissions).where(eq(t.kycSubmissions.userId, u.id)).orderBy(desc(t.kycSubmissions.createdAt)).limit(1),
      ]);
      return { user, profile: profile ?? null, wallet, vip: vip ?? null, notes, stats: agg, referrer: referrer ?? null, activeSessions: sessionsCount[0].n, kyc: kyc ?? null };
    },
  },
  {
    method: "GET",
    path: "users/:id/transactions",
    perm: "users.view",
    handler: async ({ req, params }) => {
      const { page, pageSize, offset } = pageParams(req, 15);
      const where = eq(t.transactions.userId, params.id);
      return paged(db.select().from(t.transactions).where(where).orderBy(desc(t.transactions.createdAt)).limit(pageSize).offset(offset), db.select({ total: count() }).from(t.transactions).where(where), page, pageSize);
    },
  },
  {
    method: "GET",
    path: "users/:id/games",
    perm: "users.view",
    handler: async ({ params }) => ({
      recent: await db.select({ name: t.games.name, slug: t.games.slug, playCount: t.recentlyPlayed.playCount, lastPlayedAt: t.recentlyPlayed.lastPlayedAt }).from(t.recentlyPlayed).innerJoin(t.games, eq(t.games.id, t.recentlyPlayed.gameId)).where(eq(t.recentlyPlayed.userId, params.id)).orderBy(desc(t.recentlyPlayed.lastPlayedAt)).limit(50),
      favorites: await db.select({ name: t.games.name }).from(t.favorites).innerJoin(t.games, eq(t.games.id, t.favorites.gameId)).where(eq(t.favorites.userId, params.id)),
    }),
  },
  {
    method: "GET",
    path: "users/:id/bonuses",
    perm: "users.view",
    handler: async ({ params }) => ({ items: await db.select().from(t.userBonuses).where(eq(t.userBonuses.userId, params.id)).orderBy(desc(t.userBonuses.createdAt)) }),
  },
  {
    method: "GET",
    path: "users/:id/referrals",
    perm: "users.view",
    handler: async ({ params }) => ({
      referred: await db.select({ id: t.users.id, name: t.users.name, email: t.users.email, createdAt: t.referrals.createdAt }).from(t.referrals).innerJoin(t.users, eq(t.users.id, t.referrals.referredId)).where(eq(t.referrals.referrerId, params.id)),
      commissions: await db.select().from(t.commissions).where(eq(t.commissions.referrerId, params.id)).orderBy(desc(t.commissions.createdAt)),
    }),
  },
  {
    method: "PATCH",
    path: "users/:id",
    perm: "users.edit",
    handler: async ({ req, params, ctx, ip }) => {
      const b = await readJson(
        req,
        z.object({ name: z.string().trim().min(2).max(120).optional(), email: z.string().trim().toLowerCase().email().optional(), phone: z.string().trim().max(32).nullable().optional(), referralDisabled: z.boolean().optional() }),
      );
      if (b.referralDisabled !== undefined && !can(ctx, "affiliates.manage") && !can(ctx, "users.edit")) throw forbidden();
      const [u] = await db.update(t.users).set({ ...b, phone: b.phone === "" ? null : b.phone, updatedAt: new Date() }).where(eq(t.users.id, params.id)).returning({ id: t.users.id, email: t.users.email });
      if (!u) throw notFound();
      await audit(db, actor(ctx), { action: "user.edit", targetType: "user", targetId: u.id, description: `Edited user ${u.email}: ${Object.keys(b).join(", ")}`, ip });
      return { ok: true };
    },
  },
  {
    method: "POST",
    path: "users/:id/status",
    perm: "users.suspend",
    handler: async ({ req, params, ctx, ip }) => {
      const b = await readJson(req, z.object({ status: z.enum(["active", "suspended", "banned"]), reason: z.string().trim().min(3, "A reason is required").max(500) }));
      const [u] = await db.update(t.users).set({ status: b.status, updatedAt: new Date() }).where(eq(t.users.id, params.id)).returning();
      if (!u) throw notFound();
      if (b.status === "banned") await db.delete(t.sessions).where(eq(t.sessions.userId, u.id));
      await notify(db, u.id, { type: "security", title: b.status === "active" ? "Your account has been reactivated" : `Your account has been ${b.status}`, body: b.status === "active" ? undefined : b.reason });
      await db.insert(t.userNotes).values({ userId: u.id, adminId: ctx.admin.id, adminName: ctx.admin.name, note: `Status → ${b.status}: ${b.reason}` });
      await audit(db, actor(ctx), { action: `user.${b.status === "active" ? "activate" : b.status === "banned" ? "ban" : "suspend"}`, targetType: "user", targetId: u.id, description: `${u.email} → ${b.status}: ${b.reason}`, ip });
      return { ok: true };
    },
  },
  {
    method: "POST",
    path: "users/:id/verify",
    perm: "users.edit",
    handler: async ({ req, params, ctx, ip }) => {
      const b = await readJson(req, z.object({ email: z.boolean().optional(), phone: z.boolean().optional() }));
      const patch: Partial<typeof t.users.$inferInsert> = {};
      if (b.email !== undefined) patch.emailVerifiedAt = b.email ? new Date() : null;
      if (b.phone !== undefined) patch.phoneVerifiedAt = b.phone ? new Date() : null;
      await db.update(t.users).set(patch).where(eq(t.users.id, params.id));
      await audit(db, actor(ctx), { action: "user.verify", targetType: "user", targetId: params.id, description: `Verification flags changed: ${JSON.stringify(b)}`, ip });
      return { ok: true };
    },
  },
  {
    method: "POST",
    path: "users/:id/security",
    perm: "users.edit",
    handler: async ({ req, params, ctx, ip }) => {
      const b = await readJson(req, z.object({ action: z.enum(["reset-2fa", "logout-all"]) }));
      if (b.action === "reset-2fa") await db.update(t.users).set({ twoFactorEnabled: false, twoFactorSecret: null, recoveryCodes: null }).where(eq(t.users.id, params.id));
      else await db.delete(t.sessions).where(eq(t.sessions.userId, params.id));
      await audit(db, actor(ctx), { action: `user.${b.action}`, targetType: "user", targetId: params.id, description: b.action, ip });
      return { ok: true };
    },
  },
  {
    method: "POST",
    path: "users/:id/adjust",
    perm: "users.balance",
    handler: async ({ req, params, ctx, ip }) => {
      const b = await readJson(
        req,
        z.object({
          balanceType: z.enum(["main", "bonus"]),
          type: z.enum(["adjustment", "cashback", "bonus", "refund"]),
          amount: z.number().refine((v) => v !== 0 && Math.abs(v) <= 1_000_000, "Enter a non-zero amount"),
          reason: z.string().trim().min(5, "Provide a reason (min 5 characters)").max(500),
          confirm: z.literal("CONFIRM", { message: 'Type "CONFIRM" to authorise this balance change' }),
        }),
      );
      const [u] = await db.select({ id: t.users.id, email: t.users.email }).from(t.users).where(eq(t.users.id, params.id));
      if (!u) throw notFound();
      return db.transaction(async (tx) => {
        const cents = toCents(b.amount);
        const row =
          b.type === "bonus" && cents > 0
            ? await grantBonus(tx, { userId: u.id, name: `Manual bonus: ${b.reason}`, type: "promotional", amountCents: cents, wageringMultiplier: 0, expiryDays: 30, adminId: ctx.admin.id })
            : await applyLedger(tx, { userId: u.id, balanceType: b.balanceType, amountCents: cents, type: b.type, description: `${b.type === "adjustment" ? "Manual adjustment" : b.type}: ${b.reason}`, adminId: ctx.admin.id, metadata: { adminEmail: ctx.admin.email, reason: b.reason } });
        await notify(tx, u.id, { type: "system", title: `Balance ${cents > 0 ? "credited" : "debited"}: ${Math.abs(b.amount).toFixed(2)}`, body: b.reason, link: "/account?tab=transactions" });
        await audit(tx, actor(ctx), { action: "balance.adjust", targetType: "user", targetId: u.id, description: `${cents > 0 ? "+" : ""}${b.amount.toFixed(2)} ${b.balanceType} (${b.type}) for ${u.email}: ${b.reason}`, metadata: { ...b, confirm: undefined }, ip });
        return { ok: true, record: row };
      });
    },
  },
  {
    method: "POST",
    path: "users/:id/notes",
    perm: "users.notes",
    handler: async ({ req, params, ctx }) => {
      const b = await readJson(req, z.object({ note: z.string().trim().min(2).max(2000) }));
      const [n] = await db.insert(t.userNotes).values({ userId: params.id, adminId: ctx.admin.id, adminName: ctx.admin.name, note: b.note }).returning();
      return { note: n };
    },
  },
  /* ------------------------------ finance ------------------------------ */
  {
    method: "GET",
    path: "deposits",
    perm: "finance.view",
    handler: async ({ req }) => {
      const q = query(req);
      const { page, pageSize, offset } = pageParams(req, 20);
      const conds: SQL[] = [...dateRange(t.deposits.createdAt, q.get("from"), q.get("to"))];
      const st = q.get("status");
      if (st && t.depositStatus.enumValues.includes(st as "pending")) conds.push(eq(t.deposits.status, st as "pending"));
      if (q.get("method")) conds.push(eq(t.deposits.paymentMethodId, Number(q.get("method"))));
      if (q.get("user")) conds.push(eq(t.deposits.userId, q.get("user")!));
      const s = q.get("q")?.trim();
      if (s) conds.push(or(ilike(t.deposits.reference, `%${s}%`), ilike(t.users.email, `%${s}%`), ilike(t.users.name, `%${s}%`))!);
      const where = conds.length ? and(...conds) : undefined;
      const base = db.select({ d: t.deposits, userName: t.users.name, userEmail: t.users.email, method: t.paymentMethods.name }).from(t.deposits).innerJoin(t.users, eq(t.users.id, t.deposits.userId)).leftJoin(t.paymentMethods, eq(t.paymentMethods.id, t.deposits.paymentMethodId)).where(where);
      const r = await paged(base.orderBy(desc(t.deposits.createdAt)).limit(pageSize).offset(offset), db.select({ total: count() }).from(t.deposits).innerJoin(t.users, eq(t.users.id, t.deposits.userId)).where(where), page, pageSize);
      return { ...r, items: r.items.map((x) => ({ ...x.d, userName: x.userName, userEmail: x.userEmail, method: x.method })), methods: await db.select({ id: t.paymentMethods.id, name: t.paymentMethods.name }).from(t.paymentMethods) };
    },
  },
  {
    method: "POST",
    path: "deposits/:id/approve",
    perm: "finance.approve",
    handler: async ({ req, params, ctx, ip }) => {
      const b = await readJson(req, z.object({ note: z.string().max(1000).optional() }));
      return approveDeposit(params.id, actor(ctx), b.note, ip);
    },
  },
  {
    method: "POST",
    path: "deposits/:id/reject",
    perm: "finance.reject",
    handler: async ({ req, params, ctx, ip }) => {
      const b = await readJson(req, z.object({ note: z.string().trim().min(3, "A rejection reason is required").max(1000) }));
      return rejectDeposit(params.id, actor(ctx), b.note, ip);
    },
  },
  {
    method: "POST",
    path: "deposits/:id/note",
    perm: "finance.view",
    handler: async ({ req, params }) => {
      const b = await readJson(req, z.object({ note: z.string().max(1000) }));
      await db.update(t.deposits).set({ adminNote: b.note, updatedAt: new Date() }).where(eq(t.deposits.id, params.id));
      return { ok: true };
    },
  },
  {
    method: "GET",
    path: "withdrawals",
    perm: "finance.view",
    handler: async ({ req }) => {
      const q = query(req);
      const { page, pageSize, offset } = pageParams(req, 20);
      const conds: SQL[] = [...dateRange(t.withdrawals.createdAt, q.get("from"), q.get("to"))];
      const st = q.get("status");
      if (st && t.withdrawalStatus.enumValues.includes(st as "pending")) conds.push(eq(t.withdrawals.status, st as "pending"));
      if (q.get("method")) conds.push(eq(t.withdrawals.paymentMethodId, Number(q.get("method"))));
      if (q.get("user")) conds.push(eq(t.withdrawals.userId, q.get("user")!));
      const s = q.get("q")?.trim();
      if (s) conds.push(or(ilike(t.withdrawals.reference, `%${s}%`), ilike(t.users.email, `%${s}%`), ilike(t.users.name, `%${s}%`))!);
      const where = conds.length ? and(...conds) : undefined;
      const r = await paged(
        db.select({ w: t.withdrawals, userName: t.users.name, userEmail: t.users.email, kycStatus: t.users.kycStatus, method: t.paymentMethods.name }).from(t.withdrawals).innerJoin(t.users, eq(t.users.id, t.withdrawals.userId)).leftJoin(t.paymentMethods, eq(t.paymentMethods.id, t.withdrawals.paymentMethodId)).where(where).orderBy(desc(t.withdrawals.createdAt)).limit(pageSize).offset(offset),
        db.select({ total: count() }).from(t.withdrawals).innerJoin(t.users, eq(t.users.id, t.withdrawals.userId)).where(where),
        page,
        pageSize,
      );
      return { ...r, items: r.items.map((x) => ({ ...x.w, userName: x.userName, userEmail: x.userEmail, kycStatus: x.kycStatus, method: x.method })), methods: await db.select({ id: t.paymentMethods.id, name: t.paymentMethods.name }).from(t.paymentMethods) };
    },
  },
  {
    method: "POST",
    path: "withdrawals/:id/status",
    perm: "finance.approve",
    handler: async ({ req, params, ctx, ip }) => {
      const b = await readJson(req, z.object({ status: z.enum(["processing", "approved", "rejected", "completed"]), note: z.string().max(1000).optional() }));
      if (b.status === "rejected" && !can(ctx, "finance.reject")) throw forbidden("Missing permission: finance.reject");
      return updateWithdrawalStatus(params.id, b.status, actor(ctx), b.note, ip);
    },
  },
  {
    method: "GET",
    path: "transactions",
    perm: "finance.view",
    handler: async ({ req }) => {
      const q = query(req);
      const { page, pageSize, offset } = pageParams(req, 25);
      const conds: SQL[] = [...dateRange(t.transactions.createdAt, q.get("from"), q.get("to"))];
      const type = q.get("type");
      if (type && TX_TYPES.includes(type as "deposit")) conds.push(eq(t.transactions.type, type as "deposit"));
      const bt = q.get("balanceType");
      if (bt === "main" || bt === "bonus") conds.push(eq(t.transactions.balanceType, bt));
      const st = q.get("status");
      if (st && t.txStatus.enumValues.includes(st as "completed")) conds.push(eq(t.transactions.status, st as "completed"));
      if (q.get("user")) conds.push(eq(t.transactions.userId, q.get("user")!));
      const s = q.get("q")?.trim();
      if (s) conds.push(or(ilike(t.transactions.reference, `%${s}%`), ilike(t.transactions.description, `%${s}%`), ilike(t.users.email, `%${s}%`))!);
      const where = conds.length ? and(...conds) : undefined;
      const base = db.select({ tx: t.transactions, userEmail: t.users.email, userName: t.users.name }).from(t.transactions).innerJoin(t.users, eq(t.users.id, t.transactions.userId)).where(where).orderBy(desc(t.transactions.createdAt));
      if (q.get("format") === "csv") {
        const rows = await base.limit(10000);
        return csv(rows.map((r) => ({ date: r.tx.createdAt, reference: r.tx.reference, user: r.userEmail, type: r.tx.type, balance: r.tx.balanceType, amount: r.tx.amount, before: r.tx.balanceBefore, after: r.tx.balanceAfter, status: r.tx.status, description: r.tx.description })), "transactions.csv");
      }
      const r = await paged(base.limit(pageSize).offset(offset), db.select({ total: count() }).from(t.transactions).innerJoin(t.users, eq(t.users.id, t.transactions.userId)).where(where), page, pageSize);
      return { ...r, items: r.items.map((x) => ({ ...x.tx, userEmail: x.userEmail, userName: x.userName })), types: TX_TYPES };
    },
  },
  {
    method: "POST",
    path: "cashback/run",
    perm: "finance.approve",
    handler: async ({ req, ctx, ip }) => {
      const b = await readJson(req, z.object({ days: z.number().int().min(1).max(31) }));
      return runCashback(b.days, actor(ctx), ip);
    },
  },
  /* ------------------------------ KYC ------------------------------ */
  {
    method: "GET",
    path: "kyc",
    perm: "kyc.view",
    handler: async ({ req }) => {
      const q = query(req);
      const { page, pageSize, offset } = pageParams(req, 20);
      const st = q.get("status");
      const where = st && t.kycStatus.enumValues.includes(st as "pending") ? eq(t.kycSubmissions.status, st as "pending") : undefined;
      const r = await paged(
        db.select({ k: t.kycSubmissions, userEmail: t.users.email, userName: t.users.name }).from(t.kycSubmissions).innerJoin(t.users, eq(t.users.id, t.kycSubmissions.userId)).where(where).orderBy(desc(t.kycSubmissions.createdAt)).limit(pageSize).offset(offset),
        db.select({ total: count() }).from(t.kycSubmissions).where(where),
        page,
        pageSize,
      );
      return { ...r, items: r.items.map((x) => ({ ...x.k, userEmail: x.userEmail, userName: x.userName })) };
    },
  },
  {
    method: "POST",
    path: "kyc/:id/review",
    perm: "kyc.review",
    handler: async ({ req, params, ctx, ip }) => {
      const b = await readJson(req, z.object({ status: z.enum(["under_review", "approved", "rejected", "resubmission"]), note: z.string().max(1000).optional() }));
      if (["rejected", "resubmission"].includes(b.status) && !b.note?.trim()) throw badRequest("Please explain the reason to the player.");
      return db.transaction(async (tx) => {
        const [k] = await tx.update(t.kycSubmissions).set({ status: b.status, adminNote: b.note, reviewedBy: ctx.admin.id, reviewedAt: new Date() }).where(eq(t.kycSubmissions.id, params.id)).returning();
        if (!k) throw notFound();
        await tx.update(t.users).set({ kycStatus: b.status }).where(eq(t.users.id, k.userId));
        const titles = { under_review: "Your documents are under review", approved: "Identity verified ✔", rejected: "Verification rejected", resubmission: "Please resubmit your documents" };
        await notify(tx, k.userId, { type: "kyc", title: titles[b.status], body: b.note, link: "/account?tab=kyc" });
        await audit(tx, actor(ctx), { action: `kyc.${b.status}`, targetType: "kyc", targetId: k.id, description: `KYC ${b.status}${b.note ? `: ${b.note}` : ""}`, ip });
        return { ok: true };
      });
    },
  },
  /* ------------------------------ support ------------------------------ */
  {
    method: "GET",
    path: "tickets",
    perm: "support.view",
    handler: async ({ req, ctx }) => {
      const q = query(req);
      const { page, pageSize, offset } = pageParams(req, 30);
      const conds: SQL[] = [];
      const st = q.get("status");
      if (st === "active") conds.push(inArray(t.supportTickets.status, ["open", "pending", "in_progress"]));
      else if (st && t.ticketStatus.enumValues.includes(st as "open")) conds.push(eq(t.supportTickets.status, st as "open"));
      if (q.get("channel")) conds.push(eq(t.supportTickets.channel, q.get("channel")!));
      if (q.get("mine") === "1") conds.push(eq(t.supportTickets.assignedTo, ctx.admin.id));
      const s = q.get("q")?.trim();
      if (s) conds.push(or(ilike(t.supportTickets.subject, `%${s}%`), ilike(t.supportTickets.reference, `%${s}%`), ilike(t.users.email, `%${s}%`))!);
      const where = conds.length ? and(...conds) : undefined;
      const r = await paged(
        db.select({ tk: t.supportTickets, userName: t.users.name, userEmail: t.users.email, agent: t.adminUsers.name }).from(t.supportTickets).innerJoin(t.users, eq(t.users.id, t.supportTickets.userId)).leftJoin(t.adminUsers, eq(t.adminUsers.id, t.supportTickets.assignedTo)).where(where).orderBy(desc(t.supportTickets.lastMessageAt)).limit(pageSize).offset(offset),
        db.select({ total: count() }).from(t.supportTickets).innerJoin(t.users, eq(t.users.id, t.supportTickets.userId)).where(where),
        page,
        pageSize,
      );
      return { ...r, items: r.items.map((x) => ({ ...x.tk, userName: x.userName, userEmail: x.userEmail, agent: x.agent })) };
    },
  },
  {
    method: "GET",
    path: "tickets/:id",
    perm: "support.view",
    handler: async ({ params }) => {
      const [tk] = await db.select({ tk: t.supportTickets, userName: t.users.name, userEmail: t.users.email, userId: t.users.id }).from(t.supportTickets).innerJoin(t.users, eq(t.users.id, t.supportTickets.userId)).where(eq(t.supportTickets.id, params.id));
      if (!tk) throw notFound();
      const [messages, agents, canned] = await Promise.all([
        db.select().from(t.supportMessages).where(eq(t.supportMessages.ticketId, params.id)).orderBy(asc(t.supportMessages.createdAt)),
        db.select({ id: t.adminUsers.id, name: t.adminUsers.name }).from(t.adminUsers).where(eq(t.adminUsers.status, "active")),
        db.select().from(t.cannedResponses).orderBy(asc(t.cannedResponses.title)),
      ]);
      return { ticket: { ...tk.tk, userName: tk.userName, userEmail: tk.userEmail }, messages, agents, canned };
    },
  },
  {
    method: "POST",
    path: "tickets/:id/messages",
    perm: "support.reply",
    handler: async ({ req, params, ctx }) => {
      const b = await readJson(req, z.object({ body: z.string().trim().min(1).max(5000), internal: z.boolean().default(false) }));
      const [tk] = await db.select().from(t.supportTickets).where(eq(t.supportTickets.id, params.id));
      if (!tk) throw notFound();
      const [m] = await db.insert(t.supportMessages).values({ ticketId: tk.id, senderType: "admin", senderId: ctx.admin.id, senderName: ctx.admin.name, body: b.body, isInternal: b.internal }).returning();
      if (!b.internal) {
        await db.update(t.supportTickets).set({ status: tk.status === "open" ? "in_progress" : tk.status, assignedTo: tk.assignedTo ?? ctx.admin.id, lastMessageAt: new Date(), updatedAt: new Date() }).where(eq(t.supportTickets.id, tk.id));
        if (tk.channel === "ticket") await notify(db, tk.userId, { type: "support", title: `New reply on ${tk.reference}`, body: b.body.slice(0, 140), link: "/account?tab=support" });
      }
      return { message: m };
    },
  },
  {
    method: "PATCH",
    path: "tickets/:id",
    perm: "support.reply",
    handler: async ({ req, params, ctx, ip }) => {
      const b = await readJson(req, z.object({ status: z.enum(t.ticketStatus.enumValues).optional(), priority: z.enum(t.ticketPriority.enumValues).optional(), assignedTo: z.string().uuid().nullable().optional() }));
      if (b.assignedTo !== undefined && !can(ctx, "support.assign") && b.assignedTo !== ctx.admin.id) throw forbidden("Missing permission: support.assign");
      const [tk] = await db.update(t.supportTickets).set({ ...b, updatedAt: new Date() }).where(eq(t.supportTickets.id, params.id)).returning();
      if (!tk) throw notFound();
      if (b.status && ["resolved", "closed"].includes(b.status)) await notify(db, tk.userId, { type: "support", title: `Ticket ${tk.reference} ${b.status}`, link: "/account?tab=support" });
      await audit(db, actor(ctx), { action: "ticket.update", targetType: "ticket", targetId: tk.id, description: `Ticket ${tk.reference}: ${JSON.stringify(b)}`, ip });
      return { ok: true };
    },
  },
  /* ------------------------------ notifications ------------------------------ */
  {
    method: "POST",
    path: "notifications/send",
    perm: "marketing.notifications",
    handler: async ({ req, ctx, ip }) => {
      const b = await readJson(
        req,
        z.object({
          target: z.enum(["user", "users", "group", "all"]),
          email: z.string().trim().toLowerCase().optional(),
          userIds: z.array(z.string().uuid()).max(5000).optional(),
          group: z.object({ status: z.enum(t.userStatus.enumValues).optional(), vipLevelId: z.number().int().optional(), kycStatus: z.enum(t.kycStatus.enumValues).optional(), marketingOnly: z.boolean().optional() }).optional(),
          type: z.enum(t.notificationType.enumValues).default("promotion"),
          title: z.string().trim().min(2).max(200),
          body: z.string().trim().max(2000).optional(),
          link: z.string().trim().max(500).optional(),
        }),
      );
      let ids: string[] = [];
      if (b.target === "user") {
        const [u] = await db.select({ id: t.users.id }).from(t.users).where(eq(t.users.email, b.email ?? ""));
        if (!u) throw badRequest("No user with that email.");
        ids = [u.id];
      } else if (b.target === "users") ids = b.userIds ?? [];
      else {
        const conds: SQL[] = [sql`${t.users.status} <> 'banned'`];
        if (b.target === "group" && b.group) {
          if (b.group.status) conds.push(eq(t.users.status, b.group.status));
          if (b.group.kycStatus) conds.push(eq(t.users.kycStatus, b.group.kycStatus));
          if (b.group.vipLevelId) conds.push(eq(t.vipUsers.levelId, b.group.vipLevelId));
          if (b.group.marketingOnly) conds.push(eq(t.profiles.marketingOptIn, true));
        }
        const rows = await db.select({ id: t.users.id }).from(t.users).leftJoin(t.vipUsers, eq(t.vipUsers.userId, t.users.id)).leftJoin(t.profiles, eq(t.profiles.userId, t.users.id)).where(and(...conds));
        ids = rows.map((r) => r.id);
      }
      if (!ids.length) throw badRequest("No recipients match this audience.");
      for (let i = 0; i < ids.length; i += 500) {
        await db.insert(t.notifications).values(ids.slice(i, i + 500).map((userId) => ({ userId, type: b.type, title: b.title, body: b.body, link: b.link })));
      }
      await audit(db, actor(ctx), { action: "notification.send", description: `Sent "${b.title}" to ${ids.length} user(s) (${b.target})`, ip });
      return { sent: ids.length };
    },
  },
  /* ------------------------------ affiliates ------------------------------ */
  {
    method: "GET",
    path: "referrals",
    perm: "affiliates.view",
    handler: async ({ req }) => {
      const { page, pageSize, offset } = pageParams(req, 25);
      const rows = await db.execute<Record<string, unknown>>(sql`
        select r.id, r.created_at, r.status, u.name as referred_name, u.email as referred_email,
               ref.name as referrer_name, ref.email as referrer_email, ref.id as referrer_id, ref.referral_disabled, a.name as agent_name
        from referrals r join users u on u.id = r.referred_id
        left join users ref on ref.id = r.referrer_id left join agents a on a.id = r.agent_id
        order by r.created_at desc limit ${pageSize} offset ${offset}`);
      const [{ total }] = await db.select({ total: count() }).from(t.referrals);
      return { items: rows.rows, total, page, pageSize };
    },
  },
  {
    method: "GET",
    path: "commissions",
    perm: "affiliates.view",
    handler: async ({ req }) => {
      const q = query(req);
      const { page, pageSize, offset } = pageParams(req, 25);
      const st = q.get("status");
      const where = st && t.commissionStatus.enumValues.includes(st as "pending") ? eq(t.commissions.status, st as "pending") : undefined;
      const rows = await db
        .select({ c: t.commissions, referrer: t.users.email, agent: t.agents.name })
        .from(t.commissions)
        .leftJoin(t.users, eq(t.users.id, t.commissions.referrerId))
        .leftJoin(t.agents, eq(t.agents.id, t.commissions.agentId))
        .where(where)
        .orderBy(desc(t.commissions.createdAt))
        .limit(pageSize)
        .offset(offset);
      const [{ total }] = await db.select({ total: count() }).from(t.commissions).where(where);
      return { items: rows.map((r) => ({ ...r.c, referrer: r.referrer, agent: r.agent })), total, page, pageSize };
    },
  },
  {
    method: "POST",
    path: "commissions/:id/status",
    perm: "affiliates.manage",
    handler: async ({ req, params, ctx, ip }) => {
      const b = await readJson(req, z.object({ status: z.enum(["approved", "paid", "rejected"]) }));
      return setCommissionStatus(params.id, b.status, actor(ctx), ip);
    },
  },
  {
    method: "POST",
    path: "users/:id/referral",
    perm: "affiliates.manage",
    handler: async ({ req, params, ctx, ip }) => {
      const b = await readJson(req, z.object({ disabled: z.boolean() }));
      await db.update(t.users).set({ referralDisabled: b.disabled }).where(eq(t.users.id, params.id));
      await audit(db, actor(ctx), { action: b.disabled ? "referral.disable" : "referral.enable", targetType: "user", targetId: params.id, ip });
      return { ok: true };
    },
  },
  /* ------------------------------ settings & audit ------------------------------ */
  {
    method: "GET",
    path: "settings",
    perm: "settings.view",
    handler: async () => ({ settings: await getSettings(true), defaults: DEFAULT_SETTINGS }),
  },
  {
    method: "PUT",
    path: "settings/:key",
    handler: async ({ req, params, ctx, ip }) => {
      const key = params.key as SettingsKey;
      if (!(key in DEFAULT_SETTINGS)) throw notFound("Unknown settings group.");
      const perm = SETTINGS_PERM[key] ?? "settings.edit";
      if (!can(ctx, perm) && !can(ctx, "settings.edit")) throw forbidden(`Missing permission: ${perm}`);
      const body = await readJson(req, z.record(z.string(), z.unknown()));
      const defaults = DEFAULT_SETTINGS[key] as Record<string, unknown>;
      const clean: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(body)) {
        if (!(k in defaults)) continue;
        const d = defaults[k];
        if (typeof d === "number") {
          if (Number.isNaN(Number(v))) throw badRequest(`${k} must be a number.`);
          clean[k] = Number(v);
        } else if (typeof d === "boolean") clean[k] = Boolean(v);
        else if (typeof d === "object" && d) clean[k] = typeof v === "object" && v ? v : d;
        else clean[k] = String(v ?? "").slice(0, 5000);
      }
      const next = await updateSetting(key, clean as never);
      await audit(db, actor(ctx), { action: "settings.update", targetType: "settings", targetId: key, description: `Updated ${key} settings: ${Object.keys(clean).join(", ")}`, metadata: clean, ip });
      return { settings: next };
    },
  },
  {
    method: "GET",
    path: "audit-logs",
    perm: "audit.view",
    handler: async ({ req }) => {
      const q = query(req);
      const { page, pageSize, offset } = pageParams(req, 30);
      const conds: SQL[] = [...dateRange(t.auditLogs.createdAt, q.get("from"), q.get("to"))];
      const s = q.get("q")?.trim();
      if (s) conds.push(or(ilike(t.auditLogs.action, `%${s}%`), ilike(t.auditLogs.description, `%${s}%`), ilike(t.auditLogs.adminEmail, `%${s}%`), ilike(t.auditLogs.targetId, `%${s}%`))!);
      const where = conds.length ? and(...conds) : undefined;
      return paged(db.select().from(t.auditLogs).where(where).orderBy(desc(t.auditLogs.createdAt)).limit(pageSize).offset(offset), db.select({ total: count() }).from(t.auditLogs).where(where), page, pageSize);
    },
  },
  {
    method: "POST",
    path: "upload",
    handler: async ({ req }) => {
      const fd = await formData(req);
      return { url: await saveUpload(fd.get("file"), { folder: "media", visibility: "public", maxBytes: 5 * 1024 * 1024 }) };
    },
  },
  /* ------------------------------ universal integrations ------------------------------ */
  {
    method: "POST",
    path: "integrations/environment/casino_api_pro/catalog/test",
    handler: async ({ ctx }) => {
      assertIntPerm(ctx, "game");
      try { return await testCasinoApiProCatalog(); }
      catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Catalog request failed." }; }
    },
  },
  {
    method: "POST",
    path: "integrations/environment/casino_api_pro/catalog/sync",
    handler: async ({ ctx, ip }) => {
      assertIntPerm(ctx, "game");
      try {
        const result = await syncCasinoApiProCatalog();
        await audit(db, actor(ctx), { action: "integration.catalog.sync", targetType: "game_api", targetId: "casino_api_pro", description: `Synced ${result.totalFetched} Casino API Pro games: ${result.newGames} new, ${result.updatedGames} updated, ${result.skipped} skipped`, ip });
        return result;
      } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Catalog sync failed." }; }
    },
  },
  {
    method: "GET",
    path: "integrations",
    handler: async ({ req, ctx }) => {
      const kind = query(req).get("kind") === "game" ? "game" : "payment";
      assertIntPerm(ctx, kind);
      if (kind === "game") await ensureAggregatorGameApi();
      const rows = await db.select().from(t.integrations).where(eq(t.integrations.kind, kind)).orderBy(asc(t.integrations.name));
      const syncIds = [...rows.map((row) => String(row.id)), "casino_api_pro"];
      const syncLogs = kind === "game" ? await db.select({ targetId: t.auditLogs.targetId, createdAt: t.auditLogs.createdAt }).from(t.auditLogs)
        .where(and(eq(t.auditLogs.action, "integration.catalog.sync"), or(eq(t.auditLogs.targetType, "integration"), eq(t.auditLogs.targetType, "game_api")), inArray(t.auditLogs.targetId, syncIds)))
        .orderBy(desc(t.auditLogs.createdAt)) : [];
      const lastSync = new Map<string, Date>();
      for (const log of syncLogs) if (log.targetId && !lastSync.has(log.targetId)) lastSync.set(log.targetId, log.createdAt);
      const sourceCounts = kind === "game" ? await db.select({ source: t.games.apiSource, total: count() }).from(t.games).groupBy(t.games.apiSource) : [];
      const gameCounts = new Map(sourceCounts.map((row) => [row.source ?? "", row.total]));
      const environmentApis = kind === "game" ? [
        { code: "casino_api_pro", name: "Casino API Pro", type: "Built-in provider API", configured: Boolean((process.env.CASINOAPIPRO_API_KEY?.trim() || process.env.CASINO_API_KEY?.trim()) && (process.env.CASINOAPIPRO_API_SECRET?.trim() || process.env.CASINO_API_SECRET?.trim())), endpoint: safeEndpoint(process.env.CASINOAPIPRO_BASE_URL?.trim() || process.env.CASINO_API_URL?.trim() || "https://api.casinoapipro.com/v1"), mode: "configured by credentials", lastSyncAt: lastSync.get("casino_api_pro")?.toISOString() ?? null, gameCount: gameCounts.get("casino_api_pro") ?? 0 },
        { code: "game_api_env", name: "Generic Game API (environment)", type: "Legacy environment adapter", configured: Boolean(process.env.GAME_API_URL?.trim() && process.env.GAME_API_KEY?.trim()), endpoint: process.env.GAME_API_URL ? safeEndpoint(process.env.GAME_API_URL.trim()) : "Not configured", mode: "configured by environment", lastSyncAt: null, gameCount: gameCounts.get("game_api_env") ?? 0 },
      ] : [];
      return { items: rows.map((row) => ({ ...safeIntegration(row), lastSyncAt: lastSync.get(String(row.id))?.toISOString() ?? null, gameCount: gameCounts.get(row.code) ?? 0, apiType: row.config.apiType || "Custom", mode: row.config.catalogMode || "sandbox" })), environmentApis, baseUrl: appUrl(req) };
    },
  },
  {
    method: "POST",
    path: "integrations",
    handler: async ({ req, ctx, ip }) => {
      const b = await readJson(req, intBody);
      if (!b.code || !b.kind) throw badRequest("Code and type are required.");
      assertIntPerm(ctx, b.kind);
      if (RESERVED_CODES.includes(b.code)) throw badRequest(`"${b.code}" is reserved for a built-in adapter. Choose another code.`);
      if (b.kind === "game" && b.config?.apiType === "aggregator") {
        try { if (!b.config.baseUrl || !["http:", "https:"].includes(new URL(b.config.baseUrl).protocol)) throw new Error(); }
        catch { throw badRequest("Enter a valid Aggregator base URL."); }
        if (!b.secrets?.API_KEY) throw badRequest("Enter the Aggregator API key.");
      }
      const [row] = await db
        .insert(t.integrations)
        .values({ kind: b.kind, code: b.code, name: b.name, isActive: b.isActive ?? true, notes: b.notes ?? null, config: b.config ?? {}, secrets: mergeSecrets({}, b.secrets ?? {}) })
        .returning();
      if (b.kind === "payment") {
        await db
          .insert(t.paymentMethods)
          .values({ name: b.name, code: `int_${b.code}`.slice(0, 40), adapter: b.code, direction: "deposit", minAmount: "10", maxAmount: "10000", processingTime: "Instant", instructions: `You will be redirected to ${b.name} to complete the payment.`, sortOrder: -10 })
          .onConflictDoNothing();
      }
      clearIntegrationCache();
      await audit(db, actor(ctx), { action: "integration.create", targetType: "integration", targetId: String(row.id), description: `Created ${b.kind} integration ${b.name} (${b.code})`, ip });
      return { item: safeIntegration(row) };
    },
  },
  {
    method: "PATCH",
    path: "integrations/:id",
    handler: async ({ req, ctx, params, ip }) => {
      const [row] = await db.select().from(t.integrations).where(eq(t.integrations.id, Number(params.id)));
      if (!row) throw notFound("Integration not found.");
      assertIntPerm(ctx, row.kind);
      const b = await readJson(req, intBody.partial());
      if (row.kind === "game" && (b.config?.apiType ?? row.config.apiType) === "aggregator") {
        const config = b.config ?? row.config;
        try { if (!config.baseUrl || !["http:", "https:"].includes(new URL(config.baseUrl).protocol)) throw new Error(); }
        catch { throw badRequest("Enter a valid Aggregator base URL."); }
        const secrets = { ...resolveSecrets(row.secrets), ...Object.fromEntries(Object.entries(b.secrets ?? {}).filter(([, value]) => value).map(([key, value]) => [key, value])) };
        if (!secrets.API_KEY) throw badRequest("Enter the Aggregator API key.");
      }
      const [upd] = await db
        .update(t.integrations)
        .set({
          ...(b.name ? { name: b.name } : {}),
          ...(b.isActive !== undefined ? { isActive: b.isActive } : {}),
          ...(b.notes !== undefined ? { notes: b.notes } : {}),
          ...(b.config ? { config: b.config } : {}),
          ...(b.secrets ? { secrets: mergeSecrets(row.secrets, b.secrets) } : {}),
          updatedAt: new Date(),
        })
        .where(eq(t.integrations.id, row.id))
        .returning();
      clearIntegrationCache();
      const secretNames = Object.keys(b.secrets ?? {}).filter((k) => b.secrets![k] !== "");
      await audit(db, actor(ctx), {
        action: "integration.update",
        targetType: "integration",
        targetId: String(row.id),
        description: `Updated ${row.kind} integration ${row.code}${b.config ? " (config)" : ""}${secretNames.length ? ` — secrets changed: ${secretNames.join(", ")}` : ""}${b.isActive !== undefined ? ` — active=${b.isActive}` : ""}`,
        ip,
      });
      return { item: safeIntegration(upd) };
    },
  },
  {
    method: "DELETE",
    path: "integrations/:id",
    handler: async ({ ctx, params, req, ip }) => {
      const [row] = await db.select().from(t.integrations).where(eq(t.integrations.id, Number(params.id)));
      if (!row) throw notFound("Integration not found.");
      assertIntPerm(ctx, row.kind);
      const body = await readJson(req, z.object({ gamePolicy: z.enum(["keep", "disable", "delete"]).default("keep") }));
      if (row.kind === "game" && body.gamePolicy === "disable") await db.update(t.games).set({ status: "inactive", updatedAt: new Date() }).where(eq(t.games.apiSource, row.code));
      if (row.kind === "game" && body.gamePolicy === "delete") await db.delete(t.games).where(eq(t.games.apiSource, row.code));
      await db.delete(t.integrations).where(eq(t.integrations.id, row.id));
      if (row.kind === "payment") await db.update(t.paymentMethods).set({ isActive: false }).where(eq(t.paymentMethods.adapter, row.code));
      clearIntegrationCache();
      await audit(db, actor(ctx), { action: "integration.delete", targetType: "integration", targetId: String(row.id), description: `Deleted ${row.kind} integration ${row.code}${row.kind === "game" ? `; games policy=${body.gamePolicy}` : ""}`, ip });
      return { ok: true };
    },
  },
  {
    method: "POST",
    path: "integrations/:id/catalog/test",
    handler: async ({ ctx, params }) => {
      const [row] = await db.select().from(t.integrations).where(eq(t.integrations.id, Number(params.id)));
      if (!row) throw notFound("Integration not found.");
      assertIntPerm(ctx, row.kind);
      if (row.kind !== "game") throw badRequest("Catalog operations are only available for game APIs.");
      try {
        const result = isAggregatorApi(row) ? await testAggregatorApi(row) : await testCatalogConnection(row);
        if (result.ok) await db.update(t.integrations).set({ lastTestAt: new Date() }).where(eq(t.integrations.id, row.id));
        return result;
      }
      catch (error) { return { ok: false, error: isAggregatorApi(row) ? safeAggregatorError(error) : error instanceof Error ? error.message : "Catalog request failed." }; }
    },
  },
  {
    method: "POST",
    path: "integrations/:id/catalog/detect",
    handler: async ({ ctx, params }) => {
      const [row] = await db.select().from(t.integrations).where(eq(t.integrations.id, Number(params.id)));
      if (!row) throw notFound("Integration not found.");
      assertIntPerm(ctx, row.kind);
      if (row.kind !== "game") throw badRequest("Catalog operations are only available for game APIs.");
      if (!row.isActive) throw conflict("This API is disabled. Enable it before syncing games.");
      try {
        if (isAggregatorApi(row)) {
          const connection = await testAggregatorApi(row);
          return connection.ok ? { ...connection, detected: { catalogFieldGameId: "id", catalogFieldName: "name", catalogFieldProviderCode: "provider_code", catalogFieldThumbnail: "thumbnail_url", catalogFieldGameType: "game_type" } } : connection;
        }
        const { records } = await fetchCatalog(row);
        return { ok: true, ...detectCatalogMapping(row, records) };
      } catch (error) { return { ok: false, error: isAggregatorApi(row) ? safeAggregatorError(error) : error instanceof Error ? error.message : "Could not detect catalog fields." }; }
    },
  },
  {
    method: "POST",
    path: "integrations/:id/catalog/clean-sync",
    handler: async ({ ctx, params, ip }) => {
      const [row] = await db.select().from(t.integrations).where(eq(t.integrations.id, Number(params.id)));
      if (!row) throw notFound("Integration not found.");
      assertIntPerm(ctx, row.kind);
      if (!isAggregatorApi(row)) throw badRequest("Clean & Re-sync is only available for Aggregator APIs.");
      if (!row.isActive) throw conflict("This API is disabled. Enable it before syncing games.");
      try {
        const result = await syncAggregatorCatalog(row, { clean: true });
        await db.update(t.integrations).set({ lastSyncAt: new Date(), lastSyncSummary: result }).where(eq(t.integrations.id, row.id));
        await audit(db, actor(ctx), { action: "integration.catalog.clean_sync", targetType: "integration", targetId: String(row.id), description: `Rebuilt ${row.name} catalog: ${result.newGames} new, ${result.updatedGames} updated, ${result.staleGamesDisabled} stale games disabled`, ip });
        return result;
      } catch (error) { return { ok: false, error: safeAggregatorError(error) }; }
    },
  },
  {
    method: "POST",
    path: "integrations/:id/catalog/sync",
    handler: async ({ ctx, params, ip }) => {
      const [row] = await db.select().from(t.integrations).where(eq(t.integrations.id, Number(params.id)));
      if (!row) throw notFound("Integration not found.");
      assertIntPerm(ctx, row.kind);
      if (row.kind !== "game") throw badRequest("Catalog operations are only available for game APIs.");
      if (!row.isActive) throw conflict("This API is disabled. Enable it before syncing games.");
      try {
        const result = isAggregatorApi(row) ? await syncAggregatorCatalog(row) : await syncIntegrationCatalog(row);
        await db.update(t.integrations).set({ lastSyncAt: new Date(), lastSyncSummary: result }).where(eq(t.integrations.id, row.id));
        await audit(db, actor(ctx), { action: "integration.catalog.sync", targetType: "integration", targetId: String(row.id), description: `Synced ${result.totalFetched} catalog record(s) from ${row.name}: ${result.newGames} new, ${result.updatedGames} updated, ${"skipped" in result ? result.skipped : result.failedRecords} skipped`, ip });
        return result;
      } catch (error) { return { ok: false, error: isAggregatorApi(row) ? safeAggregatorError(error) : error instanceof Error ? error.message : "Catalog sync failed." }; }
    },
  },
  {
    method: "POST",
    path: "integrations/:id/test",
    handler: async ({ req, ctx, params, ip }) => {
      const [row] = await db.select().from(t.integrations).where(eq(t.integrations.id, Number(params.id)));
      if (!row) throw notFound("Integration not found.");
      assertIntPerm(ctx, row.kind);
      const b = await readJson(req, z.object({ amount: z.number().positive().max(1_000_000).optional(), gameId: z.string().max(120).optional(), mode: z.enum(["demo", "real"]).optional() }));
      const debug: Record<string, unknown>[] = [];
      const base = appUrl(req);
      const s = await getSettings();
      try {
        if (row.kind === "payment") {
          const ref = `TEST-${Date.now().toString(36).toUpperCase()}`;
          const ret = `${base}/api/payments/return/${row.code}?ref=${ref}`;
          const result = await buildPaymentAdapter({ ...row, isActive: true }, debug).createDeposit({
            depositId: "00000000-0000-0000-0000-000000000000",
            reference: ref,
            amount: (b.amount ?? 10).toFixed(2),
            currency: s.locale.currency,
            userId: ctx.admin.id,
            customer: { name: ctx.admin.name, email: ctx.admin.email, phone: "01700000000" },
            method: {} as typeof t.paymentMethods.$inferSelect,
            urls: { base, success: ret, cancel: `${ret}&result=cancel`, webhook: `${base}/api/payments/webhook/${row.code}` },
          });
          return { ok: true, result, debug, note: "A test payment session was created at the gateway. No deposit was recorded." };
        }
        const result = await buildGameAdapter(row, debug).launch({
          game: { name: "Test game", slug: "test-game", integrationRef: b.gameId || "test", gameUrl: null } as typeof t.games.$inferSelect,
          providerSlug: null,
          mode: b.mode ?? "demo",
          user: b.mode === "real" ? { id: "00000000-0000-0000-0000-000000000000", name: "Test Player", email: "test@example.com", currency: s.locale.currency } : null,
          token: b.mode === "real" ? "TEST-TOKEN" : null,
          language: s.locale.language,
          device: "desktop",
          lobbyUrl: `${base}/`,
          ip,
        });
        if (row.kind === "game") await db.update(t.integrations).set({ lastTestAt: new Date() }).where(eq(t.integrations.id, row.id));
        return { ok: true, result, debug };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Test failed.", debug };
      }
    },
  },
  /* ------------------------------ generic resources ------------------------------ */
  { method: "GET", path: "resources/:key", handler: ({ ctx, req, params }) => listResource(ctx, req, params.key) },
  { method: "POST", path: "resources/:key", handler: async ({ ctx, req, params, ip }) => createResource(ctx, req, params.key, await readJson(req, z.record(z.string(), z.unknown())), ip) },
  { method: "PATCH", path: "resources/:key/:id", handler: async ({ ctx, req, params, ip }) => updateResource(ctx, req, params.key, params.id, await readJson(req, z.record(z.string(), z.unknown())), ip) },
  { method: "DELETE", path: "resources/:key/:id", handler: ({ ctx, params, ip }) => deleteResource(ctx, params.key, params.id, ip) },
];

export async function adminDispatch(req: Request, c: { params: Promise<{ path: string[] }> }) {
  try {
    assertSameOrigin(req);
    const { path } = await c.params;
    const m = matchRoute(routes, req.method, path);
    if (!m) throw notFound("Endpoint not found.");
    const ctx = await requireAdmin(m.route.perm); // server-side authorisation on every request
    return toResponse(await m.route.handler({ ctx, ip: getIp(req), req, params: m.params }));
  } catch (e) {
    return errorResponse(e);
  }
}
