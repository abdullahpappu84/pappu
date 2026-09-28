import { eq, sql } from "drizzle-orm";
import { db } from "./index";
import { ensureSchema } from "./migrate";
import * as t from "./schema";
import { genReference, genReferralCode, hashPassword } from "../lib/server/crypto";
import { PERMISSIONS, ROLE_PRESETS } from "../lib/permissions";

const SEED_KEY = "__seeded_v1";
const g = globalThis as typeof globalThis & { __arSeeded?: boolean; __arSeeding?: Promise<void> };

const PROVIDERS = ["Sugarworks", "Olympia Studios", "Pyramid Play", "Tidal Games", "Nebula Play", "Crown Live", "Imperial Tables", "Orbit Gaming"];

const CATEGORIES: Omit<typeof t.categories.$inferInsert, "sortOrder">[] = [
  { slug: "all", name: "All Games", shortLabel: "All", icon: "LayoutGrid", color: "#f9cf66" },
  { slug: "live", name: "Live Casino", icon: "UserRound", color: "#fb5a6e", badge: "HOT" },
  { slug: "slots", name: "Slots", icon: "Cherry", color: "#a78bfa" },
  { slug: "table", name: "Table Games", shortLabel: "Table", icon: "Dice5", color: "#34d399" },
  { slug: "crash", name: "Crash Games", shortLabel: "Crash", icon: "Rocket", color: "#60a5fa" },
  { slug: "poker", name: "Poker", icon: "Spade", color: "#fb923c" },
  { slug: "fishing", name: "Fishing", icon: "Fish", color: "#22d3ee" },
  { slug: "virtual", name: "Virtual Sports", shortLabel: "Virtual", icon: "Gamepad2", color: "#c084fc" },
  { slug: "jackpot", name: "Jackpot", icon: "Gem", color: "#fbbf24", badge: "NEW" },
  { slug: "popular", name: "Popular", icon: "Flame", color: "#f97316" },
  { slug: "new", name: "New", icon: "Sparkles", color: "#e879f9" },
  { slug: "promotions", name: "Promotions", icon: "Gift", color: "#f472b6" },
];

type SeedGame = {
  slug: string; name: string; provider: string; cats: string[]; thumb?: string; art?: t.GameArtJson; badge?: string;
  rtp: string; vol: string; max: string; featured?: boolean; popular?: boolean; isNew?: boolean; hot?: boolean;
  live?: t.GameMetaJson;
};

const GAMES: SeedGame[] = [
  { slug: "candy-cascade", name: "Candy Cascade", provider: "Sugarworks", cats: ["slots"], thumb: "/images/games/candy-cascade.jpg", badge: "HOT", rtp: "96.51", vol: "Medium", max: "21,100x", featured: true, popular: true, hot: true },
  { slug: "thunder-gates", name: "Thunder Gates", provider: "Olympia Studios", cats: ["slots", "jackpot"], thumb: "/images/games/thunder-zeus.jpg", badge: "HOT", rtp: "96.50", vol: "Very High", max: "5,000x", featured: true, popular: true, hot: true },
  { slug: "fortune-spin", name: "Fortune Spin", provider: "Crown Live", cats: ["live"], thumb: "/images/games/fortune-wheel.jpg", badge: "HOT", rtp: "96.08", vol: "High", max: "20,000x", featured: true, popular: true, hot: true },
  { slug: "tome-of-ra", name: "Tome of Ra", provider: "Pyramid Play", cats: ["slots"], thumb: "/images/games/pharaoh-tome.jpg", badge: "HOT", rtp: "96.21", vol: "High", max: "5,000x", featured: true, popular: true, hot: true },
  { slug: "reel-catch", name: "Reel Catch", provider: "Tidal Games", cats: ["slots", "fishing"], thumb: "/images/games/reel-catch.jpg", badge: "HOT", rtp: "96.71", vol: "High", max: "2,100x", featured: true, popular: true, hot: true },
  { slug: "nova-stars", name: "Nova Stars", provider: "Nebula Play", cats: ["slots", "jackpot"], thumb: "/images/games/nova-stars.jpg", badge: "HOT", rtp: "96.48", vol: "Medium", max: "50,000x", featured: true, popular: true, isNew: true, hot: true },
  { slug: "rocket-rush", name: "Rocket Rush", provider: "Nebula Play", cats: ["crash"], art: { icon: "Rocket", from: "#1e3a8a", to: "#0b1022", glow: "#60a5fa" }, badge: "NEW", rtp: "97.00", vol: "High", max: "10,000x", isNew: true },
  { slug: "sky-multiplier", name: "Sky Multiplier", provider: "Orbit Gaming", cats: ["crash"], art: { icon: "Plane", from: "#7f1d1d", to: "#150709", glow: "#f87171" }, rtp: "97.00", vol: "Medium", max: "1,000,000x", popular: true },
  { slug: "plinko-royale", name: "Plinko Royale", provider: "Orbit Gaming", cats: ["crash"], art: { icon: "CircleDot", from: "#4c1d95", to: "#0f0822", glow: "#c084fc" }, badge: "NEW", rtp: "99.00", vol: "Low", max: "1,000x", isNew: true },
  { slug: "royal-blackjack", name: "Royal Blackjack", provider: "Imperial Tables", cats: ["table"], art: { icon: "Spade", from: "#065f46", to: "#04140f", glow: "#34d399" }, rtp: "99.50", vol: "Low", max: "1,000x", popular: true },
  { slug: "european-roulette", name: "European Roulette", provider: "Imperial Tables", cats: ["table"], art: { icon: "CircleDot", from: "#7c2d12", to: "#140805", glow: "#fb923c" }, rtp: "97.30", vol: "Medium", max: "36x" },
  { slug: "baccarat-squeeze", name: "Baccarat Squeeze", provider: "Imperial Tables", cats: ["table"], art: { icon: "Diamond", from: "#831843", to: "#16060e", glow: "#f472b6" }, badge: "NEW", rtp: "98.94", vol: "Low", max: "8x", isNew: true },
  { slug: "holdem-pro", name: "Hold'em Pro", provider: "Imperial Tables", cats: ["poker", "table"], art: { icon: "Club", from: "#9a3412", to: "#170a04", glow: "#fdba74" }, rtp: "97.80", vol: "Medium", max: "100x" },
  { slug: "caribbean-stud", name: "Caribbean Stud", provider: "Crown Live", cats: ["poker"], art: { icon: "Swords", from: "#0e7490", to: "#03131a", glow: "#67e8f9" }, rtp: "94.78", vol: "Medium", max: "250x" },
  { slug: "deep-sea-hunter", name: "Deep Sea Hunter", provider: "Tidal Games", cats: ["fishing"], art: { icon: "Fish", from: "#155e75", to: "#031018", glow: "#22d3ee" }, rtp: "96.90", vol: "Medium", max: "1,500x" },
  { slug: "golden-koi", name: "Golden Koi", provider: "Tidal Games", cats: ["fishing", "slots"], art: { icon: "Fish", from: "#854d0e", to: "#150d02", glow: "#fbbf24" }, badge: "NEW", rtp: "96.30", vol: "High", max: "8,888x", isNew: true },
  { slug: "virtual-derby", name: "Virtual Derby", provider: "Orbit Gaming", cats: ["virtual"], art: { icon: "Flag", from: "#3730a3", to: "#090a1f", glow: "#818cf8" }, rtp: "95.50", vol: "Medium", max: "500x" },
  { slug: "penalty-kings", name: "Penalty Kings", provider: "Orbit Gaming", cats: ["virtual"], art: { icon: "Goal", from: "#166534", to: "#041208", glow: "#4ade80" }, badge: "NEW", rtp: "96.00", vol: "Low", max: "96x", isNew: true },
  { slug: "mega-vault", name: "Mega Vault", provider: "Olympia Studios", cats: ["jackpot", "slots"], art: { icon: "Vault", from: "#a16207", to: "#140c02", glow: "#fde047" }, badge: "JACKPOT", rtp: "95.80", vol: "Very High", max: "€4.2M" },
  { slug: "dragons-hoard", name: "Dragon's Hoard", provider: "Pyramid Play", cats: ["jackpot", "slots"], art: { icon: "Flame", from: "#991b1b", to: "#160404", glow: "#fb7185" }, badge: "JACKPOT", rtp: "96.10", vol: "Very High", max: "€1.1M", isNew: true },
  { slug: "storm-dice", name: "Storm Dice", provider: "Crown Live", cats: ["live", "table"], art: { icon: "Zap", from: "#1e40af", to: "#050a1c", glow: "#facc15" }, rtp: "96.20", vol: "High", max: "1,000x" },
  { slug: "studio-roulette", name: "Studio Roulette", provider: "Crown Live", cats: ["live", "table"], art: { icon: "Radio", from: "#6b21a8", to: "#10061a", glow: "#e879f9" }, rtp: "97.30", vol: "Medium", max: "500x" },
  // live dealer tables
  { slug: "crown-roulette", name: "Crown Roulette", provider: "Crown Live", cats: ["live", "table"], thumb: "/images/live/live-7594575.jpg", rtp: "97.30", vol: "Medium", max: "500x", live: { players: 1284, minBet: "€0.20", maxBet: "€10K", icon: "Crown", accent: "#38bdf8", tag: "Top Pick" } },
  { slug: "royal-blackjack-vip", name: "Royal Blackjack VIP", provider: "Imperial Tables", cats: ["live", "table"], thumb: "/images/live/live-7594301.jpg", rtp: "99.28", vol: "Low", max: "1,000x", live: { players: 642, minBet: "€5", maxBet: "€25K", icon: "Spade", accent: "#f9cf66" } },
  { slug: "speed-baccarat", name: "Speed Baccarat", provider: "Orbit Gaming", cats: ["live", "table"], thumb: "/images/live/live-7594255.jpg", rtp: "98.94", vol: "Low", max: "8x", live: { players: 918, minBet: "€1", maxBet: "€15K", icon: "Diamond", accent: "#34d399" } },
  { slug: "grand-wheel-live", name: "Grand Wheel Live", provider: "Crown Live", cats: ["live"], thumb: "/images/live/live-7594347.jpg", rtp: "96.08", vol: "High", max: "20,000x", live: { players: 2310, minBet: "€0.10", maxBet: "€5K", icon: "Globe", accent: "#60a5fa", tag: "Game Show" } },
  { slug: "velvet-holdem", name: "Velvet Hold'em", provider: "Imperial Tables", cats: ["live", "poker"], thumb: "/images/live/live-15793573.jpg", rtp: "97.80", vol: "Medium", max: "100x", live: { players: 356, minBet: "€1", maxBet: "€2K", icon: "Club", accent: "#fb923c" } },
  { slug: "lounge-baccarat", name: "Lounge Baccarat", provider: "Nebula Play", cats: ["live", "table"], thumb: "/images/live/live-7594364.jpg", rtp: "98.94", vol: "Low", max: "8x", live: { players: 774, minBet: "€2", maxBet: "€20K", icon: "Gem", accent: "#e879f9" } },
];

const PAGES: { slug: string; title: string; content: string }[] = [
  { slug: "about", title: "About Us", content: "# About Aurum Royale\n\nAurum Royale is a premium international gaming destination offering world-class slots, live dealer tables and exclusive VIP experiences.\n\n## Our promise\n\n- **Fair play** — certified games from trusted studios\n- **Security** — encrypted accounts and payments\n- **Service** — multilingual support around the clock" },
  { slug: "contact", title: "Contact", content: "# Contact us\n\nOur support team is available **24/7**.\n\n- Live chat: open the chat from any page\n- Email: support@aurumroyale.example\n- Phone: +44 20 0000 0000" },
  { slug: "faq", title: "FAQ", content: "# Frequently Asked Questions\n\n## How do I deposit?\n\nOpen **Account → Deposit**, choose a payment method, enter the amount and submit.\n\n## How long do withdrawals take?\n\nMost withdrawals are reviewed within 24 hours. Processing time depends on the method.\n\n## What is wagering?\n\nBonus funds must be wagered a set number of times before converting to withdrawable cash. Track progress under **Account → Bonuses**.\n\n## How do I verify my account?\n\nSubmit your documents under **Account → Verification (KYC)**." },
  { slug: "terms", title: "Terms & Conditions", content: "# Terms & Conditions\n\nThese terms are placeholders for the prototype. Replace them with your licensed legal terms before going live.\n\n## 1. Eligibility\n\nYou must be at least 18 years old (or the legal age in your jurisdiction).\n\n## 2. Accounts\n\nOne account per person. Accurate information is required.\n\n## 3. Bonuses\n\nBonuses are subject to wagering requirements and expiry." },
  { slug: "privacy", title: "Privacy Policy", content: "# Privacy Policy\n\nPlaceholder privacy policy. Describe what personal data you collect, why, how long you keep it, and the rights of your players (GDPR/CCPA as applicable)." },
  { slug: "responsible-gaming", title: "Responsible Gaming", content: "# Responsible Gaming\n\nGambling should be entertainment, not a way to make money.\n\n- Set deposit limits\n- Take regular breaks\n- Never chase losses\n\nIf you need help, contact our support team to request a cool-off period or self-exclusion." },
];

export async function seedDatabase() {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(424242)`);
    const [done] = await tx.select().from(t.siteSettings).where(eq(t.siteSettings.key, SEED_KEY));
    if (done) return;

    // RBAC
    await tx.insert(t.permissions).values(PERMISSIONS).onConflictDoNothing();
    const perms = await tx.select().from(t.permissions);
    const permId = new Map(perms.map((p) => [p.key, p.id]));
    for (const r of ROLE_PRESETS) {
      const [role] = await tx.insert(t.roles).values({ name: r.name, slug: r.slug, description: r.description, isSystem: r.slug === "super_admin" }).returning();
      const rows = r.perms.map((k) => ({ roleId: role.id, permissionId: permId.get(k)! })).filter((x) => x.permissionId);
      if (rows.length) await tx.insert(t.rolePermissions).values(rows);
    }
    const [superRole] = await tx.select().from(t.roles).where(eq(t.roles.slug, "super_admin"));
    const [admin] = await tx
      .insert(t.adminUsers)
      .values({
        name: "Super Admin",
        email: (process.env.ADMIN_EMAIL ?? "admin@aurumroyale.test").toLowerCase(),
        passwordHash: await hashPassword(process.env.ADMIN_PASSWORD ?? "Admin@12345"),
      })
      .returning();
    await tx.insert(t.userRoles).values({ adminId: admin.id, roleId: superRole.id });

    // Catalog
    const provs = await tx.insert(t.providers).values(PROVIDERS.map((name, i) => ({ name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), sortOrder: i }))).returning();
    const provId = new Map(provs.map((p) => [p.name, p.id]));
    const cats = await tx.insert(t.categories).values(CATEGORIES.map((c, i) => ({ ...c, sortOrder: i }))).returning();
    const catId = new Map(cats.map((c) => [c.slug, c.id]));
    for (const [i, gm] of GAMES.entries()) {
      const [row] = await tx
        .insert(t.games)
        .values({
          slug: gm.slug,
          name: gm.name,
          providerId: provId.get(gm.provider),
          thumbnail: gm.thumb,
          art: gm.art,
          badge: gm.badge,
          rtp: gm.rtp,
          volatility: gm.vol,
          maxWin: gm.max,
          isFeatured: !!gm.featured,
          isPopular: !!gm.popular,
          isNew: !!gm.isNew,
          isHot: !!gm.hot,
          displayType: gm.live ? "live_table" : "standard",
          meta: gm.live,
          description: `${gm.name} by ${gm.provider}. RTP ${gm.rtp}%, ${gm.vol.toLowerCase()} volatility.`,
          integrationRef: `${gm.provider.toLowerCase().replace(/[^a-z0-9]+/g, "_")}:${gm.slug}`,
          sortOrder: i,
        })
        .returning();
      const links = gm.cats.map((c) => ({ gameId: row.id, categoryId: catId.get(c)! })).filter((x) => x.categoryId);
      if (links.length) await tx.insert(t.gameCategories).values(links);
    }

    // Payments
    await tx.insert(t.paymentMethods).values([
      { name: "Visa / Mastercard", code: "card", direction: "deposit", minAmount: "10", maxAmount: "5000", feePercent: "0", processingTime: "Instant after review", instructions: "Card payments are processed by our secure payment partner. In this environment deposits are reviewed manually.", sortOrder: 0 },
      { name: "Bank Transfer", code: "bank", direction: "both", minAmount: "20", maxAmount: "25000", processingTime: "1–3 business days", requiresProof: true, instructions: "Transfer the exact amount and include your deposit reference in the payment description, then upload the receipt.", accountDetails: "Bank: Placeholder Bank Ltd\nIBAN: MT00 PLAC 0000 0000 0000 0000 000\nBIC: PLACMTMT", fields: [{ name: "accountName", label: "Account holder" }, { name: "iban", label: "IBAN" }, { name: "bic", label: "BIC / SWIFT" }], sortOrder: 1 },
      { name: "E-Wallet", code: "ewallet", direction: "both", minAmount: "10", maxAmount: "10000", feePercent: "1.5", processingTime: "Within 24 hours", requiresProof: true, instructions: "Send funds to the wallet below and upload a screenshot of the confirmation.", accountDetails: "Wallet ID: payments@aurumroyale.example", fields: [{ name: "walletEmail", label: "Wallet email / ID" }], sortOrder: 2 },
      { name: "USDT (TRC20)", code: "usdt", direction: "both", minAmount: "20", maxAmount: "50000", feeFixed: "1", processingTime: "~15 minutes", requiresProof: true, instructions: "Send USDT on the TRC20 network only. Upload the transaction screenshot or hash.", accountDetails: "Address: TPlaceholderAddressDoNotSend000000", fields: [{ name: "address", label: "USDT TRC20 address", placeholder: "T..." }], sortOrder: 3 },
    ]);

    // Bonuses & promo codes
    const [welcome] = await tx
      .insert(t.bonuses)
      .values([
        { name: "Welcome Bonus 200%", description: "200% up to €500 on your first deposit", type: "deposit", percentage: "200", minDeposit: "20", maxBonus: "500", wageringMultiplier: "35", freeSpins: 150, expiryDays: 30, perUserLimit: 1, eligibility: { newUsersOnly: false } },
        { name: "Registration Gift", description: "€5 free bonus on sign-up", type: "registration", amount: "5", wageringMultiplier: "40", expiryDays: 7, perUserLimit: 1 },
        { name: "Weekend Reload 50%", description: "50% up to €500 every Fri–Sun", type: "deposit", percentage: "50", minDeposit: "20", maxBonus: "500", wageringMultiplier: "30", expiryDays: 7, perUserLimit: 10 },
      ])
      .returning();
    await tx.insert(t.promoCodes).values([
      { code: "WELCOME50", description: "50% deposit match up to €250", bonusType: "deposit", percentage: "50", minDeposit: "20", maxBonus: "250", wageringMultiplier: "25", maxUsage: 1000, perUserLimit: 1 },
      { code: "ROYAL10", description: "€10 free coupon bonus", bonusType: "coupon", bonusAmount: "10", wageringMultiplier: "20", maxUsage: 500, perUserLimit: 1 },
      { code: "SPINS25", description: "25 free spins on Nova Stars", bonusType: "free_spins", freeSpins: 25, bonusAmount: "0", maxUsage: 500, perUserLimit: 1 },
    ]);

    // VIP
    await tx.insert(t.vipLevels).values([
      { name: "Bronze", level: 1, minPoints: 0, cashbackPercent: "2", rewards: "Weekly reload offers", benefits: ["2% weekly cashback", "Birthday gift"], color: "#cd7f32" },
      { name: "Silver", level: 2, minPoints: 1000, cashbackPercent: "5", rewards: "Faster withdrawals", benefits: ["5% weekly cashback", "Priority withdrawals"], color: "#c0c0c0" },
      { name: "Gold", level: 3, minPoints: 5000, cashbackPercent: "8", rewards: "Personal account manager", benefits: ["8% weekly cashback", "Account manager", "Exclusive tournaments"], color: "#f9cf66" },
      { name: "Platinum", level: 4, minPoints: 20000, cashbackPercent: "12", rewards: "Higher limits & gifts", benefits: ["12% weekly cashback", "Higher limits", "Luxury gifts"], color: "#9ad8ff" },
      { name: "Diamond", level: 5, minPoints: 100000, cashbackPercent: "15", rewards: "Invitation-only events", benefits: ["15% weekly cashback", "VIP events", "Tailored bonuses"], color: "#b9f2ff" },
    ]);

    // Content
    await tx.insert(t.banners).values([
      { eyebrow: "Welcome to Aurum Royale", title: "The Ultimate", titleAccent: "Casino Experience", description: "Play world-class casino games, unlock exclusive bonuses and enjoy VIP treatment — wherever you are in the world.", ctaLabel: "Play Now", link: "#games", secondaryCtaLabel: "Explore Games", secondaryLink: "#categories", desktopImage: "/images/hero-main.jpg", imagePosition: "68% center", sortOrder: 0 },
      { eyebrow: "Live Casino Studios", title: "Real Dealers.", titleAccent: "Real Action.", description: "Take your seat at 200+ HD live tables streamed around the clock from our luxury studios in Europe and Asia.", ctaLabel: "Join a Table", link: "#live-casino", secondaryCtaLabel: "View Lobby", secondaryLink: "#live-casino", desktopImage: "/images/hero-live.jpg", imagePosition: "70% center", sortOrder: 1 },
      { eyebrow: "Mega Jackpot Network", title: "Chase The", titleAccent: "€4.2M Jackpot", description: "Progressive jackpots growing every second across our international network. One spin could change everything.", ctaLabel: "Spin Now", link: "category:jackpot", secondaryCtaLabel: "How It Works", secondaryLink: "/p/faq", desktopImage: "/images/hero-jackpot.jpg", imagePosition: "72% center", sortOrder: 2 },
      { eyebrow: "Exclusive Welcome Offer", title: "Up To 200% Bonus", titleAccent: "+ 150 Free Spins", description: "Start in style with a premium welcome package on your first deposit. Terms apply. 18+.", ctaLabel: "Claim Bonus", link: "auth:register", secondaryCtaLabel: "View Terms", secondaryLink: "/p/terms", desktopImage: "/images/promo-gift.png", fit: "contain", sortOrder: 3 },
    ]);
    await tx.insert(t.promotions).values([
      { slug: "weekend-reload", title: "Weekend Reload", value: "50% up to €500", note: "Every Fri – Sun", icon: "RefreshCcw", description: "Deposit on the weekend and receive a 50% reload up to €500.", bonusId: null, sortOrder: 0 },
      { slug: "weekly-cashback", title: "Weekly Cashback", value: "Up to 15% back", note: "Paid every Monday", icon: "Coins", description: "Earn up to 15% cashback on net losses depending on your VIP level.", sortOrder: 1 },
      { slug: "royal-tournament", title: "Royal Tournament", value: "€250,000 prize pool", note: "Ends in 3 days", icon: "Trophy", description: "Climb the leaderboard on selected slots to win a share of €250,000.", sortOrder: 2 },
    ]);
    await tx.insert(t.pages).values(PAGES.map((p) => ({ ...p, isSystem: true })));
    await tx.insert(t.cannedResponses).values([
      { title: "Greeting", body: "Hello! Thank you for contacting Aurum Royale support. How can I help you today?" },
      { title: "Withdrawal processing", body: "Your withdrawal is currently being processed by our finance team. You will receive a notification as soon as it is completed." },
      { title: "KYC request", body: "To continue, please submit your identity documents under Account → Verification. Our team reviews submissions within 24 hours." },
    ]);

    // Demo player with an auditable opening balance
    const [demo] = await tx
      .insert(t.users)
      .values({ name: "Alex Morgan", email: "demo@aurumroyale.test", phone: "+447700900001", passwordHash: await hashPassword("Demo@12345"), referralCode: genReferralCode(), emailVerifiedAt: new Date() })
      .returning();
    await tx.insert(t.profiles).values({ userId: demo.id, country: "United Kingdom" });
    const [wallet] = await tx.insert(t.wallets).values({ userId: demo.id, mainBalance: "250.00" }).returning();
    await tx.insert(t.transactions).values({ reference: genReference("TX"), userId: demo.id, walletId: wallet.id, type: "adjustment", balanceType: "main", amount: "250.00", balanceBefore: "0.00", balanceAfter: "250.00", description: "Demo opening balance (seed)" });
    const [bronze] = await tx.select().from(t.vipLevels).where(eq(t.vipLevels.level, 1));
    await tx.insert(t.vipUsers).values({ userId: demo.id, levelId: bronze.id, points: 350, lifetimePoints: 350 });
    await tx.insert(t.notifications).values({ userId: demo.id, type: "promotion", title: `${welcome.name} is waiting for you`, body: "Make your first deposit to claim it.", link: "/account?tab=deposit" });

    await tx.insert(t.siteSettings).values({ key: SEED_KEY, value: { at: new Date().toISOString() } });
  });
}

/**
 * Online gateway payment methods. They are inserted once (never overwritten) and only shown to players
 * when the matching .env keys are present — so adding keys + restarting is enough to go live.
 */
const GATEWAY_METHODS: (typeof t.paymentMethods.$inferInsert)[] = [
  { name: "Card / Apple Pay / Google Pay", code: "stripe", adapter: "stripe", direction: "deposit", minAmount: "10", maxAmount: "10000", processingTime: "Instant", instructions: "You will be redirected to Stripe's secure checkout.", sortOrder: -5 },
  { name: "SSLCommerz (Card · bKash · Nagad · Rocket)", code: "sslcommerz", adapter: "sslcommerz", direction: "deposit", minAmount: "10", maxAmount: "10000", processingTime: "Instant", instructions: "You will be redirected to SSLCommerz secure payment page.", sortOrder: -4 },
  { name: "bKash", code: "bkash", adapter: "bkash", direction: "deposit", minAmount: "10", maxAmount: "5000", processingTime: "Instant", instructions: "Pay securely with your bKash account.", sortOrder: -3 },
  { name: "Crypto (BTC · ETH · USDT · 300+)", code: "nowpayments", adapter: "nowpayments", direction: "deposit", minAmount: "20", maxAmount: "50000", processingTime: "After network confirmations", instructions: "Pay the invoice with your preferred cryptocurrency.", sortOrder: -2 },
  { name: "Online Payment", code: "custom_gateway", adapter: "custom", direction: "deposit", minAmount: "10", maxAmount: "10000", processingTime: "Instant", instructions: "You will be redirected to our payment partner.", sortOrder: -1 },
];

export async function ensureGatewayMethods() {
  await db.insert(t.paymentMethods).values(GATEWAY_METHODS).onConflictDoNothing({ target: t.paymentMethods.code });
}

/** Lazily seeds a fresh database once per process. */
export async function ensureSeeded() {
  if (g.__arSeeded) return;
  g.__arSeeding ??= (async () => {
    try {
      await ensureSchema();
      const [done] = await db.select().from(t.siteSettings).where(eq(t.siteSettings.key, SEED_KEY));
      if (!done) await seedDatabase();
      await ensureGatewayMethods();
      g.__arSeeded = true;
    } catch (e) {
      console.error("[seed] failed", e);
    } finally {
      g.__arSeeding = undefined;
    }
  })();
  await g.__arSeeding;
}
