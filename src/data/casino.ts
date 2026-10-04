import { Cherry, Crown, Dice5, Dices, Gift, Globe, Headphones, House, ShieldCheck, Sparkles, Trophy, UserRound } from "lucide-react";
import type { NavItem } from "./types";

/** Static UI configuration. Games, categories, providers, banners and promotions are loaded from the database. */
export const BRAND = {
  name: "Aurum Royale",
  first: "Aurum",
  second: "Royale",
  tagline: "Prestige · Play · Worldwide",
};

export const NAV_ITEMS: NavItem[] = [
  { id: "home", label: "Home", icon: House, target: "top" },
  { id: "casino", label: "Casino", icon: Dices, target: "games", category: "all" },
  { id: "sports", label: "Sports", icon: Trophy, target: "sports" },
  { id: "live", label: "Live Casino", icon: UserRound, target: "live-casino" },
  { id: "slots", label: "Slots", icon: Cherry, target: "games", category: "slots" },
  { id: "table", label: "Table Games", icon: Dice5, target: "games", category: "table" },
  { id: "promotions", label: "Promotions", icon: Gift, target: "promotions" },
  { id: "vip", label: "VIP", icon: Crown, target: "trust" },
];

export const QUICK_FILTERS: { id: "popular" | "new" | "live" | "jackpot"; label: string; icon: typeof Crown }[] = [
  { id: "popular", label: "Popular", icon: Crown },
  { id: "new", label: "New", icon: Sparkles },
  { id: "live", label: "Live", icon: UserRound },
  { id: "jackpot", label: "Jackpot", icon: Gift },
];

export const HERO_STATS = [
  { icon: Crown, title: "1000+", subtitle: "Casino Games" },
  { icon: ShieldCheck, title: "Fast & Secure", subtitle: "Transactions" },
  { icon: Headphones, title: "24/7", subtitle: "Live Support" },
  { icon: Globe, title: "Global", subtitle: "Players" },
];

export const LANGUAGES = [
  { code: "EN", label: "English", flag: "🇬🇧" },
  { code: "DE", label: "Deutsch", flag: "🇩🇪" },
  { code: "ES", label: "Español", flag: "🇪🇸" },
  { code: "FR", label: "Français", flag: "🇫🇷" },
  { code: "PT", label: "Português", flag: "🇧🇷" },
  { code: "TR", label: "Türkçe", flag: "🇹🇷" },
  { code: "JA", label: "日本語", flag: "🇯🇵" },
];
