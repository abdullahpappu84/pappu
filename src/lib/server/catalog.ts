import "server-only";
import { and, asc, desc, eq, gt, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  banners,
  categories,
  favorites,
  gameCategories,
  games,
  notifications,
  promotions,
  providers,
  recentlyPlayed,
  vipLevels,
  vipUsers,
  wallets,
} from "@/db/schema";
import type { BannerDTO, CatalogDTO, GameDTO, SessionUser } from "@/lib/types";
import type { UserRow } from "./auth";

type GameRow = typeof games.$inferSelect;

export function toGameDTO(g: GameRow, provider: string | null, cats: string[], actualPopular = false): GameDTO {
  const derived = new Set(cats);
  if (g.isPopular || actualPopular) derived.add("popular");
  if (g.isNew) derived.add("new");
  return {
    id: g.slug,
    dbId: g.id,
    title: g.name,
    provider: provider ?? "Aurum Studios",
    categories: [...derived],
    popularity: g.playCount,
    hasDemo: g.hasDemo,
    image: g.thumbnail ?? undefined,
    mobileImage: g.mobileThumbnail ?? undefined,
    art: g.art ?? undefined,
    badge: (g.badge as GameDTO["badge"]) ?? undefined,
    rtp: Number(g.rtp ?? 0),
    volatility: g.volatility ?? "Unknown",
    maxWin: g.maxWin,
    displayType: g.displayType,
    status: g.status,
    featured: g.isFeatured,
    description: g.description ?? undefined,
    live:
      g.displayType === "live_table"
        ? { players: g.meta?.players ?? 0, minBet: g.meta?.minBet ?? "€1", maxBet: g.meta?.maxBet ?? "€1K", icon: g.meta?.icon ?? "Crown", accent: g.meta?.accent ?? "#f9cf66", tag: g.meta?.tag }
        : undefined,
  };
}

export async function loadGames(where = ne(games.status, "inactive")): Promise<GameDTO[]> {
  const rows = await db
    .select({ g: games, provider: providers.name })
    .from(games)
    .leftJoin(providers, eq(providers.id, games.providerId))
    .where(and(where, or(isNull(games.providerId), eq(providers.isActive, true)), or(isNull(games.aggregatorGameId), eq(games.aggregatorAvailable, true))))
    .orderBy(asc(games.sortOrder), asc(games.id));
  if (!rows.length) return [];
  const links = await db
    .select({ gameId: gameCategories.gameId, slug: categories.slug })
    .from(gameCategories)
    .innerJoin(categories, eq(categories.id, gameCategories.categoryId))
    .where(and(inArray(gameCategories.gameId, rows.map((r) => r.g.id)), eq(categories.isActive, true)));
  const map = new Map<number, string[]>();
  for (const l of links) map.set(l.gameId, [...(map.get(l.gameId) ?? []), l.slug]);
  const popularIds = new Set(rows.filter((r) => r.g.playCount > 0).sort((a, b) => b.g.playCount - a.g.playCount).slice(0, 20).map((r) => r.g.id));
  return rows.map((r) => toGameDTO(r.g, r.provider, map.get(r.g.id) ?? [], popularIds.has(r.g.id)));
}

export async function loadCatalog(): Promise<CatalogDTO> {
  const now = new Date();
  const scheduled = (t: typeof banners | typeof promotions) =>
    and(or(isNull(t.startsAt), lte(t.startsAt, now)), or(isNull(t.endsAt), gt(t.endsAt, now)));
  const [gameList, cats, provs, bans, promos] = await Promise.all([
    loadGames(),
    db.select().from(categories).where(and(eq(categories.isActive, true), eq(categories.showInSlider, true))).orderBy(asc(categories.sortOrder)),
    db.select().from(providers).where(eq(providers.isActive, true)).orderBy(asc(providers.sortOrder), asc(providers.name)),
    db.select().from(banners).where(and(eq(banners.isActive, true), scheduled(banners))).orderBy(asc(banners.sortOrder)),
    db.select().from(promotions).where(and(eq(promotions.isActive, true), scheduled(promotions))).orderBy(asc(promotions.sortOrder)),
  ]);
  return {
    games: gameList,
    categories: cats.map((c) => ({ id: c.slug, label: c.name, shortLabel: c.shortLabel ?? undefined, icon: c.icon, color: c.color, badge: (c.badge as "HOT" | "NEW") ?? undefined })),
    providers: ["All Providers", ...provs.map((p) => p.name)],
    banners: bans.map(
      (b): BannerDTO => ({
        id: String(b.id),
        eyebrow: b.eyebrow ?? "",
        titleTop: b.title,
        titleBottom: b.titleAccent ?? "",
        description: b.description ?? "",
        primaryCta: b.ctaLabel ?? "Play Now",
        secondaryCta: b.secondaryCtaLabel ?? "",
        link: b.link ?? "#games",
        secondaryLink: b.secondaryLink ?? "#categories",
        image: b.desktopImage,
        mobileImage: b.mobileImage ?? undefined,
        imagePosition: b.imagePosition ?? undefined,
        fit: (b.fit as "cover" | "contain") ?? "cover",
      }),
    ),
    promotions: promos.map((p) => ({ id: p.slug, title: p.title, value: p.value, note: p.note ?? "", icon: p.icon, description: p.description ?? "", bonusId: p.bonusId })),
  };
}

export async function buildSessionUser(u: UserRow): Promise<SessionUser> {
  const [[wallet], [vip], levels, [{ unread }], favs, recent] = await Promise.all([
    db.select().from(wallets).where(eq(wallets.userId, u.id)),
    db.select({ points: vipUsers.points, levelId: vipUsers.levelId }).from(vipUsers).where(eq(vipUsers.userId, u.id)),
    db.select().from(vipLevels).orderBy(asc(vipLevels.minPoints)),
    db.select({ unread: sql<number>`count(*)::int` }).from(notifications).where(and(eq(notifications.userId, u.id), isNull(notifications.readAt))),
    db.select({ slug: games.slug }).from(favorites).innerJoin(games, eq(games.id, favorites.gameId)).where(eq(favorites.userId, u.id)).orderBy(desc(favorites.createdAt)),
    db.select({ slug: games.slug }).from(recentlyPlayed).innerJoin(games, eq(games.id, recentlyPlayed.gameId)).where(eq(recentlyPlayed.userId, u.id)).orderBy(desc(recentlyPlayed.lastPlayedAt)).limit(12),
  ]);
  const points = vip?.points ?? 0;
  const current = [...levels].reverse().find((l) => l.minPoints <= points) ?? levels[0];
  const next = levels.find((l) => l.minPoints > points);
  const progress = next && current ? Math.min(100, Math.round(((points - current.minPoints) / (next.minPoints - current.minPoints)) * 100)) : 100;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    avatarUrl: u.avatarUrl,
    status: u.status,
    emailVerified: Boolean(u.emailVerifiedAt),
    phoneVerified: Boolean(u.phoneVerifiedAt),
    twoFactorEnabled: u.twoFactorEnabled,
    kycStatus: u.kycStatus,
    referralCode: u.referralCode,
    balance: Number(wallet?.mainBalance ?? 0),
    bonus: Number(wallet?.bonusBalance ?? 0),
    currency: wallet?.currency ?? "EUR",
    vipLevel: current?.name ?? "Bronze",
    vipProgress: progress,
    vipPoints: points,
    unread,
    favorites: favs.map((f) => f.slug),
    recent: recent.map((r) => r.slug),
  };
}
