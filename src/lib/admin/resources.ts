/** Declarative admin resources — shared by the generic CRUD API and the admin UI. */
export type FieldType =
  | "text" | "textarea" | "number" | "money" | "boolean" | "select" | "multiselect" | "datetime" | "image" | "color" | "json" | "password" | "tags" | "icon";

export type OptionSource = "providers" | "categories" | "permissions" | "roles" | "bonuses" | "games" | "paymentAdapters" | "gameAdapters";

export type FieldDef = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: { value: string; label: string }[];
  optionsFrom?: OptionSource;
  help?: string;
  virtual?: boolean;
  placeholder?: string;
  full?: boolean;
};

export type ColumnDef = { name: string; label: string; type?: "badge" | "boolean" | "image" | "money" | "date" | "list" };

export type ResourceDef = {
  key: string;
  label: string;
  singular: string;
  group: string;
  viewPerm: string;
  editPerm: string;
  createPerm?: string;
  deletePerm?: string;
  fields: FieldDef[];
  columns: ColumnDef[];
  search: string[];
};

const opts = (...v: string[]) => v.map((x) => ({ value: x, label: x ? x.replace(/_/g, " ") : "— none —" }));
const bonusTypes = opts("registration", "deposit", "free_spins", "cashback", "promotional", "coupon");
const eligibilityHelp = 'JSON, e.g. {"newUsersOnly":true,"minVipLevel":2,"requireEmailVerified":true,"requireKyc":false}';

export const RESOURCES: ResourceDef[] = [
  {
    key: "games", label: "Games", singular: "Game", group: "Games",
    viewPerm: "games.view", editPerm: "games.edit", createPerm: "games.create", deletePerm: "games.delete",
    search: ["name", "slug"],
    columns: [
      { name: "thumbnail", label: "", type: "image" }, { name: "name", label: "Name" }, { name: "providerName", label: "Provider" },
      { name: "status", label: "Status", type: "badge" }, { name: "isFeatured", label: "Featured", type: "boolean" }, { name: "playCount", label: "Plays" }, { name: "sortOrder", label: "Order" },
    ],
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "slug", label: "Slug", type: "text", required: true, help: "URL-safe identifier" },
      { name: "providerId", label: "Provider", type: "select", optionsFrom: "providers" },
      { name: "categoryIds", label: "Categories", type: "multiselect", optionsFrom: "categories", virtual: true, full: true },
      { name: "thumbnail", label: "Thumbnail", type: "image" },
      { name: "mobileThumbnail", label: "Mobile thumbnail", type: "image" },
      { name: "banner", label: "Banner", type: "image" },
      { name: "description", label: "Description", type: "textarea", full: true },
      { name: "gameUrl", label: "Game URL (direct adapter)", type: "text", placeholder: "https://provider.example/launch/…", help: "Used when the provider adapter is 'direct'" },
      { name: "integrationRef", label: "Provider game ID (integration reference)", type: "text", help: "Game ID sent to the aggregator API" },
      { name: "displayType", label: "Display type", type: "select", required: true, options: opts("standard", "live_table") },
      { name: "status", label: "Status", type: "select", required: true, options: opts("active", "inactive", "maintenance") },
      { name: "badge", label: "Badge", type: "select", options: opts("", "HOT", "NEW", "JACKPOT") },
      { name: "isFeatured", label: "Featured", type: "boolean" },
      { name: "isPopular", label: "Popular", type: "boolean" },
      { name: "isNew", label: "New", type: "boolean" },
      { name: "isHot", label: "Hot", type: "boolean" },
      { name: "rtp", label: "RTP %", type: "number", required: true },
      { name: "volatility", label: "Volatility", type: "select", required: true, options: opts("Low", "Medium", "High", "Very High") },
      { name: "maxWin", label: "Max win", type: "text", required: true },
      { name: "sortOrder", label: "Sort order", type: "number", required: true },
      { name: "art", label: "Generated art (no thumbnail)", type: "json", help: '{"icon":"Rocket","from":"#1e3a8a","to":"#0b1022","glow":"#60a5fa"}', full: true },
      { name: "meta", label: "Live table meta", type: "json", help: '{"players":500,"minBet":"€1","maxBet":"€5K","icon":"Crown","accent":"#38bdf8","tag":"Top Pick"}', full: true },
    ],
  },
  {
    key: "categories", label: "Categories", singular: "Category", group: "Games",
    viewPerm: "games.view", editPerm: "games.edit", createPerm: "games.edit", deletePerm: "games.delete",
    search: ["name", "slug"],
    columns: [{ name: "name", label: "Name" }, { name: "slug", label: "Slug" }, { name: "icon", label: "Icon" }, { name: "gameCount", label: "Games" }, { name: "isActive", label: "Enabled", type: "boolean" }, { name: "sortOrder", label: "Order" }],
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "slug", label: "Slug", type: "text", required: true, help: "Reserved: all, popular, new, promotions" },
      { name: "shortLabel", label: "Short label (mobile)", type: "text" },
      { name: "icon", label: "Icon", type: "icon", required: true },
      { name: "color", label: "Accent colour", type: "color", required: true },
      { name: "badge", label: "Badge", type: "select", options: opts("", "HOT", "NEW") },
      { name: "showInSlider", label: "Show in slider", type: "boolean" },
      { name: "isActive", label: "Enabled", type: "boolean" },
      { name: "sortOrder", label: "Sort order", type: "number", required: true },
      { name: "gameIds", label: "Assigned games", type: "multiselect", optionsFrom: "games", virtual: true, full: true },
    ],
  },
  {
    key: "providers", label: "Providers", singular: "Provider", group: "Games",
    viewPerm: "games.view", editPerm: "games.edit", createPerm: "games.edit", deletePerm: "games.delete",
    search: ["name", "slug"],
    columns: [{ name: "logoUrl", label: "", type: "image" }, { name: "name", label: "Name" }, { name: "adapter", label: "Adapter", type: "badge" }, { name: "gameCount", label: "Games" }, { name: "isActive", label: "Enabled", type: "boolean" }, { name: "sortOrder", label: "Order" }],
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "slug", label: "Slug", type: "text", required: true },
      { name: "logoUrl", label: "Logo", type: "image" },
      { name: "adapter", label: "Integration adapter", type: "select", required: true, optionsFrom: "gameAdapters", help: "direct = per-game Game URL (iframe) · aggregator = launch via GAME_API_URL + GAME_API_KEY from server .env" },
      { name: "isActive", label: "Enabled", type: "boolean" },
      { name: "sortOrder", label: "Sort order", type: "number", required: true },
    ],
  },
  {
    key: "payment-methods", label: "Payment Methods", singular: "Payment Method", group: "Finance",
    viewPerm: "finance.view", editPerm: "finance.settings",
    search: ["name", "code"],
    columns: [{ name: "logoUrl", label: "", type: "image" }, { name: "name", label: "Name" }, { name: "adapter", label: "Adapter" }, { name: "gatewayStatus", label: "Gateway", type: "badge" }, { name: "direction", label: "Direction", type: "badge" }, { name: "minAmount", label: "Min", type: "money" }, { name: "maxAmount", label: "Max", type: "money" }, { name: "feePercent", label: "Fee %" }, { name: "isActive", label: "Enabled", type: "boolean" }],
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "code", label: "Code", type: "text", required: true },
      { name: "direction", label: "Direction", type: "select", required: true, options: opts("deposit", "withdrawal", "both") },
      { name: "adapter", label: "Adapter", type: "select", required: true, optionsFrom: "paymentAdapters", help: "Online gateways activate automatically when their .env keys are set (see PAYMENT_GATEWAY_GUIDE.md). Credentials are never stored here." },
      { name: "logoUrl", label: "Logo", type: "image" },
      { name: "minAmount", label: "Minimum", type: "money", required: true },
      { name: "maxAmount", label: "Maximum", type: "money", required: true },
      { name: "feePercent", label: "Fee %", type: "number", required: true },
      { name: "feeFixed", label: "Fixed fee", type: "money", required: true },
      { name: "processingTime", label: "Processing time", type: "text" },
      { name: "requiresProof", label: "Requires payment proof", type: "boolean" },
      { name: "isActive", label: "Enabled", type: "boolean" },
      { name: "sortOrder", label: "Sort order", type: "number", required: true },
      { name: "instructions", label: "Instructions", type: "textarea", full: true },
      { name: "accountDetails", label: "Public account details", type: "textarea", full: true },
      { name: "fields", label: "Withdrawal fields", type: "json", help: '[{"name":"iban","label":"IBAN"}]', full: true },
    ],
  },
  {
    key: "bonuses", label: "Bonuses", singular: "Bonus", group: "Marketing",
    viewPerm: "bonuses.view", editPerm: "bonuses.manage",
    search: ["name"],
    columns: [{ name: "name", label: "Name" }, { name: "type", label: "Type", type: "badge" }, { name: "percentage", label: "%" }, { name: "amount", label: "Amount", type: "money" }, { name: "wageringMultiplier", label: "Wager x" }, { name: "usageCount", label: "Used" }, { name: "isActive", label: "Active", type: "boolean" }],
    fields: [
      { name: "name", label: "Bonus name", type: "text", required: true },
      { name: "type", label: "Bonus type", type: "select", required: true, options: bonusTypes },
      { name: "description", label: "Description", type: "textarea", full: true },
      { name: "amount", label: "Fixed amount", type: "money", required: true },
      { name: "percentage", label: "Percentage", type: "number", required: true },
      { name: "minDeposit", label: "Minimum deposit", type: "money", required: true },
      { name: "maxBonus", label: "Maximum bonus (0 = no cap)", type: "money", required: true },
      { name: "wageringMultiplier", label: "Wagering requirement (x)", type: "number", required: true },
      { name: "freeSpins", label: "Free spins", type: "number", required: true },
      { name: "expiryDays", label: "Expiry (days)", type: "number", required: true },
      { name: "usageLimit", label: "Total usage limit", type: "number" },
      { name: "perUserLimit", label: "Per-user limit", type: "number", required: true },
      { name: "startsAt", label: "Starts", type: "datetime" },
      { name: "endsAt", label: "Ends", type: "datetime" },
      { name: "isActive", label: "Active", type: "boolean" },
      { name: "eligibility", label: "Eligibility", type: "json", help: eligibilityHelp, full: true },
    ],
  },
  {
    key: "promo-codes", label: "Promo Codes", singular: "Promo Code", group: "Marketing",
    viewPerm: "bonuses.view", editPerm: "bonuses.manage",
    search: ["code", "description"],
    columns: [{ name: "code", label: "Code" }, { name: "bonusType", label: "Type", type: "badge" }, { name: "bonusAmount", label: "Amount", type: "money" }, { name: "percentage", label: "%" }, { name: "usageCount", label: "Used" }, { name: "maxUsage", label: "Max" }, { name: "expiresAt", label: "Expires", type: "date" }, { name: "isActive", label: "Active", type: "boolean" }],
    fields: [
      { name: "code", label: "Code", type: "text", required: true },
      { name: "bonusType", label: "Bonus type", type: "select", required: true, options: bonusTypes },
      { name: "description", label: "Description", type: "text", full: true },
      { name: "bonusAmount", label: "Bonus amount", type: "money", required: true },
      { name: "percentage", label: "Deposit match %", type: "number", required: true },
      { name: "minDeposit", label: "Minimum deposit", type: "money", required: true },
      { name: "maxBonus", label: "Maximum bonus", type: "money", required: true },
      { name: "wageringMultiplier", label: "Wagering (x)", type: "number", required: true },
      { name: "freeSpins", label: "Free spins", type: "number", required: true },
      { name: "maxUsage", label: "Maximum usage", type: "number" },
      { name: "perUserLimit", label: "Per-user limit", type: "number", required: true },
      { name: "expiresAt", label: "Expiry", type: "datetime" },
      { name: "isActive", label: "Active", type: "boolean" },
      { name: "eligibility", label: "Eligibility", type: "json", help: eligibilityHelp, full: true },
    ],
  },
  {
    key: "vip-levels", label: "VIP Levels", singular: "VIP Level", group: "Marketing",
    viewPerm: "bonuses.view", editPerm: "bonuses.manage",
    search: ["name"],
    columns: [{ name: "level", label: "Level" }, { name: "name", label: "Name" }, { name: "minPoints", label: "Required points" }, { name: "cashbackPercent", label: "Cashback %" }, { name: "benefits", label: "Benefits", type: "list" }],
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "level", label: "Level #", type: "number", required: true },
      { name: "minPoints", label: "Required points", type: "number", required: true },
      { name: "cashbackPercent", label: "Cashback %", type: "number", required: true },
      { name: "color", label: "Colour", type: "color", required: true },
      { name: "rewards", label: "Rewards", type: "text", full: true },
      { name: "benefits", label: "Benefits", type: "tags", full: true, help: "Comma separated" },
    ],
  },
  {
    key: "banners", label: "Banners", singular: "Banner", group: "Content",
    viewPerm: "content.banners", editPerm: "content.banners",
    search: ["title", "titleAccent"],
    columns: [{ name: "desktopImage", label: "", type: "image" }, { name: "title", label: "Title" }, { name: "titleAccent", label: "Accent" }, { name: "startsAt", label: "Starts", type: "date" }, { name: "endsAt", label: "Ends", type: "date" }, { name: "sortOrder", label: "Order" }, { name: "isActive", label: "Enabled", type: "boolean" }],
    fields: [
      { name: "eyebrow", label: "Eyebrow", type: "text" },
      { name: "title", label: "Title", type: "text", required: true },
      { name: "titleAccent", label: "Gold title line", type: "text" },
      { name: "description", label: "Description", type: "textarea", full: true },
      { name: "ctaLabel", label: "Primary CTA", type: "text" },
      { name: "link", label: "Primary link", type: "text", help: "#section, category:slug, auth:register, /path or https://…" },
      { name: "secondaryCtaLabel", label: "Secondary CTA", type: "text" },
      { name: "secondaryLink", label: "Secondary link", type: "text" },
      { name: "desktopImage", label: "Desktop image", type: "image", required: true },
      { name: "mobileImage", label: "Mobile image", type: "image" },
      { name: "imagePosition", label: "Image position", type: "text", placeholder: "70% center" },
      { name: "fit", label: "Image fit", type: "select", required: true, options: opts("cover", "contain") },
      { name: "startsAt", label: "Start date", type: "datetime" },
      { name: "endsAt", label: "End date", type: "datetime" },
      { name: "sortOrder", label: "Order", type: "number", required: true },
      { name: "isActive", label: "Enabled", type: "boolean" },
    ],
  },
  {
    key: "promotions", label: "Promotions", singular: "Promotion", group: "Content",
    viewPerm: "content.promotions", editPerm: "content.promotions",
    search: ["title", "slug"],
    columns: [{ name: "title", label: "Title" }, { name: "value", label: "Value" }, { name: "note", label: "Note" }, { name: "startsAt", label: "Starts", type: "date" }, { name: "endsAt", label: "Ends", type: "date" }, { name: "isActive", label: "Enabled", type: "boolean" }],
    fields: [
      { name: "title", label: "Title", type: "text", required: true },
      { name: "slug", label: "Slug", type: "text", required: true },
      { name: "value", label: "Headline value", type: "text", required: true },
      { name: "note", label: "Note", type: "text" },
      { name: "icon", label: "Icon", type: "icon", required: true },
      { name: "bonusId", label: "Linked bonus", type: "select", optionsFrom: "bonuses" },
      { name: "description", label: "Description", type: "textarea", full: true },
      { name: "bannerImage", label: "Banner image", type: "image" },
      { name: "startsAt", label: "Starts", type: "datetime" },
      { name: "endsAt", label: "Ends", type: "datetime" },
      { name: "sortOrder", label: "Order", type: "number", required: true },
      { name: "isActive", label: "Enabled", type: "boolean" },
      { name: "eligibility", label: "Eligibility", type: "json", help: eligibilityHelp, full: true },
    ],
  },
  {
    key: "pages", label: "CMS Pages", singular: "Page", group: "Content",
    viewPerm: "content.pages", editPerm: "content.pages",
    search: ["title", "slug"],
    columns: [{ name: "title", label: "Title" }, { name: "slug", label: "Slug" }, { name: "isPublished", label: "Published", type: "boolean" }, { name: "updatedAt", label: "Updated", type: "date" }],
    fields: [
      { name: "title", label: "Title", type: "text", required: true },
      { name: "slug", label: "Slug", type: "text", required: true, help: "Public URL: /p/{slug}" },
      { name: "content", label: "Content (Markdown)", type: "textarea", full: true },
      { name: "metaTitle", label: "Meta title", type: "text" },
      { name: "metaDescription", label: "Meta description", type: "text" },
      { name: "isPublished", label: "Published", type: "boolean" },
    ],
  },
  {
    key: "agents", label: "Agents & Affiliates", singular: "Agent", group: "Affiliates",
    viewPerm: "affiliates.view", editPerm: "affiliates.manage",
    search: ["name", "email", "code"],
    columns: [{ name: "name", label: "Name" }, { name: "code", label: "Code" }, { name: "commissionPercent", label: "Commission %" }, { name: "referralCount", label: "Referrals" }, { name: "commissionTotal", label: "Earned", type: "money" }, { name: "commissionPaid", label: "Paid", type: "money" }, { name: "status", label: "Status", type: "badge" }],
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "email", label: "Email", type: "text", required: true },
      { name: "code", label: "Referral code", type: "text", required: true },
      { name: "commissionPercent", label: "Commission %", type: "number", required: true },
      { name: "status", label: "Status", type: "select", required: true, options: opts("active", "suspended") },
      { name: "notes", label: "Notes", type: "textarea", full: true },
    ],
  },
  {
    key: "canned-responses", label: "Canned Responses", singular: "Canned Response", group: "Support",
    viewPerm: "support.view", editPerm: "support.reply",
    search: ["title", "body"],
    columns: [{ name: "title", label: "Title" }, { name: "body", label: "Response" }],
    fields: [
      { name: "title", label: "Title", type: "text", required: true },
      { name: "body", label: "Response", type: "textarea", required: true, full: true },
    ],
  },
  {
    key: "roles", label: "Roles & Permissions", singular: "Role", group: "Access",
    viewPerm: "roles.view", editPerm: "roles.manage",
    search: ["name", "slug"],
    columns: [{ name: "name", label: "Role" }, { name: "description", label: "Description" }, { name: "permissionCount", label: "Permissions" }, { name: "isSystem", label: "System", type: "boolean" }],
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "slug", label: "Slug", type: "text", required: true },
      { name: "description", label: "Description", type: "text", full: true },
      { name: "permissionKeys", label: "Permissions", type: "multiselect", optionsFrom: "permissions", virtual: true, full: true },
    ],
  },
  {
    key: "admins", label: "Admin Accounts", singular: "Admin", group: "Access",
    viewPerm: "admins.manage", editPerm: "admins.manage",
    search: ["name", "email"],
    columns: [{ name: "name", label: "Name" }, { name: "email", label: "Email" }, { name: "roleNames", label: "Roles", type: "list" }, { name: "twoFactorEnabled", label: "2FA", type: "boolean" }, { name: "status", label: "Status", type: "badge" }, { name: "lastLoginAt", label: "Last login", type: "date" }],
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "email", label: "Email", type: "text", required: true },
      { name: "password", label: "Password", type: "password", virtual: true, help: "Required when creating. Leave blank to keep current." },
      { name: "status", label: "Status", type: "select", required: true, options: opts("active", "suspended") },
      { name: "roleIds", label: "Roles", type: "multiselect", optionsFrom: "roles", virtual: true, full: true },
      { name: "reset2fa", label: "Reset 2FA on save", type: "boolean", virtual: true },
    ],
  },
];

export const RESOURCE_MAP = Object.fromEntries(RESOURCES.map((r) => [r.key, r])) as Record<string, ResourceDef>;
