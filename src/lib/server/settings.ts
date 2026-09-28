import "server-only";
import { db } from "@/db";
import { siteSettings } from "@/db/schema";

export const DEFAULT_SETTINGS = {
  site: {
    name: "Aurum Royale",
    tagline: "Prestige · Play · Worldwide",
    logoUrl: "",
    faviconUrl: "",
    contactEmail: "support@aurumroyale.example",
    contactPhone: "+44 20 0000 0000",
    address: "Placeholder Address, Valletta, Malta",
    socials: { x: "", telegram: "", instagram: "", youtube: "", discord: "" },
  },
  locale: { currency: "EUR", currencySymbol: "€", language: "EN", timezone: "UTC" },
  registration: { enabled: true, requireEmailVerification: false, requirePhone: false, minAge: 18 },
  maintenance: { enabled: false, message: "We are performing scheduled maintenance. We'll be back shortly." },
  support: { liveChatEnabled: true, email: "support@aurumroyale.example", hours: "24/7" },
  seo: {
    metaTitle: "Aurum Royale — Premium International Casino",
    metaDescription:
      "Aurum Royale is a premium international casino experience: world-class slots, live dealers, table games and exclusive VIP rewards.",
    ogImage: "/images/hero-main.jpg",
    canonicalUrl: "",
    keywords: "online casino, live casino, slots, table games, VIP",
    robotsIndex: true,
    robotsDisallow: "/admin\n/account\n/api",
  },
  deposit: { min: 10, max: 10000 },
  withdrawal: {
    min: 20,
    max: 5000,
    feePercent: 0,
    feeFixed: 0,
    dailyLimitAmount: 10000,
    dailyLimitCount: 5,
    requireKyc: false,
    requireEmailVerified: false,
  },
  referral: { enabled: true, commissionPercent: 5 },
  vip: { pointsPerDeposit: 1, pointsPerWager: 1 },
  security: { adminRequire2fa: false, sessionDays: 30, adminSessionHours: 12 },
};

export type Settings = typeof DEFAULT_SETTINGS;
export type SettingsKey = keyof Settings;

type CacheEntry = { at: number; value: Settings };
const g = globalThis as typeof globalThis & { __arSettings?: CacheEntry };

function merge<T>(base: T, override: unknown): T {
  if (override === null || typeof override !== "object" || Array.isArray(override)) return (override ?? base) as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(override as Record<string, unknown>)) {
    const b = (base as Record<string, unknown>)?.[k];
    out[k] = b && typeof b === "object" && !Array.isArray(b) ? merge(b, v) : v;
  }
  return out as T;
}

export async function getSettings(fresh = false): Promise<Settings> {
  if (!fresh && g.__arSettings && Date.now() - g.__arSettings.at < 5000) return g.__arSettings.value;
  let value: Settings = DEFAULT_SETTINGS;
  try {
    const rows = await db.select().from(siteSettings);
    const overrides: Record<string, unknown> = {};
    for (const r of rows) overrides[r.key] = r.value;
    value = merge(DEFAULT_SETTINGS, overrides);
  } catch (e) {
    console.error("[settings] failed to load, using defaults", e);
  }
  g.__arSettings = { at: Date.now(), value };
  return value;
}

export async function updateSetting<K extends SettingsKey>(key: K, value: Partial<Settings[K]>) {
  const current = (await getSettings(true))[key];
  const next = merge(current, value);
  await db
    .insert(siteSettings)
    .values({ key, value: next })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value: next, updatedAt: new Date() } });
  g.__arSettings = undefined;
  return next;
}

export function publicSettings(s: Settings) {
  return {
    site: s.site,
    locale: s.locale,
    registration: { enabled: s.registration.enabled, requirePhone: s.registration.requirePhone },
    support: s.support,
    referralEnabled: s.referral.enabled,
    deposit: s.deposit,
    withdrawal: { min: s.withdrawal.min, max: s.withdrawal.max, feePercent: s.withdrawal.feePercent, feeFixed: s.withdrawal.feeFixed },
    oauth: { google: Boolean(process.env.GOOGLE_CLIENT_ID), facebook: Boolean(process.env.FACEBOOK_CLIENT_ID) },
  };
}
export type PublicSettings = ReturnType<typeof publicSettings>;
