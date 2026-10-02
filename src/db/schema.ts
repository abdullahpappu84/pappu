import { sql, type SQL } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/* ============================== ENUMS ============================== */
export const userStatus = pgEnum("user_status", ["active", "pending", "suspended", "banned"]);
export const kycStatus = pgEnum("kyc_status", ["none", "pending", "under_review", "approved", "rejected", "resubmission"]);
export const txType = pgEnum("tx_type", [
  "deposit",
  "withdrawal",
  "bonus",
  "cashback",
  "refund",
  "adjustment",
  "commission",
  "bet",
  "win",
  "bonus_conversion",
  "bonus_forfeit",
  "fee",
  "other",
]);
export const txStatus = pgEnum("tx_status", ["pending", "completed", "failed", "reversed"]);
export const balanceType = pgEnum("balance_type", ["main", "bonus"]);
export const depositStatus = pgEnum("deposit_status", ["pending", "approved", "rejected", "cancelled"]);
export const withdrawalStatus = pgEnum("withdrawal_status", ["pending", "processing", "approved", "rejected", "completed", "cancelled"]);
export const bonusType = pgEnum("bonus_type", ["registration", "deposit", "free_spins", "cashback", "promotional", "coupon"]);
export const userBonusStatus = pgEnum("user_bonus_status", ["active", "completed", "expired", "forfeited", "cancelled"]);
export const ticketStatus = pgEnum("ticket_status", ["open", "pending", "in_progress", "resolved", "closed"]);
export const ticketPriority = pgEnum("ticket_priority", ["low", "normal", "high", "urgent"]);
export const commissionStatus = pgEnum("commission_status", ["pending", "approved", "paid", "rejected"]);
export const notificationType = pgEnum("notification_type", ["deposit", "withdrawal", "bonus", "promotion", "system", "support", "kyc", "security"]);
export const verificationType = pgEnum("verification_type", ["email_verify", "password_reset", "phone_verify"]);
export const paymentDirection = pgEnum("payment_direction", ["deposit", "withdrawal", "both"]);
export const gameDisplay = pgEnum("game_display", ["standard", "live_table"]);
export const gameStatus = pgEnum("game_status", ["active", "inactive", "maintenance"]);

const money = (name: string) => numeric(name, { precision: 18, scale: 2 });
const created = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updated = () => timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();
const ts = (name: string) => timestamp(name, { withTimezone: true });

export type Eligibility = {
  newUsersOnly?: boolean;
  minVipLevel?: number;
  requireEmailVerified?: boolean;
  requireKyc?: boolean;
};

/* ============================== USERS ============================== */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 120 }).notNull(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    phone: varchar("phone", { length: 32 }).unique(),
    passwordHash: text("password_hash"),
    avatarUrl: text("avatar_url"),
    status: userStatus("status").default("active").notNull(),
    emailVerifiedAt: ts("email_verified_at"),
    phoneVerifiedAt: ts("phone_verified_at"),
    twoFactorEnabled: boolean("two_factor_enabled").default(false).notNull(),
    twoFactorSecret: text("two_factor_secret"),
    twoFactorTempSecret: text("two_factor_temp_secret"),
    recoveryCodes: jsonb("recovery_codes").$type<string[]>(),
    referralCode: varchar("referral_code", { length: 16 }).notNull().unique(),
    referredById: uuid("referred_by_id").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
    referralDisabled: boolean("referral_disabled").default(false).notNull(),
    kycStatus: kycStatus("kyc_status").default("none").notNull(),
    googleId: varchar("google_id", { length: 64 }).unique(),
    facebookId: varchar("facebook_id", { length: 64 }).unique(),
    lastLoginAt: ts("last_login_at"),
    lastLoginIp: varchar("last_login_ip", { length: 64 }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("users_status_idx").on(t.status), index("users_created_idx").on(t.createdAt)],
);

export const profiles = pgTable("profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  dateOfBirth: varchar("date_of_birth", { length: 16 }),
  country: varchar("country", { length: 64 }),
  city: varchar("city", { length: 64 }),
  address: text("address"),
  postalCode: varchar("postal_code", { length: 16 }),
  language: varchar("language", { length: 8 }).default("EN"),
  currency: varchar("currency", { length: 8 }).default("EUR"),
  marketingOptIn: boolean("marketing_opt_in").default(true).notNull(),
  updatedAt: updated(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(), // sha256 of the cookie token
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ip: varchar("ip", { length: 64 }),
    userAgent: text("user_agent"),
    createdAt: created(),
    lastSeenAt: ts("last_seen_at").defaultNow().notNull(),
    expiresAt: ts("expires_at").notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: verificationType("type").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    target: varchar("target", { length: 255 }),
    attempts: integer("attempts").default(0).notNull(),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
    createdAt: created(),
  },
  (t) => [index("verif_user_type_idx").on(t.userId, t.type)],
);

/* ============================== ADMIN / RBAC ============================== */
export const adminUsers = pgTable("admin_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 120 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  status: varchar("status", { length: 16 }).default("active").notNull(),
  twoFactorEnabled: boolean("two_factor_enabled").default(false).notNull(),
  twoFactorSecret: text("two_factor_secret"),
  twoFactorTempSecret: text("two_factor_temp_secret"),
  recoveryCodes: jsonb("recovery_codes").$type<string[]>(),
  lastLoginAt: ts("last_login_at"),
  lastLoginIp: varchar("last_login_ip", { length: 64 }),
  createdAt: created(),
  updatedAt: updated(),
});

export const adminSessions = pgTable(
  "admin_sessions",
  {
    id: text("id").primaryKey(),
    adminId: uuid("admin_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    ip: varchar("ip", { length: 64 }),
    userAgent: text("user_agent"),
    createdAt: created(),
    lastSeenAt: ts("last_seen_at").defaultNow().notNull(),
    expiresAt: ts("expires_at").notNull(),
  },
  (t) => [index("admin_sessions_admin_idx").on(t.adminId)],
);

export const roles = pgTable("roles", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 64 }).notNull().unique(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  description: text("description"),
  isSystem: boolean("is_system").default(false).notNull(),
  createdAt: created(),
});

export const permissions = pgTable("permissions", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 64 }).notNull().unique(),
  label: varchar("label", { length: 120 }).notNull(),
  group: varchar("group", { length: 32 }).notNull(),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: integer("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: integer("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);

/** Admin ↔ role assignments */
export const userRoles = pgTable(
  "user_roles",
  {
    adminId: uuid("admin_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    roleId: integer("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.adminId, t.roleId] })],
);

/* ============================== CATALOG ============================== */
export const providers = pgTable("providers", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 80 }).notNull().unique(),
  slug: varchar("slug", { length: 80 }).notNull().unique(),
  logoUrl: text("logo_url"),
  /** Game adapter code: direct | aggregator | custom (see src/lib/server/games/adapters.ts) */
  adapter: varchar("adapter", { length: 40 }).default("direct").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  aggregatorMetadata: jsonb("aggregator_metadata").$type<Record<string, unknown>>(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: created(),
  updatedAt: updated(),
});

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 80 }).notNull(),
  slug: varchar("slug", { length: 80 }).notNull().unique(),
  shortLabel: varchar("short_label", { length: 40 }),
  icon: varchar("icon", { length: 40 }).default("LayoutGrid").notNull(),
  color: varchar("color", { length: 16 }).default("#f9cf66").notNull(),
  badge: varchar("badge", { length: 8 }),
  showInSlider: boolean("show_in_slider").default(true).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: created(),
});

export type GameArtJson = { icon: string; from: string; to: string; glow: string };
export type GameMetaJson = { players?: number; minBet?: string; maxBet?: string; accent?: string; icon?: string; tag?: string };

export const games = pgTable(
  "games",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    slug: varchar("slug", { length: 120 }).notNull().unique(),
    providerId: integer("provider_id").references(() => providers.id, { onDelete: "set null" }),
    thumbnail: text("thumbnail"),
    mobileThumbnail: text("mobile_thumbnail"),
    banner: text("banner"),
    description: text("description"),
    gameUrl: text("game_url"),
    integrationRef: varchar("integration_ref", { length: 120 }),
    /** Stable source key and external catalog identity across aggregators and direct APIs. */
    apiSource: varchar("api_source", { length: 40 }),
    apiExternalId: varchar("api_external_id", { length: 160 }),
    aggregatorGameId: varchar("aggregator_game_id", { length: 64 }).unique(),
    providerGameId: varchar("provider_game_id", { length: 160 }),
    providerCode: varchar("provider_code", { length: 80 }),
    gameType: varchar("game_type", { length: 80 }),
    aggregatorCategory: varchar("aggregator_category", { length: 120 }),
    hasDemo: boolean("has_demo").default(false).notNull(),
    hasMobile: boolean("has_mobile").default(false).notNull(),
    hasDesktop: boolean("has_desktop").default(true).notNull(),
    freeRoundsSupport: boolean("free_rounds_support").default(false).notNull(),
    blockedCountries: jsonb("blocked_countries").$type<string[]>().default([]).notNull(),
    certifiedMarkets: jsonb("certified_markets").$type<Record<string, unknown>>(),
    supportedCurrencies: jsonb("supported_currencies").$type<string[]>().default([]).notNull(),
    aggregatorMetadata: jsonb("aggregator_metadata").$type<Record<string, unknown>>(),
    aggregatorAvailable: boolean("aggregator_available").default(true).notNull(),
    displayType: gameDisplay("display_type").default("standard").notNull(),
    status: gameStatus("status").default("active").notNull(),
    isFeatured: boolean("is_featured").default(false).notNull(),
    isPopular: boolean("is_popular").default(false).notNull(),
    isNew: boolean("is_new").default(false).notNull(),
    isHot: boolean("is_hot").default(false).notNull(),
    badge: varchar("badge", { length: 12 }),
    rtp: numeric("rtp", { precision: 5, scale: 2 }),
    volatility: varchar("volatility", { length: 16 }),
    maxWin: varchar("max_win", { length: 32 }).default("1,000x").notNull(),
    art: jsonb("art").$type<GameArtJson>(),
    meta: jsonb("meta").$type<GameMetaJson>(),
    playCount: integer("play_count").default(0).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("games_status_idx").on(t.status), index("games_provider_idx").on(t.providerId), index("games_name_idx").on(t.name), index("games_aggregator_provider_idx").on(t.providerCode, t.gameType), index("games_api_source_idx").on(t.apiSource), uniqueIndex("games_api_external_unique").on(t.apiSource, t.apiExternalId)],
);

export const gameCategories = pgTable(
  "game_categories",
  {
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.categoryId] }), index("game_categories_category_idx").on(t.categoryId)],
);

export const favorites = pgTable(
  "favorites",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    createdAt: created(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.gameId] })],
);

export const recentlyPlayed = pgTable(
  "recently_played",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    playCount: integer("play_count").default(1).notNull(),
    lastPlayedAt: ts("last_played_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.gameId] }), index("recent_user_time_idx").on(t.userId, t.lastPlayedAt)],
);

/** Maps the player identifier sent to Aggregator.gg to the local account for each session. */
export const aggregatorGameSessions = pgTable(
  "aggregator_game_sessions",
  {
    aggregatorSessionId: varchar("aggregator_session_id", { length: 64 }).primaryKey(),
    aggregatorPlayerId: varchar("aggregator_player_id", { length: 128 }).notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: ts("created_at").defaultNow().notNull(),
  },
  (t) => [index("aggregator_game_sessions_player_idx").on(t.aggregatorPlayerId, t.aggregatorSessionId)],
);

/* ============================== WALLET / LEDGER ============================== */
export const wallets = pgTable(
  "wallets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    currency: varchar("currency", { length: 8 }).default("EUR").notNull(),
    mainBalance: money("main_balance").default("0").notNull(),
    bonusBalance: money("bonus_balance").default("0").notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [check("wallet_main_non_negative", sql`${t.mainBalance} >= 0`), check("wallet_bonus_non_negative", sql`${t.bonusBalance} >= 0`)],
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reference: varchar("reference", { length: 40 }).notNull().unique(),
    externalRef: varchar("external_ref", { length: 160 }).unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "restrict" }),
    type: txType("type").notNull(),
    balanceType: balanceType("balance_type").default("main").notNull(),
    amount: money("amount").notNull(),
    balanceBefore: money("balance_before").notNull(),
    balanceAfter: money("balance_after").notNull(),
    status: txStatus("status").default("completed").notNull(),
    description: text("description"),
    relatedType: varchar("related_type", { length: 32 }),
    relatedId: varchar("related_id", { length: 64 }),
    adminId: uuid("admin_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: created(),
  },
  (t) => [
    index("tx_user_time_idx").on(t.userId, t.createdAt),
    index("tx_type_idx").on(t.type),
    index("tx_related_idx").on(t.relatedType, t.relatedId),
  ],
);

export type PaymentField = { name: string; label: string; placeholder?: string };

export const paymentMethods = pgTable("payment_methods", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 80 }).notNull(),
  code: varchar("code", { length: 40 }).notNull().unique(),
  direction: paymentDirection("direction").default("both").notNull(),
  adapter: varchar("adapter", { length: 40 }).default("manual").notNull(),
  logoUrl: text("logo_url"),
  instructions: text("instructions"),
  accountDetails: text("account_details"),
  minAmount: money("min_amount").default("10").notNull(),
  maxAmount: money("max_amount").default("10000").notNull(),
  feePercent: numeric("fee_percent", { precision: 6, scale: 2 }).default("0").notNull(),
  feeFixed: money("fee_fixed").default("0").notNull(),
  processingTime: varchar("processing_time", { length: 64 }).default("Instant"),
  requiresProof: boolean("requires_proof").default(false).notNull(),
  fields: jsonb("fields").$type<PaymentField[]>(),
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: created(),
});

export const deposits = pgTable(
  "deposits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reference: varchar("reference", { length: 40 }).notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    paymentMethodId: integer("payment_method_id").references(() => paymentMethods.id, { onDelete: "set null" }),
    amount: money("amount").notNull(),
    fee: money("fee").default("0").notNull(),
    status: depositStatus("status").default("pending").notNull(),
    proofUrl: text("proof_url"),
    bonusId: integer("bonus_id"),
    promoCode: varchar("promo_code", { length: 40 }),
    userNote: text("user_note"),
    adminNote: text("admin_note"),
    providerReference: varchar("provider_reference", { length: 120 }),
    /** Amount/currency the online gateway charges (after conversion) — used to verify callbacks */
    chargeAmount: money("charge_amount"),
    chargeCurrency: varchar("charge_currency", { length: 8 }),
    idempotencyKey: varchar("idempotency_key", { length: 80 }),
    reviewedBy: uuid("reviewed_by"),
    reviewedAt: ts("reviewed_at"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    index("deposit_provider_ref_idx").on(t.providerReference),
    unique("deposit_idem_uq").on(t.userId, t.idempotencyKey),
    index("deposit_status_idx").on(t.status),
    index("deposit_user_idx").on(t.userId, t.createdAt),
  ],
);

export const withdrawals = pgTable(
  "withdrawals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reference: varchar("reference", { length: 40 }).notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    paymentMethodId: integer("payment_method_id").references(() => paymentMethods.id, { onDelete: "set null" }),
    amount: money("amount").notNull(),
    fee: money("fee").default("0").notNull(),
    netAmount: money("net_amount").notNull(),
    status: withdrawalStatus("status").default("pending").notNull(),
    paymentDetails: jsonb("payment_details").$type<Record<string, string>>(),
    userNote: text("user_note"),
    adminNote: text("admin_note"),
    holdTransactionId: uuid("hold_transaction_id"),
    providerReference: varchar("provider_reference", { length: 120 }),
    idempotencyKey: varchar("idempotency_key", { length: 80 }),
    reviewedBy: uuid("reviewed_by"),
    reviewedAt: ts("reviewed_at"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    unique("withdrawal_idem_uq").on(t.userId, t.idempotencyKey),
    index("withdrawal_status_idx").on(t.status),
    index("withdrawal_user_idx").on(t.userId, t.createdAt),
  ],
);

/* ============================== BONUSES ============================== */
export const bonuses = pgTable("bonuses", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  type: bonusType("type").notNull(),
  amount: money("amount").default("0").notNull(),
  percentage: numeric("percentage", { precision: 6, scale: 2 }).default("0").notNull(),
  minDeposit: money("min_deposit").default("0").notNull(),
  maxBonus: money("max_bonus").default("0").notNull(),
  wageringMultiplier: numeric("wagering_multiplier", { precision: 6, scale: 2 }).default("30").notNull(),
  freeSpins: integer("free_spins").default(0).notNull(),
  expiryDays: integer("expiry_days").default(30).notNull(),
  usageLimit: integer("usage_limit"),
  usageCount: integer("usage_count").default(0).notNull(),
  perUserLimit: integer("per_user_limit").default(1).notNull(),
  eligibility: jsonb("eligibility").$type<Eligibility>(),
  isActive: boolean("is_active").default(true).notNull(),
  startsAt: ts("starts_at"),
  endsAt: ts("ends_at"),
  createdAt: created(),
});

export const promoCodes = pgTable("promo_codes", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 40 }).notNull().unique(),
  description: text("description"),
  bonusType: bonusType("bonus_type").default("coupon").notNull(),
  bonusAmount: money("bonus_amount").default("0").notNull(),
  percentage: numeric("percentage", { precision: 6, scale: 2 }).default("0").notNull(),
  minDeposit: money("min_deposit").default("0").notNull(),
  maxBonus: money("max_bonus").default("0").notNull(),
  wageringMultiplier: numeric("wagering_multiplier", { precision: 6, scale: 2 }).default("20").notNull(),
  freeSpins: integer("free_spins").default(0).notNull(),
  maxUsage: integer("max_usage"),
  usageCount: integer("usage_count").default(0).notNull(),
  perUserLimit: integer("per_user_limit").default(1).notNull(),
  eligibility: jsonb("eligibility").$type<Eligibility>(),
  expiresAt: ts("expires_at"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: created(),
});

export const userBonuses = pgTable(
  "user_bonuses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    bonusId: integer("bonus_id").references(() => bonuses.id, { onDelete: "set null" }),
    promoCodeId: integer("promo_code_id").references(() => promoCodes.id, { onDelete: "set null" }),
    depositId: uuid("deposit_id"),
    type: bonusType("type").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    amount: money("amount").notNull(),
    freeSpins: integer("free_spins").default(0).notNull(),
    wageringRequired: money("wagering_required").default("0").notNull(),
    wageringCompleted: money("wagering_completed").default("0").notNull(),
    status: userBonusStatus("status").default("active").notNull(),
    expiresAt: ts("expires_at"),
    completedAt: ts("completed_at"),
    createdAt: created(),
  },
  (t) => [index("ub_user_status_idx").on(t.userId, t.status), unique("ub_deposit_uq").on(t.depositId)],
);

export const promoRedemptions = pgTable(
  "promo_redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    promoCodeId: integer("promo_code_id")
      .notNull()
      .references(() => promoCodes.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userBonusId: uuid("user_bonus_id").references(() => userBonuses.id, { onDelete: "set null" }),
    depositId: uuid("deposit_id"),
    createdAt: created(),
  },
  (t) => [index("promo_red_user_idx").on(t.promoCodeId, t.userId), unique("promo_red_deposit_uq").on(t.depositId)],
);

/* ============================== VIP ============================== */
export const vipLevels = pgTable("vip_levels", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 40 }).notNull(),
  level: integer("level").notNull().unique(),
  minPoints: integer("min_points").default(0).notNull(),
  cashbackPercent: numeric("cashback_percent", { precision: 5, scale: 2 }).default("0").notNull(),
  rewards: text("rewards"),
  benefits: jsonb("benefits").$type<string[]>(),
  color: varchar("color", { length: 16 }).default("#f9cf66").notNull(),
  createdAt: created(),
});

export const vipUsers = pgTable("vip_users", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  levelId: integer("level_id").references(() => vipLevels.id, { onDelete: "set null" }),
  points: integer("points").default(0).notNull(),
  lifetimePoints: integer("lifetime_points").default(0).notNull(),
  updatedAt: updated(),
});

/* ============================== REFERRALS / AGENTS ============================== */
export const agents = pgTable("agents", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  code: varchar("code", { length: 24 }).notNull().unique(),
  commissionPercent: numeric("commission_percent", { precision: 5, scale: 2 }).default("10").notNull(),
  status: varchar("status", { length: 16 }).default("active").notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  notes: text("notes"),
  createdAt: created(),
});

export const referrals = pgTable(
  "referrals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    referrerId: uuid("referrer_id").references(() => users.id, { onDelete: "cascade" }),
    agentId: integer("agent_id").references(() => agents.id, { onDelete: "set null" }),
    referredId: uuid("referred_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 16 }).default("active").notNull(),
    createdAt: created(),
  },
  (t) => [index("ref_referrer_idx").on(t.referrerId), index("ref_agent_idx").on(t.agentId)],
);

export const commissions = pgTable(
  "commissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    referrerId: uuid("referrer_id").references(() => users.id, { onDelete: "cascade" }),
    agentId: integer("agent_id").references(() => agents.id, { onDelete: "set null" }),
    referredUserId: uuid("referred_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceType: varchar("source_type", { length: 24 }).notNull(),
    sourceId: varchar("source_id", { length: 64 }).notNull(),
    baseAmount: money("base_amount").notNull(),
    percent: numeric("percent", { precision: 5, scale: 2 }).notNull(),
    amount: money("amount").notNull(),
    status: commissionStatus("status").default("pending").notNull(),
    approvedBy: uuid("approved_by"),
    approvedAt: ts("approved_at"),
    paidAt: ts("paid_at"),
    transactionId: uuid("transaction_id"),
    createdAt: created(),
  },
  (t) => [unique("commission_source_uq").on(t.sourceType, t.sourceId), index("commission_status_idx").on(t.status)],
);

/* ============================== ENGAGEMENT ============================== */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: notificationType("type").default("system").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    body: text("body"),
    link: text("link"),
    readAt: ts("read_at"),
    createdAt: created(),
  },
  (t) => [index("notif_user_time_idx").on(t.userId, t.createdAt)],
);

export const supportTickets = pgTable(
  "support_tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reference: varchar("reference", { length: 40 }).notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subject: varchar("subject", { length: 200 }).notNull(),
    category: varchar("category", { length: 40 }).default("general").notNull(),
    channel: varchar("channel", { length: 16 }).default("ticket").notNull(),
    status: ticketStatus("status").default("open").notNull(),
    priority: ticketPriority("priority").default("normal").notNull(),
    assignedTo: uuid("assigned_to").references(() => adminUsers.id, { onDelete: "set null" }),
    lastMessageAt: ts("last_message_at").defaultNow().notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("ticket_status_idx").on(t.status), index("ticket_user_idx").on(t.userId)],
);

export const supportMessages = pgTable(
  "support_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    senderType: varchar("sender_type", { length: 12 }).notNull(), // user | admin | system
    senderId: uuid("sender_id"),
    senderName: varchar("sender_name", { length: 120 }),
    body: text("body").notNull(),
    isInternal: boolean("is_internal").default(false).notNull(),
    createdAt: created(),
  },
  (t) => [index("msg_ticket_idx").on(t.ticketId, t.createdAt)],
);

export const cannedResponses = pgTable("canned_responses", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 120 }).notNull(),
  body: text("body").notNull(),
  createdAt: created(),
});

export const kycSubmissions = pgTable(
  "kyc_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: kycStatus("status").default("pending").notNull(),
    fullName: varchar("full_name", { length: 160 }).notNull(),
    dateOfBirth: varchar("date_of_birth", { length: 16 }).notNull(),
    country: varchar("country", { length: 64 }).notNull(),
    address: text("address").notNull(),
    documentType: varchar("document_type", { length: 32 }).notNull(),
    documentNumber: varchar("document_number", { length: 64 }).notNull(),
    frontUrl: text("front_url"),
    backUrl: text("back_url"),
    selfieUrl: text("selfie_url"),
    adminNote: text("admin_note"),
    reviewedBy: uuid("reviewed_by"),
    reviewedAt: ts("reviewed_at"),
    createdAt: created(),
  },
  (t) => [index("kyc_status_idx").on(t.status), index("kyc_user_idx").on(t.userId)],
);

/* ============================== CONTENT ============================== */
export const banners = pgTable("banners", {
  id: serial("id").primaryKey(),
  eyebrow: varchar("eyebrow", { length: 80 }),
  title: varchar("title", { length: 120 }).notNull(),
  titleAccent: varchar("title_accent", { length: 120 }),
  description: text("description"),
  ctaLabel: varchar("cta_label", { length: 40 }).default("Play Now"),
  link: text("link").default("#games"),
  secondaryCtaLabel: varchar("secondary_cta_label", { length: 40 }),
  secondaryLink: text("secondary_link"),
  desktopImage: text("desktop_image").notNull(),
  mobileImage: text("mobile_image"),
  imagePosition: varchar("image_position", { length: 32 }),
  fit: varchar("fit", { length: 12 }).default("cover").notNull(),
  startsAt: ts("starts_at"),
  endsAt: ts("ends_at"),
  sortOrder: integer("sort_order").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: created(),
});

export const promotions = pgTable("promotions", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 80 }).notNull().unique(),
  title: varchar("title", { length: 120 }).notNull(),
  value: varchar("value", { length: 120 }).notNull(),
  note: varchar("note", { length: 120 }),
  icon: varchar("icon", { length: 40 }).default("Gift").notNull(),
  description: text("description"),
  bannerImage: text("banner_image"),
  bonusId: integer("bonus_id").references(() => bonuses.id, { onDelete: "set null" }),
  eligibility: jsonb("eligibility").$type<Eligibility>(),
  startsAt: ts("starts_at"),
  endsAt: ts("ends_at"),
  sortOrder: integer("sort_order").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: created(),
});

export const siteSettings = pgTable("site_settings", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedAt: updated(),
});

export const pages = pgTable("pages", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 80 }).notNull().unique(),
  title: varchar("title", { length: 160 }).notNull(),
  content: text("content").default("").notNull(),
  metaTitle: varchar("meta_title", { length: 160 }),
  metaDescription: text("meta_description"),
  isPublished: boolean("is_published").default(true).notNull(),
  isSystem: boolean("is_system").default(false).notNull(),
  updatedAt: updated(),
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adminId: uuid("admin_id"),
    adminEmail: varchar("admin_email", { length: 255 }),
    action: varchar("action", { length: 64 }).notNull(),
    targetType: varchar("target_type", { length: 40 }),
    targetId: varchar("target_id", { length: 64 }),
    ip: varchar("ip", { length: 64 }),
    description: text("description"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: created(),
  },
  (t) => [index("audit_time_idx").on(t.createdAt), index("audit_action_idx").on(t.action)],
);

export const userNotes = pgTable(
  "user_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    adminId: uuid("admin_id"),
    adminName: varchar("admin_name", { length: 120 }),
    note: text("note").notNull(),
    createdAt: created(),
  },
  (t) => [index("user_notes_user_idx").on(t.userId)],
);

export type _Unused = SQL;

/* ============================== UNIVERSAL INTEGRATIONS ============================== */
/**
 * Admin-configurable payment gateways & game APIs (no code required).
 * config  = non-secret settings (URLs, templates, field mappings) — flat string map
 * secrets = AES-256-GCM encrypted values (or "env:VAR_NAME" references) — never returned to the browser
 */
export const integrations = pgTable(
  "integrations",
  {
    id: serial("id").primaryKey(),
    kind: varchar("kind", { length: 16 }).notNull(), // payment | game
    code: varchar("code", { length: 40 }).notNull().unique(),
    name: varchar("name", { length: 120 }).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    config: jsonb("config").$type<Record<string, string>>().default({}).notNull(),
    secrets: jsonb("secrets").$type<Record<string, string>>().default({}).notNull(),
    notes: text("notes"),
    createdAt: created(),
    updatedAt: updated(),
    lastTestAt: timestamp("last_test_at", { withTimezone: true }),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastSyncSummary: jsonb("last_sync_summary").$type<Record<string, unknown>>(),
  },
  (t) => [index("integrations_kind_idx").on(t.kind)],
);
