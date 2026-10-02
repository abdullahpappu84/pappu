import "server-only";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { games, providers } from "@/db/schema";
import { listAllAggregatorGames, listAggregatorProviders, type AggregatorGame } from "@/lib/aggregator";

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);
const strings = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
const resolveThumbnail = (value?: string | null) => {
  if (!value) return undefined;
  const base = process.env.AGGREGATOR_API_URL?.trim() || process.env.GAME_API_URL?.trim() || "https://api.aggregator.gg/v1";
  try { const url = new URL(value, base); return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined; }
  catch { return undefined; }
};

export async function syncAggregatorCatalog() {
  // Complete both remote reads before mutating local availability. A partial fetch must never
  // deactivate the rest of the catalog.
  const [catalog, registry] = await Promise.all([listAllAggregatorGames(), listAggregatorProviders()]);
  const providerByCode = new Map<string, number>();
  let providersMatched = 0, providersCreated = 0;
  const upsertProvider = async (code: string, metadata?: Record<string, unknown>, registered?: boolean) => {
    const slug = `aggregator-${slugify(code)}`;
    const normalizedCode = code.trim().toLowerCase();
    const [existing] = await db.select({ id: providers.id, slug: providers.slug }).from(providers)
      .where(or(
        eq(providers.slug, slug),
        sql`lower(${providers.slug}) = ${normalizedCode}`,
        sql`lower(${providers.name}) = ${normalizedCode}`,
        sql`${providers.aggregatorMetadata}->>'provider_code' = ${code}`,
      )).limit(1);
    // An existing provider's local label, adapter, enabled flag and other settings belong to Admin.
    if (existing) { providersMatched++; return existing.id; }
    const [created] = await db.insert(providers).values({
      name: code, slug, adapter: "aggregator", isActive: registered !== false,
      aggregatorMetadata: metadata ?? null,
    }).returning({ id: providers.id });
    providersCreated++;
    return created.id;
  };
  for (const p of registry) {
    const code = p.provider_code;
    if (!code) continue;
    const normalized = code.trim().toLowerCase();
    if (!providerByCode.has(normalized)) providerByCode.set(normalized, await upsertProvider(code, p as unknown as Record<string, unknown>, p.is_registered));
  }
  // Catalog provider codes are authoritative even if an entry is absent from registry.
  for (const code of new Set(catalog.map(g => g.provider_code).filter((x): x is string => !!x))) {
    const normalizedCode = code.trim().toLowerCase();
    if (providerByCode.has(normalizedCode)) continue;
    providerByCode.set(normalizedCode, await upsertProvider(code));
  }

  const catalogIds = catalog.map((g) => g.id).filter(Boolean);
  const providerCodes = [...new Set(catalog.map((g) => g.provider_code).filter((x): x is string => Boolean(x)))];
  const providerGameIds = [...new Set(catalog.map((g) => g.provider_game_id).filter((x): x is string => Boolean(x)))];
  const existingRows = catalogIds.length ? await db.select({
    id: games.id, name: games.name, slug: games.slug, providerId: games.providerId,
    aggregatorGameId: games.aggregatorGameId, integrationRef: games.integrationRef,
    providerGameId: games.providerGameId, providerCode: games.providerCode,
    thumbnail: games.thumbnail, providerAdapter: providers.adapter,
  }).from(games).leftJoin(providers, eq(providers.id, games.providerId)).where(or(
    inArray(games.aggregatorGameId, catalogIds),
    and(inArray(games.integrationRef, catalogIds), eq(providers.adapter, "aggregator")),
    ...(providerCodes.length && providerGameIds.length ? [and(eq(providers.adapter, "aggregator"), inArray(games.providerCode, providerCodes), inArray(games.providerGameId, providerGameIds))] : []),
  )) : [];
  let created = 0, updated = 0, failed = 0, thumbnailsUpdated = 0;
  const matchedIds = new Set<number>();
  for (const g of catalog) {
    try {
      if (!g.id || !g.name || !g.provider_code) throw new Error("required catalog fields missing");
      const old = existingRows.find((row) => !matchedIds.has(row.id) && (
        row.aggregatorGameId === g.id || (row.providerAdapter === "aggregator" && row.integrationRef === g.id) ||
        (row.providerAdapter === "aggregator" && row.providerCode?.toLowerCase() === g.provider_code.toLowerCase() && row.providerGameId === g.provider_game_id)
      ));
      const providerId = providerByCode.get(g.provider_code.trim().toLowerCase()) ?? null;
      if (old) {
        const thumbnail = resolveThumbnail(g.thumbnail_url);
        if (thumbnail && thumbnail !== old.thumbnail) thumbnailsUpdated++;
        const repair = {
          providerId,
          aggregatorGameId: g.id,
          integrationRef: old.integrationRef ?? g.id,
          providerGameId: g.provider_game_id ?? old.providerGameId,
          providerCode: g.provider_code,
          thumbnail: thumbnail ?? old.thumbnail,
          updatedAt: new Date(),
        };
        await db.update(games).set(repair).where(eq(games.id, old.id));
        matchedIds.add(old.id);
        updated++;
      } else {
        const values = toGameValues(g, providerId, `agg-${slugify(g.id)}`);
        await db.insert(games).values(values);
        if (resolveThumbnail(g.thumbnail_url)) thumbnailsUpdated++;
        created++;
      }
    } catch (e) {
      failed++;
      console.error("[aggregator-sync] catalog record failed", g.id || "unknown", e instanceof Error ? e.message : "unknown error");
    }
  }
  return { totalFetched: catalog.length, newGames: created, updatedGames: updated, deactivatedGames: 0, failedRecords: failed, providersMatched, providersCreated, thumbnailsUpdated };
}

function toGameValues(g: AggregatorGame, providerId: number | null, slug: string) {
  const raw = g as unknown as Record<string, unknown>;
  const rtp = typeof g.rtp === "number" || typeof g.rtp === "string" ? String(g.rtp) : null;
  return {
    name: g.name.slice(0, 120), slug, providerId,
    thumbnail: resolveThumbnail(g.thumbnail_url) ?? null,
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
