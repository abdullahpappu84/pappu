export const INSTALL_GUIDE = `# Aurum Royale — Live Installation Guide

This package contains the complete **Next.js 16 + PostgreSQL (Drizzle ORM)** casino platform: the approved frontend, player accounts, wallet ledger, payments workflow, bonuses, VIP, referrals, support, KYC and the full admin console.

## 1. Requirements

- **Node.js 20 LTS or 22** and npm 10+
- **PostgreSQL 14+** (managed: Neon, Supabase, RDS, Cloud SQL — or self-hosted)
- A domain with **HTTPS** (required for secure cookies)
- Optional: email relay (Resend/SES/Postmark), SMS relay (Twilio/Vonage), Google/Facebook OAuth apps, a game aggregator and payment gateway

## 2. Unpack & install

- Download **aurum-royale-source.zip** and extract it on your server or CI
- Run \`npm ci\` in the project root

## 3. Environment variables

Create a \`.env\` file (never commit it). Required:

- \`DATABASE_URL\` — e.g. \`postgresql://user:pass@host:5432/aurum?sslmode=require\`
- \`AUTH_SECRET\` — 64+ random characters (\`openssl rand -hex 48\`). Used to encrypt 2FA secrets and sign login tickets. **Do not change after launch.**
- \`APP_URL\` — your public URL, e.g. \`https://www.yourcasino.com\` (used for email links, OAuth redirects and CSRF origin checks)
- \`ADMIN_EMAIL\` and \`ADMIN_PASSWORD\` — the first Super Admin, created on first boot only

Optional integrations:

- \`EMAIL_WEBHOOK_URL\`, \`EMAIL_WEBHOOK_TOKEN\` — POST {to, subject, text} to your mail relay
- \`SMS_WEBHOOK_URL\`, \`SMS_WEBHOOK_TOKEN\` — POST {to, text} to your SMS relay
- \`EXPOSE_DEV_TOKENS=false\` — **set this in production** so verification links/codes are never shown in the browser
- \`GOOGLE_CLIENT_ID\`, \`GOOGLE_CLIENT_SECRET\`, \`FACEBOOK_CLIENT_ID\`, \`FACEBOOK_CLIENT_SECRET\` — social login (redirect URI: \`APP_URL/api/oauth/google\` or \`/api/oauth/facebook\`)
- \`GAME_CALLBACK_SECRET\` — HMAC secret for the seamless-wallet game callback \`POST /api/games/callback\`
- \`STORAGE_DIR\` — absolute path for uploads (default \`./storage\`). Mount a persistent volume here.
- \`EXAMPLE_GATEWAY_API_KEY\` — sample gateway adapter credential (replace with your provider)

## 4. Database

- **Automatic:** on every start the app creates missing tables, applies new migrations (SQL files in \`/drizzle\`) and seeds default data (roles, permissions, Super Admin, catalog, payment methods, bonuses, VIP levels, CMS pages). A brand-new or empty database works immediately — no manual step needed.
- Manual alternative (same result): \`npx tsx --env-file=.env src/db/seed-cli.ts\`
- **After changing \`src/db/schema.ts\`** (developers): run \`npx drizzle-kit generate\` to create a new migration file, commit it, and restart — the app applies it automatically.
- Databases created earlier with \`drizzle-kit push\` are detected and kept (baseline) — no data is lost.
- Enable automated daily backups and point-in-time recovery on your database.
- **"This page couldn’t load / server error"** on first start almost always means \`DATABASE_URL\` is wrong or PostgreSQL is not reachable — check \`pm2 logs aurum\` for lines starting with \`[db]\`.

## 5. Build & run

- \`npm run build\`
- \`npm run start\` (port 3000; set \`PORT\` to change)
- Run behind a process manager (**PM2**, systemd, Docker) and a reverse proxy (**Nginx**, Caddy, Cloudflare) that forwards \`X-Forwarded-For\`, \`X-Forwarded-Host\` and \`X-Forwarded-Proto\`.
- Health check endpoint: \`GET /api/health\`

### Example PM2

- \`npm i -g pm2\`
- \`pm2 start npm --name aurum -- start\`
- \`pm2 save && pm2 startup\`

### Example Docker

- Base image \`node:22-alpine\`, copy source, \`npm ci && npm run build\`, \`CMD ["npm","start"]\`
- Mount a volume at \`/app/storage\` for uploads

## 6. First login & hardening checklist

- Open \`/admin/login\` and sign in with \`ADMIN_EMAIL\` / \`ADMIN_PASSWORD\`
- **Change the admin password** under System → My Security and **enable 2FA**
- Settings → security → turn on \`adminRequire2fa\` to make 2FA mandatory for every admin
- Create staff accounts under System → Admin Accounts and assign least-privilege roles (Finance Manager, Game Manager, Marketing Manager, Content Manager, Support Manager, Moderator)
- Delete or suspend the seeded demo player \`demo@aurumroyale.test\`
- Configure Site Settings: name, logo, favicon, contact, socials, currency, timezone, registration rules, withdrawal limits & fees, referral %, SEO (meta, OG image, canonical URL, robots)
- Replace placeholder CMS pages (Terms, Privacy, Responsible Gaming) with your licensed legal texts
- Set \`EXPOSE_DEV_TOKENS=false\` and configure the email/SMS relays

## 6a. Logo & branding (লোগো পরিবর্তন)

- Admin → System → **Site Settings & SEO** → **site**
- **logoUrl** → **Upload** চাপুন → PNG/WEBP/JPG লোগো দিন (transparent PNG ভালো, প্রায় 400×100 px)। উপরে live preview দেখায় → **Save settings**
- **logoHeight** (desktop header, px) আর **logoHeightMobile** (mobile header, px) দিয়ে সাইজ ঠিক করুন
- **iconUrl** — ছোট বর্গাকার আইকন (প্রায় 256×256), login modal, game player, admin-এ crown-এর বদলে দেখায়
- **faviconUrl** — browser tab-এর আইকন (64×64 বা 180×180 PNG)
- **name** আর **tagline** — লোগো ছবি না দিলে এগুলো দিয়ে টেক্সট লোগো তৈরি হয় (প্রথম শব্দ সাদা, বাকিটা সোনালি), আর footer ও ইমেইলেও এই নাম ব্যবহার হয়
- **seo → ogImage** — Facebook/WhatsApp-এ share করলে যে ছবি দেখায় (1200×630)
- লোগো মুছে টেক্সট লোগোতে ফিরতে **Remove** চাপুন
- নিরাপত্তার কারণে SVG আপলোড করা যায় না (PNG/WEBP/JPG ব্যবহার করুন, সর্বোচ্চ 5MB)
- লোগো সাইট, mobile header, footer, admin panel আর admin login — সবখানে একসাথে বদলে যায়

## 7. Payments

- Built-in online gateways: **Stripe**, **SSLCommerz**, **bKash**, **NOWPayments (crypto)** and a **Custom** generic gateway — plus **Manual** (bank/e-wallet/crypto address + proof, admin approval).
- To enable a gateway, just add its keys to \`.env\` and restart. It appears on the player's Deposit page automatically; methods without keys stay hidden (Admin → Payment Methods shows \`configured\` / \`missing env\`).
- Deposits are auto-credited only after the gateway confirms them (API re-query or signed webhook), with amount/currency checks and exactly-once crediting.
- **Any other gateway:** Admin → Finance → **Custom Gateways** (no code) — see **INTEGRATION_GUIDE.md** or \`/install/integrations\`.
- Full step-by-step setup (Bengali): **PAYMENT_GATEWAY_GUIDE.md** or \`/install/payments\` on your site.
- Payment methods are managed in Admin → Finance → Payment Methods (limits, fees, instructions, proof requirement, status).
- Every balance change is written to the immutable \`transactions\` ledger inside a database transaction with row locks; duplicate approvals, double withdrawals and duplicate promo redemptions are rejected.

## 8. Game provider API key integration

Any provider can also be connected without code from Admin → Games → **Custom Game APIs** — see **INTEGRATION_GUIDE.md** or \`/install/integrations\`.

Games open inside the site's full-screen **Game Player** (iframe). Launch and wallet traffic runs only on the server — API keys never reach the browser.

### Step 1 — Put the keys in .env (server only)

- \`GAME_API_URL\` — provider/aggregator API base URL
- \`GAME_API_KEY\` — your API key (sent as \`Authorization: Bearer …\`)
- \`GAME_API_SECRET\` — request-signing secret (sent as \`X-Signature\` HMAC-SHA256 of the body)
- \`GAME_OPERATOR_ID\` — your operator / merchant ID
- \`GAME_CALLBACK_SECRET\` — shared secret used to verify the provider's wallet callbacks
- Optional: \`GAME_LAUNCH_PATH\` (default \`/games/launch\`), \`GAME_DEMO_PATH\` (\`/games/demo\`), \`GAME_DEFAULT_ADAPTER\`, \`GAME_DISPLAY=redirect\` (if the provider blocks iframes), \`GAME_SIGNATURE_HEADER\`, \`GAME_CALLBACK_IPS\` (provider IP allow-list)
- See \`.env.example\` for a full template. Restart the app after editing .env.

### Step 2 — Admin panel setup

- Admin → Games → **Providers** → edit the provider → **Integration adapter** = \`aggregator\` (API key) or \`direct\` (per-game URL)
- Admin → Games → **Games** → set **Provider game ID** (for aggregator) or **Game URL** (for direct)
- Mark games Active; use Maintenance status to temporarily disable a game

### Step 3 — Give the provider your callback URL

- Wallet callback: \`https://YOUR-DOMAIN/api/games/callback\`
- Header: \`x-signature = hex(HMAC_SHA256(rawBody, GAME_CALLBACK_SECRET))\`
- Actions (JSON): \`authenticate {token}\`, \`balance {token|userId}\`, \`bet {token|userId, amount, roundId, transactionId}\`, \`win {…}\`, \`rollback {roundId, transactionId}\`
- Response: \`{ok, balance, mainBalance, bonusBalance, currency, transactionId}\`
- Idempotent per transactionId; bets use main balance first then bonus, count toward wagering + VIP; wins return to the wallet the bet came from; rollbacks reverse the original bet.

### Step 4 — Test

- Click **Demo** on any game (works for guests), then **Play Now** as a logged-in player
- Admin → Finance → Ledger shows every bet/win/rollback with before/after balances

### Different provider API format?

- Open \`src/lib/server/games/adapters.ts\`, copy \`aggregatorAdapter\`, adjust the request body and response field mapping, register it in \`REGISTRY\`, and add its code to the provider "Integration adapter" options in \`src/lib/admin/resources.ts\`.
- If the provider's callback field names differ, map them at the top of \`src/app/api/games/callback/route.ts\`.

## 9. Operations

- **Cashback:** Admin → Financial Reports → VIP cashback run (idempotent per period) — schedule weekly.
- **Reports & exports:** ledger CSV export from Admin → Finance → Ledger.
- **Audit:** every sensitive admin action (balances, approvals, bans, permission & settings changes) is recorded with admin, IP and timestamp under System → Audit Log.
- **Uploads:** KYC documents and payment proofs are stored privately and served only to their owner or authorised admins.

## 10. Updating

- Pull the new version, \`npm ci\`, \`npx drizzle-kit push\` (review changes first), \`npm run build\`, then restart the process.

## Default credentials (change immediately)

- Admin: \`admin@aurumroyale.test\` / \`Admin@12345\` (or your ADMIN_EMAIL / ADMIN_PASSWORD)
- Demo player: \`demo@aurumroyale.test\` / \`Demo@12345\`
- Demo promo codes: \`WELCOME50\` (deposit match), \`ROYAL10\` (coupon), \`SPINS25\` (free spins)

**Legal notice:** operating real-money gambling requires a licence in each jurisdiction you serve. Complete licensing, KYC/AML and responsible-gaming obligations before accepting real deposits.
`;
