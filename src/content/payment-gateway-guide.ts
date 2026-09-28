export const PAYMENT_GATEWAY_GUIDE = `# Payment Gateway সেটআপ গাইড

এই casino-তে online payment gateway চালু করতে কোনো code লিখতে হবে না। সার্ভারের \`.env\` ফাইলে gateway-এর key বসিয়ে app restart করলেই সেই payment method player-দের Deposit পেজে দেখা যাবে।

## কোন কোন gateway তৈরি আছে

- **Stripe** — Visa/Mastercard card, Apple Pay, Google Pay (আন্তর্জাতিক)
- **SSLCommerz** — বাংলাদেশের card, bKash, Nagad, Rocket, internet banking (একসাথে)
- **bKash** — সরাসরি bKash Tokenized Checkout
- **NOWPayments** — Crypto: BTC, ETH, USDT, LTC সহ ৩০০+ coin
- **Custom gateway** — যেকোনো অন্য gateway (aamarPay, Nagad, PayPal bridge, local PSP ইত্যাদি), যদি সেটা JSON API আর signed webhook দেয়
- **Manual** — আগের মতো bank / e-wallet / crypto address + payment proof, admin approve করবে

## কীভাবে কাজ করে

- Player Deposit পেজে method বেছে amount দিয়ে **Pay securely** চাপে
- সার্ভার gateway-এর API দিয়ে payment session তৈরি করে, আর player-কে gateway-এর নিরাপদ payment পেজে পাঠায়
- Payment শেষ হলে gateway আমাদের **webhook** বা **return URL**-এ জানায়
- সার্ভার gateway-এর API বা signature দিয়ে **যাচাই** করে, amount আর currency মিলিয়ে দেখে, তারপর **নিজে থেকেই balance credit** করে
- Player-কে Account → Deposit পেজে ফেরত পাঠানো হয় আর ফলাফল দেখানো হয় (সফল / অপেক্ষমাণ / ব্যর্থ)
- প্রতিটা credit **Admin → Finance → Ledger**-এ আর audit log-এ লেখা থাকে

## সাধারণ ধাপ (সব gateway-এর জন্য)

- ধাপ ১: gateway-এর merchant account খুলে API key/credential নিন (প্রথমে **sandbox/test**)
- ধাপ ২: সার্ভারের \`.env\` ফাইলে key বসান (নিচে প্রতিটা gateway-এর তালিকা আছে)
- ধাপ ৩: \`APP_URL\` ঠিক আছে কি না দেখুন — যেমন \`APP_URL=https://www.yourcasino.com\` (gateway এই ঠিকানায় ফিরে আসে)
- ধাপ ৪: app restart করুন: \`pm2 restart aurum\` (বা \`npm run build && npm run start\`)
- ধাপ ৫: **Admin → Finance → Payment Methods**-এ গিয়ে দেখুন — gateway-এর পাশে **configured** লেখা থাকবে
- ধাপ ৬: দরকার হলে সেখানে নাম, minimum/maximum amount, fee, processing time, logo বদলান
- ধাপ ৭: Player হিসেবে ছোট amount দিয়ে test deposit করুন

যে gateway-এর key \`.env\`-এ নেই, সেটা player-দের কাছে **আপনা থেকেই লুকানো থাকে** (admin-এ দেখাবে **missing env**)। কোনো method সাময়িক বন্ধ রাখতে Payment Methods-এ **Enabled** বন্ধ করুন।

## Currency আর exchange rate

Wallet-এর currency ঠিক হয় **Admin → Settings → locale → currency** থেকে (default EUR)। Gateway অন্য currency-তে টাকা নিলে rate দিতে হবে:

- \`{GATEWAY}_CURRENCY\` — gateway কোন currency-তে charge করবে
- \`{GATEWAY}_EXCHANGE_RATE\` — site currency-র ১ একক = gateway currency-র কত একক

উদাহরণ: site EUR, কিন্তু bKash/SSLCommerz BDT নেয়, আর ১ EUR = ১৩০ BDT:

\`\`\`
BKASH_EXCHANGE_RATE=130
SSLCOMMERZ_EXCHANGE_RATE=130
\`\`\`

তাহলে player ১০ EUR deposit করলে gateway ১৩০০ BDT charge করবে, আর wallet-এ ১০ EUR জমা হবে।

**পরামর্শ:** বাংলাদেশি player-দের জন্য site currency **BDT** করে দিলে (Admin → Settings → locale: currency \`BDT\`, currencySymbol \`৳\`) কোনো rate লাগবে না। Currency আলাদা হলে কিন্তু rate না দিলে সিস্টেম deposit আটকে দেয়, যাতে ভুল হিসাব না হয়।

## ১. Stripe সেটআপ

- https://dashboard.stripe.com — account খুলুন, **Developers → API keys** থেকে **Secret key** নিন
- **Developers → Webhooks → Add endpoint**:
- URL: \`https://আপনার-domain.com/api/payments/webhook/stripe\`
- Events: \`checkout.session.completed\`, \`checkout.session.async_payment_succeeded\`, \`checkout.session.async_payment_failed\`, \`checkout.session.expired\`
- তৈরি হলে **Signing secret** (\`whsec_...\`) কপি করুন

\`\`\`
STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
STRIPE_CURRENCY=EUR
STRIPE_EXCHANGE_RATE=1
\`\`\`

- Test-এর সময় \`sk_test_...\` দিন আর card \`4242 4242 4242 4242\`, যেকোনো ভবিষ্যৎ তারিখ আর যেকোনো CVC ব্যবহার করুন
- Webhook না দিলেও player ফিরে এলে সার্ভার Stripe API দিয়ে যাচাই করে credit করে, তবে webhook দেওয়া **অবশ্যই** ভালো (browser বন্ধ হয়ে গেলেও credit হয়)

## ২. SSLCommerz সেটআপ

- Sandbox account: https://developer.sslcommerz.com/registration/ — ইমেইলে **Store ID** আর **Store Password** আসবে
- Live-এর জন্য SSLCommerz-এর সাথে merchant agreement করে live Store ID/Password নিন

\`\`\`
SSLCOMMERZ_STORE_ID=yourstore_id
SSLCOMMERZ_STORE_PASSWORD=yourstore_password
SSLCOMMERZ_SANDBOX=true
SSLCOMMERZ_CURRENCY=BDT
SSLCOMMERZ_EXCHANGE_RATE=1
\`\`\`

- Live-এ যাওয়ার সময় \`SSLCOMMERZ_SANDBOX=false\` দিন
- IPN URL আলাদা করে বসাতে হয় না — সিস্টেম প্রতিটা payment-এ নিজেই পাঠায় (\`/api/payments/webhook/sslcommerz\`)। চাইলে merchant panel-এও এই URL IPN হিসেবে বসাতে পারেন
- প্রতিটা payment SSLCommerz **Validation API** দিয়ে যাচাই করে তবেই credit হয়

## ৩. bKash সেটআপ

- bKash merchant (PGW) account-এর জন্য bKash-এর সাথে যোগাযোগ করুন: https://developer.bka.sh
- তারা দেবে: **username, password, app_key, app_secret** (sandbox আর live আলাদা)

\`\`\`
BKASH_USERNAME=sandboxTokenizedUser02
BKASH_PASSWORD=your_password
BKASH_APP_KEY=your_app_key
BKASH_APP_SECRET=your_app_secret
BKASH_SANDBOX=true
BKASH_EXCHANGE_RATE=1
\`\`\`

- site currency BDT না হলে \`BKASH_EXCHANGE_RATE\` অবশ্যই দিন (যেমন ১৩০)
- Live-এ \`BKASH_SANDBOX=false\`
- Callback URL সিস্টেম নিজেই পাঠায়: \`/api/payments/return/bkash\`
- Payment শেষে সার্ভার bKash **Execute** আর **Query Payment** API দিয়ে নিশ্চিত হয়ে credit করে। trxID admin note-এ সেভ হয়

## ৪. NOWPayments (Crypto) সেটআপ

- https://nowpayments.io — account খুলে **Store Settings → API keys** থেকে API key নিন
- **Store Settings → IPN secret key** তৈরি করুন
- Payout wallet (কোথায় crypto জমা হবে) সেট করুন

\`\`\`
NOWPAYMENTS_API_KEY=XXXXXXX-XXXXXXX-XXXXXXX-XXXXXXX
NOWPAYMENTS_IPN_SECRET=your_ipn_secret
NOWPAYMENTS_SANDBOX=false
NOWPAYMENTS_CURRENCY=EUR
\`\`\`

- IPN URL সিস্টেম প্রতিটা invoice-এ নিজেই পাঠায় (\`/api/payments/webhook/nowpayments\`)
- Crypto network confirmation পেলে status \`finished\` হয়, তখন balance credit হয়। তার আগে deposit **pending** থাকে

## ৫. Custom gateway (অন্য যেকোনো gateway)

যে gateway (বা আপনার নিজের payment middleware) এই দুটো কাজ পারে:

- JSON POST পেয়ে payment page-এর URL ফেরত দেয়
- Payment শেষে HMAC-SHA256 দিয়ে signed webhook পাঠায়

\`\`\`
CUSTOM_GATEWAY_NAME=aamarPay
CUSTOM_GATEWAY_CREATE_URL=https://api.gateway.com/checkout
CUSTOM_GATEWAY_API_KEY=your_api_key
CUSTOM_GATEWAY_WEBHOOK_SECRET=long_random_secret
CUSTOM_GATEWAY_SIGNATURE_HEADER=x-signature
CUSTOM_GATEWAY_CURRENCY=BDT
CUSTOM_GATEWAY_EXCHANGE_RATE=1
\`\`\`

সার্ভার gateway-কে যা পাঠায় (\`Authorization: Bearer API_KEY\`):

\`\`\`
{ "reference": "DEP-...", "amount": "500.00", "currency": "BDT", "description": "Wallet deposit DEP-...",
  "customer": { "id": "...", "name": "...", "email": "...", "phone": "..." },
  "successUrl": "https://আপনার-domain.com/api/payments/return/custom?ref=DEP-...",
  "cancelUrl": "...&result=cancel",
  "webhookUrl": "https://আপনার-domain.com/api/payments/webhook/custom" }
\`\`\`

Gateway-এর reply: \`{ "url": "https://payment-page...", "id": "GW-123" }\` (\`payment_url\` / \`checkout_url\` / \`redirect_url\` নামও চলে)

Payment শেষে gateway-এর webhook (header \`x-signature = HMAC_SHA256(rawBody, WEBHOOK_SECRET)\`):

\`\`\`
{ "reference": "DEP-...", "status": "paid", "amount": "500.00", "currency": "BDT", "id": "GW-123" }
\`\`\`

\`status\` হতে পারে: \`paid\` / \`success\` / \`completed\` → credit, \`failed\` → reject, \`cancelled\` / \`expired\` → cancel

Gateway-এর format একদম আলাদা হলে developer দিয়ে নিজস্ব adapter লেখান (নিচে দেখুন)।

## নিরাপত্তা (সিস্টেম নিজে যা করে)

- API key শুধু সার্ভারের \`.env\`-এ থাকে — browser, database বা frontend-এ কখনো যায় না
- **কখনো browser-এর কথায় বিশ্বাস করে credit হয় না** — প্রতিটা payment gateway-এর API বা signature দিয়ে যাচাই হয়
- **একই payment দুবার credit হয় না** — webhook একাধিকবার এলেও একবারই জমা হয়
- **Amount আর currency মিলিয়ে দেখা হয়** — কম টাকা এলে বা currency না মিললে deposit credit না করে **manual review**-তে রাখে, আর admin note-এ কারণ লেখে
- ভুল gateway থেকে আসা result (অন্য method-এর deposit) গ্রহণ করা হয় না
- Deposit reject হওয়ার পরে টাকা এলে auto-credit হয় না, admin-কে review করতে বলা হয়
- সব auto-approval audit log-এ **system** নামে লেখা থাকে

## Admin-এর কাজ

- **Finance → Deposits** — সব online deposit দেখা যায়। status \`pending\` মানে player এখনো payment শেষ করেনি বা gateway এখনো confirm করেনি
- Admin note-এ \`underpaid\` বা \`currency mismatch\` থাকলে gateway dashboard-এ মিলিয়ে দেখে approve বা reject করুন
- **Finance → Payment Methods** — প্রতিটা method-এর **Gateway** কলামে \`configured\` / \`missing env\` দেখা যায়
- পুরনো manual "Visa / Mastercard" method-টা Stripe চালু হলে বন্ধ করে দিতে পারেন (Enabled বন্ধ)

## Withdrawal (টাকা তোলা)

- Withdrawal আগের মতোই admin review দিয়ে চলে: **Finance → Withdrawals** → Processing → Completed
- টাকা gateway বা bank দিয়ে পাঠিয়ে তারপর **Completed** চাপুন। Reject করলে টাকা player-এর balance-এ আপনা থেকে ফেরত যায়
- Automatic payout (API দিয়ে টাকা পাঠানো) দরকার হলে adapter-এ \`createPayout\` যোগ করা যায় — developer-এর কাজ

## পরীক্ষা করার চেকলিস্ট

- Sandbox key দিয়ে restart → Deposit পেজে নতুন method দেখা যাচ্ছে কি না
- ছোট amount deposit → gateway পেজে গিয়ে test payment → ফিরে এসে **Payment successful** দেখাচ্ছে কি না
- Wallet balance বেড়েছে কি না, আর **Account → Transactions**-এ deposit আছে কি না
- **Admin → Finance → Deposits**-এ status **approved**, আর admin note-এ \`auto-approved\`
- Payment মাঝপথে cancel করে দেখুন → **Payment cancelled** দেখাবে, balance বদলাবে না
- সব ঠিক থাকলে live key বসিয়ে \`*_SANDBOX=false\` করে restart

## সমস্যা হলে

- **Method দেখা যাচ্ছে না** — \`.env\`-এ সব দরকারি key নেই, অথবা restart করা হয়নি। Admin → Payment Methods-এ **missing env** দেখাবে
- **"Payment gateway misconfigured: set …_EXCHANGE_RATE"** — site currency আর gateway currency আলাদা; rate বসান
- **Payment হলো কিন্তু balance বাড়েনি** — \`APP_URL\` ভুল, অথবা সার্ভার বাইরে থেকে reach করা যাচ্ছে না (webhook আসছে না)। Stripe dashboard → Webhooks-এ error দেখুন, আর সার্ভারের log দেখুন: \`pm2 logs aurum\` (\`[payments:...]\` লেখা লাইন)
- **"Invalid signature"** — webhook secret ভুল। Stripe-এ প্রতিটা endpoint-এর আলাদা \`whsec_\` থাকে
- **Deposit pending, admin note-এ "underpaid"** — player কম টাকা দিয়েছে; gateway-এ মিলিয়ে ম্যানুয়ালি ঠিক করুন
- **localhost-এ webhook আসে না** — স্বাভাবিক। Test-এর জন্য ngrok/cloudflared দিয়ে public URL নিয়ে \`APP_URL\`-এ বসান, অথবা Stripe CLI: \`stripe listen --forward-to localhost:3000/api/payments/webhook/stripe\`

## Developer-দের জন্য: নতুন gateway adapter যোগ করা

- \`src/lib/server/gateways/\` ফোল্ডারে নতুন ফাইল তৈরি করুন (যেমন \`nagad.ts\`), \`custom.ts\` বা \`stripe.ts\` দেখে লিখুন
- \`PaymentAdapter\` interface মেনে চলুন: \`code\`, \`isConfigured()\`, \`createDeposit()\`, আর \`handleWebhook()\` বা \`handleReturn()\`
- ফলাফল \`{ reference, status: "paid" | "failed" | "cancelled" | "pending", verified: true, amount, currency }\` আকারে ফেরত দিন। \`verified: true\` দেবেন শুধু signature বা gateway API দিয়ে যাচাই হলে
- \`src/lib/server/payments.ts\`-এর \`REGISTRY\`-তে যোগ করুন
- \`src/lib/admin/resources.ts\`-এ payment-methods-এর **Adapter** options-এ নতুন code যোগ করুন
- Admin → Payment Methods-এ **New** চেপে adapter বেছে method তৈরি করুন
- Credit, idempotency, amount check, ledger আর notification — সব \`settleGatewayDeposit\` নিজেই করে, adapter-এ লিখতে হয় না

## সংশ্লিষ্ট ফাইল

- \`src/lib/server/payments.ts\` — adapter registry
- \`src/lib/server/gateways/stripe.ts\`, \`sslcommerz.ts\`, \`bkash.ts\`, \`nowpayments.ts\`, \`custom.ts\` — gateway adapter
- \`src/lib/server/gateways/util.ts\` — env, currency conversion, signature helper
- \`src/app/api/payments/webhook/[gateway]/route.ts\` — webhook / IPN
- \`src/app/api/payments/return/[gateway]/route.ts\` — player ফিরে আসার URL
- \`src/lib/server/finance.ts\` — \`createDeposit\` আর \`settleGatewayDeposit\` (যাচাই + credit)
- \`.env.example\` — সব variable-এর template

**আইনি সতর্কতা:** অনেক gateway (Stripe, SSLCommerz, bKash) gambling ব্যবসার জন্য আলাদা অনুমতি বা নির্দিষ্ট দেশের license চায়। Live চালুর আগে gateway-এর terms আর আপনার license নিশ্চিত করুন।
`;
