import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { games, profiles, providers, recentlyPlayed, wallets } from "@/db/schema";
import type { UserRow } from "../auth";
import { signTicket, verifyTicket } from "../crypto";
import { conflict, forbidden, getIp, notFound, unauthorized } from "../http";
import { appUrl } from "../mailer";
import { findBuiltinGameAdapter } from "./adapters";
import { buildGameAdapter } from "../integrations/game";
import { findIntegration } from "../integrations/store";

const TOKEN_TTL = 6 * 3600; // seconds

export type GameToken = { uid: string; g: string; k: "game" };
export const verifyGameToken = (token: string) => {
  const t = verifyTicket<GameToken>(token);
  return t && t.k === "game" ? t : null;
};

export async function launchGame(req: Request, opts: { slug: string; mode: "real" | "demo"; device?: "desktop" | "mobile"; user: UserRow | null }) {
  const [row] = await db.select({ g: games, provider: providers }).from(games).leftJoin(providers, eq(providers.id, games.providerId)).where(eq(games.slug, opts.slug));
  if (!row || row.g.status === "inactive" || (row.provider && !row.provider.isActive)) throw notFound("Game not found.");
  if (row.g.aggregatorGameId && !row.g.aggregatorAvailable) throw notFound("Game is no longer available.");
  if (row.g.status === "maintenance") throw conflict(`${row.g.name} is under maintenance. Please try again later.`);

  const { user } = opts;
  if (opts.mode === "real") {
    if (!user) throw unauthorized();
    if (user.status !== "active") throw forbidden("Your account is restricted. Please contact support.", "ACCOUNT_RESTRICTED");
  }

  let currency = "EUR";
  let language = "EN";
  if (user) {
    const [[w], [p]] = await Promise.all([db.select().from(wallets).where(eq(wallets.userId, user.id)), db.select().from(profiles).where(eq(profiles.userId, user.id))]);
    currency = w?.currency ?? currency;
    language = p?.language ?? language;
  }

  const code = row.provider?.adapter;
  let adapter = findBuiltinGameAdapter(code);
  if (!adapter) {
    const integration = code ? await findIntegration("game", code) : null;
    if (!integration || !integration.isActive) throw conflict("This game provider is not available right now.");
    adapter = buildGameAdapter(integration);
  }
  const token = user && opts.mode === "real" ? signTicket({ uid: user.id, g: row.g.slug, k: "game" }, TOKEN_TTL) : null;
  const result = await adapter.launch({
    game: row.g,
    providerSlug: row.provider?.slug ?? null,
    mode: opts.mode,
    user: user ? { id: user.id, name: user.name, email: user.email, currency } : null,
    token,
    language,
    device: opts.device ?? "desktop",
    lobbyUrl: `${appUrl(req)}/`,
    ip: getIp(req),
    country: user ? (await db.select({ country: profiles.country }).from(profiles).where(eq(profiles.userId, user.id)))[0]?.country : null,
  });

  if (user && opts.mode === "real") {
    await db
      .insert(recentlyPlayed)
      .values({ userId: user.id, gameId: row.g.id })
      .onConflictDoUpdate({ target: [recentlyPlayed.userId, recentlyPlayed.gameId], set: { lastPlayedAt: new Date(), playCount: sql`${recentlyPlayed.playCount} + 1` } });
  }
  await db.update(games).set({ playCount: sql`${games.playCount} + 1` }).where(eq(games.id, row.g.id));
  return { launchUrl: result.url, display: result.display, title: row.g.name, adapter: adapter.code, mode: result.mode ?? opts.mode };
}
