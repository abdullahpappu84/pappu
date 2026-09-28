import {
  Cherry,
  CircleDot,
  Club,
  Coins,
  Crown,
  Diamond,
  Dice5,
  Dices,
  Fish,
  Flag,
  Flame,
  Gamepad2,
  Gem,
  Gift,
  Globe,
  Goal,
  Heart,
  LayoutGrid,
  Plane,
  Radio,
  RefreshCcw,
  Rocket,
  Spade,
  Sparkles,
  Star,
  Swords,
  Trophy,
  UserRound,
  Vault,
  Zap,
  type LucideIcon,
} from "lucide-react";

/** Admin-selectable icon names → Lucide components. */
export const ICONS: Record<string, LucideIcon> = {
  Cherry, CircleDot, Club, Coins, Crown, Diamond, Dice5, Dices, Fish, Flag, Flame, Gamepad2, Gem, Gift, Globe, Goal,
  Heart, LayoutGrid, Plane, Radio, RefreshCcw, Rocket, Spade, Sparkles, Star, Swords, Trophy, UserRound, Vault, Zap,
};

export const ICON_NAMES = Object.keys(ICONS);
export const iconFor = (name?: string | null): LucideIcon => (name && ICONS[name]) || Sparkles;
