import "server-only";
import { and, eq, inArray, isNotNull, notInArray, or } from "drizzle-orm";
import { db } from "@/db";
import { games, providers } from "@/db/schema";
import { listAllAggregatorGames, listAggregatorProviders, type AggregatorGame } from "@/lib/aggregator";

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);
const strings = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

export async function syncAggregatorCatalog() {
  // Complete both remote reads before mutating local availability. A partial fetch must never
  // deactivate the rest of the catalog.
  const [catalog, registry] = await Promise.all([listAllAggregatorGames(), listAggregatorProviders()]);
  const providerByCode = new Map<string, number>();
  const upsertProvider = async (code: string, metadata?: Record<string, unknown>, registered?: boolean) => {
    const slug = `aggregator-${slugify(code)}`;
    const [existing] = await db.select({ id: providers.id, slug: providers.slug }).from(providers)
      .where(or(eq(providers.slug, slug), eq(providers.name, code))).limit(1);
    if (existing) {
      await db.update(providers).set({ adapter: "aggregator", ...(metadata ? { aggregatorMetadata: metadata } : {}), updatedAt: new Date() }).where(eq(providers.id, existing.id));
      return existing.id;
    }
    const [created] = await db.insert(providers).values({
      name: code, slug, adapter: "aggregator", isActive: registered !== false,
      aggregatorMetadata: metadata ?? null,
    }).returning({ id: providers.id });
    return created.id;
  };
  for (const p of registry) {
    const code = p.provider_code;
    if (!code) continue;
    providerByCode.set(code, await upsertProvider(code, p as unknown as Record<string, unknown>, p.is_registered));
  }
  // Catalog provider codes are authoritative even if an entry is absent from registry.
  for (const code of new Set(catalog.map(g => g.provider_code).filter((x): x is string => !!x))) {
    if (providerByCode.has(code)) continue;
    providerByCode.set(code, await upsertProvider(code));
  }

  const existingRows = catalog.length ? await db.select({ id: games.id, aggregatorGameId: games.aggregatorGameId, slug: games.slug, aggregatorAvailable: games.aggregatorAvailable }).from(games).where(inArray(games.aggregatorGameId, catalog.map(g => g.id))) : [];
  const existing = new Map(existingRows.map(x => [x.aggregatorGameId!, x]));
  let created = 0, updated = 0, failed = 0;
  const seen: string[] = [];
  for (const g of catalog) {
    try {
      if (!g.id || !g.name || !g.provider_code) throw new Error("required catalog fields missing");
      const old = existing.get(g.id);
      const providerId = providerByCode.get(g.provider_code) ?? null;
      const values = toGameValues(g, providerId, old?.slug ?? `agg-${slugify(g.id)}`);
      await db.insert(games).values({ ...values, slug: old?.slug ?? values.slug }).onConflictDoUpdate({
        target: games.aggregatorGameId,
        set: { ...values, slug: old?.slug ?? values.slug, updatedAt: new Date() },
      });
      if (old) updated++; else created++;
      seen.push(g.id);
    } catch (e) {
      failed++;
      console.error("[aggregator-sync] catalog record failed", g.id || "unknown", e instanceof Error ? e.message : "unknown error");
    }
  }
  // Do not deactivate on a record-level partial failure: retry after correcting the bad record.
  let deactivated = 0;
  if (!failed && catalog.length) {
    const stale = await db.update(games).set({ aggregatorAvailable: false, updatedAt: new Date() })
      .where(and(eq(games.aggregatorAvailable, true), isNotNull(games.aggregatorGameId), notInArray(games.aggregatorGameId, seen)))
      .returning({ id: games.id });
    deactivated = stale.length;
    if (seen.length) await db.update(games).set({ aggregatorAvailable: true, updatedAt: new Date() }).where(inArray(games.aggregatorGameId, seen));
  }
  return { totalFetched: catalog.length, newGames: created, updatedGames: updated, deactivatedGames: deactivated, failedRecords: failed };
}

function toGameValues(g: AggregatorGame, providerId: number | null, slug: string) {
  const raw = g as unknown as Record<string, unknown>;
  const rtp = typeof g.rtp === "number" || typeof g.rtp === "string" ? String(g.rtp) : null;
  return {
    name: g.name.slice(0, 120), slug, providerId,
    thumbnail: g.thumbnail_url ?? null,
    // Never persist a temporary signed game URL.
    gameUrl: null,
    integrationRef: g.id,
    aggregatorGameId: g.id,
    providerGameId: g.provider_game_id ?? null,
    providerCode: g.provider_code,
    gameType: g.game_type ?? null,
    aggregatorCategory: g.category ?? null,
    hasDemo: Boolean(g.has_demo), hasMobile: Boolean(g.has_mobile), hasDesktop: Boolean(g.has_desktop),
    freeRoundsSupport: Boolean(g.free_rounds_support),
    blockedCountries: strings(g.blocked_countries),
    certifiedMarkets: (g.certified_markets && typeof g.certified_markets === "object" ? g.certified_markets : null) as Record<string, unknown> | null,
    supportedCurrencies: strings(g.supported_currencies),
    aggregatorMetadata: raw,
    aggregatorAvailable: true,
    rtp, volatility: typeof g.volatility === "string" ? g.volatility.slice(0, 16) : null,
    updatedAt: new Date(),
  };
}
