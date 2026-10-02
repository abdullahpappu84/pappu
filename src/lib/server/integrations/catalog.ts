import "server-only";
import { and, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { games, providers } from "@/db/schema";
import { baseVars, getPath, sendRequest, str, type Cfg } from "./engine";
import { resolveSecrets, type IntegrationRow } from "./store";

const slugify = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "game";
const FIELD_ALIASES: Record<string, string[]> = {
  gameId: ["id", "game_id", "gameId"], name: ["name", "title", "game_name"],
  provider: ["provider", "provider_name", "vendor"], providerCode: ["provider_code", "provider_id", "vendor_code"],
  thumbnail: ["image", "imageUrl", "thumbnail", "thumbnail_url", "thumbnailUrl", "image_url"], launchUrl: ["launch_url", "launchUrl", "url"],
  demoUrl: ["demo_url", "demoUrl"], rtp: ["rtp"], gameType: ["game_type", "type", "category"],
  currency: ["currency", "currencies"], status: ["status", "active"],
};

function catalogRows(row: IntegrationRow, data: unknown) {
  const cfg = (row.config ?? {}) as Cfg;
  const preferred = cfg.catalogGamesPath ? getPath(data, cfg.catalogGamesPath) : undefined;
  const raw = Array.isArray(data) ? data : Array.isArray(preferred) ? preferred : ["games", "data", "items", "results", "data.games", "data.items", "data.results"].map((path) => getPath(data, path)).find(Array.isArray);
  if (!Array.isArray(raw)) throw new Error("Catalog response did not contain a game array. Set the Games array path in catalog settings.");
  return raw.filter((item) => item && typeof item === "object") as Record<string, unknown>[];
}

async function fetchCatalog(row: IntegrationRow) {
  const cfg = (row.config ?? {}) as Cfg;
  const url = cfg.catalogMode === "live" ? cfg.catalogLiveUrl || cfg.catalogUrl : cfg.catalogSandboxUrl || cfg.catalogUrl;
  if (!url) throw new Error("Catalog URL is not configured for the selected environment.");
  const secrets = resolveSecrets(row.secrets);
  const vars = baseVars(secrets);
  const credentialName = cfg.catalogMode === "live" ? cfg.catalogLiveCredentialSecret : cfg.catalogSandboxCredentialSecret;
  const headers = cfg.catalogHeaders?.replace(/\{\{\s*secret\.API_KEY\s*\}\}/g, `{{secret.${credentialName || "API_KEY"}}}`);
  const result = await sendRequest({
    method: cfg.catalogMethod || "GET", url, contentType: cfg.catalogContentType || "json",
    headers, body: cfg.catalogBody,
  }, vars, row.name, secrets);
  return { data: result.data, records: catalogRows(row, result.data), thumbnailBaseUrl: url };
}

function resolveThumbnail(value: string, baseUrl: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value, baseUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
  } catch { return undefined; }
}

export function detectCatalogMapping(row: IntegrationRow, records: Record<string, unknown>[]) {
  const first = records[0];
  if (!first) throw new Error("The API returned no games to inspect.");
  const keys = Object.keys(first);
  const mapping: Record<string, string> = {};
  for (const [target, aliases] of Object.entries(FIELD_ALIASES)) {
    const found = aliases.find((alias) => keys.some((key) => key.toLowerCase() === alias.toLowerCase()));
    if (found) mapping[`catalogField${target[0].toUpperCase()}${target.slice(1)}`] = keys.find((key) => key.toLowerCase() === found.toLowerCase())!;
  }
  return { sampleFields: keys, detected: mapping, sample: Object.fromEntries(keys.slice(0, 30).map((key) => [key, first[key]])) };
}

export async function testCatalogConnection(row: IntegrationRow) {
  const { records } = await fetchCatalog(row);
  return { ok: true, fetched: records.length };
}

export async function syncIntegrationCatalog(row: IntegrationRow) {
  const cfg = (row.config ?? {}) as Cfg;
  const { records, thumbnailBaseUrl } = await fetchCatalog(row);
  const field = (name: string) => cfg[`catalogField${name[0].toUpperCase()}${name.slice(1)}`];
  const get = (record: Record<string, unknown>, name: string) => str(getPath(record, field(name)));
  let created = 0, updated = 0, skipped = 0, providersCreated = 0, providersMatched = 0, thumbnailsUpdated = 0;
  const providerIds = new Map<string, number>();
  const unmappedGames: { gameName: string; externalProviderId: string | null; externalProviderName: string | null; reason: string }[] = [];
  const existingProviders = await db.select().from(providers);

  for (const record of records) {
    const externalId = get(record, "gameId");
    const name = get(record, "name");
    const externalProviderCode = get(record, "providerCode");
    const externalProviderName = get(record, "provider");
    if (!externalId || !name) { skipped++; continue; }
    try {
      let providerId: number | null = null;
      const providerKey = externalProviderCode ? `code:${externalProviderCode.toLowerCase()}` : externalProviderName ? `name:${externalProviderName.toLowerCase()}` : "";
      if (!providerKey) unmappedGames.push({ gameName: name, externalProviderId: null, externalProviderName: null, reason: "The catalog record has no provider code or provider name." });
      if (providerKey) {
        providerId = providerIds.get(providerKey) ?? null;
        if (!providerId) {
          const byCode = externalProviderCode ? existingProviders.find((candidate) => {
            const metadata = candidate.aggregatorMetadata ?? {};
            const savedCode = str(metadata[`api_${row.code}_provider_code`] ?? metadata.provider_code ?? metadata.providerCode);
            return [candidate.slug, savedCode].some((value) => value.toLowerCase() === externalProviderCode.toLowerCase());
          }) : undefined;
          const existing = byCode ?? (externalProviderName ? existingProviders.find((candidate) => [candidate.name, candidate.slug].some((value) => value.toLowerCase() === externalProviderName.toLowerCase())) : undefined);
          if (existing) { providerId = existing.id; providersMatched++; }
          else {
            const identity = externalProviderCode || externalProviderName;
            const providerSlug = `api-${slugify(row.code)}-${slugify(identity)}`.slice(0, 80);
            const providerName = (externalProviderName || externalProviderCode).slice(0, 80);
            const [createdProvider] = await db.insert(providers).values({
              name: providerName, slug: providerSlug, adapter: row.code,
              aggregatorMetadata: { [`api_${row.code}_provider_code`]: externalProviderCode || externalProviderName, apiName: row.name },
            }).onConflictDoNothing().returning({ id: providers.id });
            if (createdProvider) { providerId = createdProvider.id; providersCreated++; }
            else {
              const [conflictProvider] = await db.select({ id: providers.id }).from(providers).where(or(eq(providers.slug, providerSlug), eq(providers.name, providerName))).limit(1);
              providerId = conflictProvider?.id ?? null;
            }
          }
          if (providerId) providerIds.set(providerKey, providerId);
        }
      }

      const slug = `api-${slugify(row.code)}-${slugify(externalId)}`.slice(0, 120);
      const [old] = await db.select().from(games).where(or(eq(games.slug, slug), and(providerId ? eq(games.providerId, providerId) : sql`false`, eq(games.providerGameId, externalId)))).limit(1);
      const thumbnail = resolveThumbnail(get(record, "thumbnail"), thumbnailBaseUrl);
      const rtpRaw = get(record, "rtp");
      const rtp = Number(rtpRaw);
      const values = {
        ...(providerId ? { providerId } : {}),
        ...(externalProviderCode ? { providerCode: externalProviderCode.slice(0, 80) } : {}),
        providerGameId: externalId.slice(0, 160), integrationRef: externalId.slice(0, 120),
        ...(thumbnail ? { thumbnail } : {}),
        ...(get(record, "gameType") ? { gameType: get(record, "gameType").slice(0, 80) } : {}),
        ...(Number.isFinite(rtp) && rtp >= 0 && rtp <= 100 ? { rtp: rtp.toFixed(2) } : {}),
        aggregatorMetadata: {
          ...(old?.aggregatorMetadata ?? {}),
          customApi: {
            code: row.code, externalGameId: externalId,
            launchUrl: get(record, "launchUrl") || undefined, demoUrl: get(record, "demoUrl") || undefined,
            currency: get(record, "currency") || undefined, remoteStatus: get(record, "status") || undefined,
          },
        },
        updatedAt: new Date(),
      };
      if (old) {
        await db.update(games).set({ name: name.slice(0, 120), ...values }).where(eq(games.id, old.id));
        if (thumbnail && thumbnail !== old.thumbnail) thumbnailsUpdated++;
        updated++;
      } else {
        await db.insert(games).values({ name: name.slice(0, 120), slug, status: "active", ...values });
        if (thumbnail) thumbnailsUpdated++;
        created++;
      }
    } catch (error) {
      skipped++;
      console.error(`[game-catalog:${row.code}] record skipped`, error instanceof Error ? error.message : "unknown error");
    }
  }
  return { api: row.name, totalFetched: records.length, newGames: created, updatedGames: updated, skipped, providersMatched, providersCreated, thumbnailsUpdated, errors: skipped, unmappedGames };
}

export { fetchCatalog };
