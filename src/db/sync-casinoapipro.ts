import "dotenv/config";
import { eq, or } from "drizzle-orm";
import { db, pool } from "./index";
import { categories, gameCategories, games, providers } from "./schema";

type RemoteGame = {
  slug: string;
  name: string;
  category?: string;
  thumbnail_url?: string;
  rtp?: string | number;
  volatility?: string;
  description?: string;
  min_bet?: string;
  max_bet?: string;
  max_win?: string;
};

async function main() {
  const apiKey = process.env.CASINOAPIPRO_API_KEY?.trim();
  const apiSecret = process.env.CASINOAPIPRO_API_SECRET?.trim();
  const base = (process.env.CASINOAPIPRO_BASE_URL || "https://api.casinoapipro.com/v1").replace(/\/$/, "");
  if (!apiKey || !apiSecret) throw new Error("Set CASINOAPIPRO_API_KEY and CASINOAPIPRO_API_SECRET in .env first.");

  const authResponse = await fetch(`${base}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ api_key: apiKey, api_secret: apiSecret }),
    signal: AbortSignal.timeout(15000),
  });
  const auth = (await authResponse.json().catch(() => ({}))) as { access_token?: string; message?: string; error?: string };
  if (!authResponse.ok || !auth.access_token) throw new Error(auth.message || auth.error || "Casino API Pro authentication failed.");

  const gamesResponse = await fetch(`${base}/games`, {
    headers: { Authorization: `Bearer ${auth.access_token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  const response = (await gamesResponse.json().catch(() => ({}))) as { data?: RemoteGame[]; games?: RemoteGame[]; message?: string; error?: string } | RemoteGame[];
  if (!gamesResponse.ok) {
    const error = response as { message?: string; error?: string };
    throw new Error(error.message || error.error || "Could not read the Casino API Pro catalogue.");
  }
  const remoteGames = Array.isArray(response) ? response : response.data ?? response.games ?? [];
  if (!remoteGames.length) throw new Error("Casino API Pro returned an empty game catalogue.");

  await db.transaction(async (tx) => {
    const [existingProvider] = await tx
      .select()
      .from(providers)
      .where(or(eq(providers.slug, "casino-api-pro"), eq(providers.name, "Casino API Pro")))
      .limit(1);
    const [provider] = existingProvider
      ? [existingProvider]
      : await tx.insert(providers).values({ name: "Casino API Pro", slug: "casino-api-pro", adapter: "casino_api_pro", isActive: true, sortOrder: 90 }).returning();

    const categoryIds = new Map<string, number>();
    for (const categorySlug of [...new Set(remoteGames.map((g) => (g.category || "instant").toLowerCase()))]) {
      const existing = await tx.select().from(categories).where(eq(categories.slug, categorySlug)).limit(1);
      const [category] = existing.length
        ? existing
        : await tx
            .insert(categories)
            .values({
              slug: categorySlug,
              name: categorySlug === "crash" ? "Crash Games" : "Instant Games",
              shortLabel: categorySlug === "crash" ? "Crash" : "Instant",
              icon: categorySlug === "crash" ? "Rocket" : "Zap",
              color: categorySlug === "crash" ? "#60a5fa" : "#f9cf66",
              sortOrder: 20,
            })
            .returning();
      categoryIds.set(categorySlug, category.id);
    }

    for (const [index, remote] of remoteGames.entries()) {
      const slug = `capro-${remote.slug}`;
      const categorySlug = (remote.category || "instant").toLowerCase();
      const rtp = Number(remote.rtp ?? 97);
      const volatility = (remote.volatility || "medium").replace(/(^|-)([a-z])/g, (_match, sep: string, letter: string) => `${sep}${letter.toUpperCase()}`);
      const [existingGame] = await tx.select().from(games).where(or(
        eq(games.slug, slug),
        eq(games.integrationRef, remote.slug),
      )).limit(1);
      const apiFields = {
          slug,
          name: remote.name,
          providerId: provider.id,
          apiSource: "casino_api_pro",
          apiExternalId: remote.slug,
          ...(remote.thumbnail_url ? { thumbnail: remote.thumbnail_url } : {}),
          ...(remote.description ? { description: remote.description } : {}),
          integrationRef: remote.slug,
          rtp: (Number.isFinite(rtp) ? rtp : 97).toFixed(2),
          volatility,
          ...(remote.max_win ? { maxWin: remote.max_win } : {}),
          meta: { ...(existingGame?.meta ?? {}), minBet: remote.min_bet, maxBet: remote.max_bet },
        };
      const [game] = existingGame
        ? await tx.update(games).set({ ...apiFields, updatedAt: new Date() }).where(eq(games.id, existingGame.id)).returning()
        : await tx.insert(games).values({ ...apiFields, status: "active", sortOrder: 900 + index }).returning();

      const categoryId = categoryIds.get(categorySlug);
      if (categoryId) await tx.insert(gameCategories).values({ gameId: game.id, categoryId }).onConflictDoNothing();
    }
  });

  console.log(`Synced ${remoteGames.length} Casino API Pro games.`);
  console.log(remoteGames.map((game) => `- ${game.name} (${game.slug})`).join("\n"));
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Casino API Pro catalogue sync failed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
