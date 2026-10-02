import "server-only";
import { and, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { categories, gameCategories, games, providers } from "@/db/schema";

type RemoteGame = { slug: string; name: string; category?: string; thumbnail_url?: string; rtp?: string | number; volatility?: string; description?: string; min_bet?: string; max_bet?: string; max_win?: string };
const slugify = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);

async function readCatalog() {
  const apiKey = process.env.CASINOAPIPRO_API_KEY?.trim() || process.env.CASINO_API_KEY?.trim();
  const apiSecret = process.env.CASINOAPIPRO_API_SECRET?.trim() || process.env.CASINO_API_SECRET?.trim();
  const base = (process.env.CASINOAPIPRO_BASE_URL?.trim() || process.env.CASINO_API_URL?.trim() || "https://api.casinoapipro.com/v1").replace(/\/$/, "");
  if (!apiKey || !apiSecret) throw new Error("Casino API Pro credentials are not configured.");
  const authResponse = await fetch(`${base}/auth/token`, {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ api_key: apiKey, api_secret: apiSecret }), cache: "no-store", signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  if (!authResponse) throw new Error("Casino API Pro is unreachable.");
  const auth = await authResponse.json().catch(() => ({})) as Record<string, unknown>;
  const authData = auth.data && typeof auth.data === "object" ? auth.data as Record<string, unknown> : {};
  const token = String(auth.access_token ?? authData.access_token ?? "");
  if (!authResponse.ok || !token) throw new Error(String(auth.message ?? auth.error ?? "Casino API Pro authentication failed."));
  const catalogResponse = await fetch(`${base}/games`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  if (!catalogResponse) throw new Error("Casino API Pro catalog is unreachable.");
  const response = await catalogResponse.json().catch(() => ({})) as Record<string, unknown> | RemoteGame[];
  if (!catalogResponse.ok) {
    const data = response as Record<string, unknown>;
    throw new Error(String(data.message ?? data.error ?? "Could not read Casino API Pro catalog."));
  }
  const data = response as Record<string, unknown>;
  const nested = data.data && typeof data.data === "object" && !Array.isArray(data.data) ? data.data as Record<string, unknown> : {};
  const catalog = Array.isArray(response) ? response : (Array.isArray(data.data) ? data.data : Array.isArray(data.games) ? data.games : Array.isArray(nested.games) ? nested.games : []) as RemoteGame[];
  if (!Array.isArray(catalog)) throw new Error("Casino API Pro returned an invalid catalog.");
  return { catalog: catalog as RemoteGame[], base };
}

export async function testCasinoApiProCatalog() {
  const { catalog } = await readCatalog();
  return { ok: true, fetched: catalog.length };
}

export async function syncCasinoApiProCatalog() {
  const { catalog, base } = await readCatalog();
  let providerMatched = 0, providerCreated = 0, created = 0, updated = 0, thumbnailsUpdated = 0, skipped = 0;
  await db.transaction(async (tx) => {
    const [existingProvider] = await tx.select().from(providers).where(or(eq(providers.slug, "casino-api-pro"), eq(providers.name, "Casino API Pro"))).limit(1);
    let provider = existingProvider;
    if (provider) providerMatched++;
    else {
      [provider] = await tx.insert(providers).values({ name: "Casino API Pro", slug: "casino-api-pro", adapter: "casino_api_pro", isActive: true, sortOrder: 90 }).returning();
      providerCreated++;
    }
    const categoriesBySlug = new Map((await tx.select({ id: categories.id, slug: categories.slug, name: categories.name }).from(categories)).map((category) => [category.slug, category]));
    for (const [index, remote] of catalog.entries()) {
      if (!remote?.slug || !remote.name) { skipped++; continue; }
      try {
        const slug = `capro-${slugify(remote.slug)}`;
        const [old] = await tx.select().from(games).where(or(eq(games.slug, slug), and(eq(games.providerId, provider.id), eq(games.providerGameId, remote.slug)))).limit(1);
        const rtp = Number(remote.rtp);
        const apiFields = {
          name: remote.name.slice(0, 120), providerId: provider.id,
          apiSource: "casino_api_pro", apiExternalId: remote.slug.slice(0, 160),
          providerGameId: remote.slug.slice(0, 160), integrationRef: remote.slug.slice(0, 120),
          ...(remote.thumbnail_url ? { thumbnail: resolveThumbnail(remote.thumbnail_url, base) } : {}),
          ...(remote.description ? { description: remote.description } : {}),
          ...(Number.isFinite(rtp) && rtp >= 0 && rtp <= 100 ? { rtp: rtp.toFixed(2) } : {}),
          ...(remote.volatility ? { volatility: remote.volatility.slice(0, 16) } : {}),
          ...(remote.max_win ? { maxWin: remote.max_win.slice(0, 32) } : {}),
          aggregatorMetadata: { ...(old?.aggregatorMetadata ?? {}), casinoApiPro: { externalGameId: remote.slug } },
          meta: { ...(old?.meta ?? {}), ...(remote.min_bet ? { minBet: remote.min_bet } : {}), ...(remote.max_bet ? { maxBet: remote.max_bet } : {}) },
          updatedAt: new Date(),
        };
        const [game] = old
          ? await tx.update(games).set(apiFields).where(eq(games.id, old.id)).returning()
          : await tx.insert(games).values({ ...apiFields, slug, status: "active", sortOrder: 900 + index }).returning();
        if (old) updated++; else created++;
        if (remote.thumbnail_url && apiFields.thumbnail && apiFields.thumbnail !== old?.thumbnail) thumbnailsUpdated++;
        const categorySlug = slugify(remote.category || "");
        const category = categoriesBySlug.get(categorySlug) ?? [...categoriesBySlug.values()].find((entry) => entry.name.toLowerCase() === (remote.category || "").toLowerCase());
        if (category) await tx.insert(gameCategories).values({ gameId: game.id, categoryId: category.id }).onConflictDoNothing();
      } catch {
        skipped++;
      }
    }
  });
  return { api: "Casino API Pro", totalFetched: catalog.length, newGames: created, updatedGames: updated, skipped, providersMatched: providerMatched, providersCreated: providerCreated, thumbnailsUpdated, errors: skipped };
}

function resolveThumbnail(value: string, baseUrl: string) {
  try {
    const url = new URL(value, baseUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
  } catch { return undefined; }
}
