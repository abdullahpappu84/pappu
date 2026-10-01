/** Client-safe DTOs shared by server loaders, API routes and UI. */
export type GameArtDTO = { icon: string; from: string; to: string; glow: string };
export type LiveMetaDTO = { players: number; minBet: string; maxBet: string; icon: string; accent: string; tag?: string };

export type GameDTO = {
  id: string; // slug
  dbId: number;
  title: string;
  provider: string;
  categories: string[];
  popularity: number;
  hasDemo: boolean;
  image?: string;
  mobileImage?: string;
  art?: GameArtDTO;
  badge?: "HOT" | "NEW" | "JACKPOT";
  rtp: number;
  volatility: string;
  maxWin: string;
  displayType: "standard" | "live_table";
  status: "active" | "inactive" | "maintenance";
  featured: boolean;
  description?: string;
  live?: LiveMetaDTO;
};

export type CategoryDTO = { id: string; label: string; shortLabel?: string; icon: string; color: string; badge?: "HOT" | "NEW" };

export type BannerDTO = {
  id: string;
  eyebrow: string;
  titleTop: string;
  titleBottom: string;
  description: string;
  primaryCta: string;
  secondaryCta: string;
  link: string;
  secondaryLink: string;
  image: string;
  mobileImage?: string;
  imagePosition?: string;
  fit?: "cover" | "contain";
};

export type PromotionDTO = { id: string; title: string; value: string; note: string; icon: string; description: string; bonusId: number | null };

export type CatalogDTO = {
  games: GameDTO[];
  categories: CategoryDTO[];
  providers: string[];
  banners: BannerDTO[];
  promotions: PromotionDTO[];
};

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  status: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  twoFactorEnabled: boolean;
  kycStatus: string;
  referralCode: string;
  balance: number;
  bonus: number;
  currency: string;
  vipLevel: string;
  vipProgress: number;
  vipPoints: number;
  unread: number;
  favorites: string[];
  recent: string[];
};
