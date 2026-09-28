export const GAME_API_GUIDE = `# Game API Key যোগ করার গাইড

এই নোটে ধাপে ধাপে লেখা আছে কীভাবে আপনার game provider বা aggregator-এর API key এই casino-তে বসাবেন। কোনো ধাপে design বদলাতে হবে না।

## পুরো ব্যবস্থা এক নজরে

- **Launch:** player "Play Now" চাপলে সার্ভার আপনার API key দিয়ে provider-এর কাছে game URL চায়, আর game সাইটের ভেতরের full-screen player-এ খোলে।
- **Wallet (seamless):** খেলার সময় provider প্রতিটা bet, win আর rollback-এর জন্য আমাদের callback URL-এ request পাঠায়। সার্ভার balance কাটে বা যোগ করে, আর ledger-এ লিখে রাখে।
- **নিরাপত্তা:** API key শুধু সার্ভারের \`.env\`-এ থাকে। Browser, database বা frontend code-এ কখনো যায় না।

## ধাপ ১ — provider-এর কাছ থেকে যা যা নিতে হবে

Provider-এর account manager-এর কাছে এগুলো চান:

- **API base URL** — যেমন \`https://api.provider.com/v1\`
- **API key**
- **API secret / signing key** (যদি request sign করতে হয়)
- **Operator ID / Merchant ID**
- **Callback secret** — তাদের callback যাচাই করার shared secret
- **Game list** — প্রতিটা game-এর provider game ID
- **তাদের server IP list** (callback allow-list-এর জন্য, ঐচ্ছিক)
- **API documentation** — launch আর wallet callback-এর format

## ধাপ ২ — .env ফাইলে key বসান

Project-এর root-এ \`.env\` ফাইল খুলুন (না থাকলে \`.env.example\` কপি করে \`.env\` নাম দিন), তারপর এগুলো বসান:

\`\`\`
GAME_DEFAULT_ADAPTER=aggregator
GAME_API_URL=https://api.provider.com/v1
GAME_API_KEY=আপনার-api-key
GAME_API_SECRET=আপনার-signing-secret
GAME_OPERATOR_ID=আপনার-operator-id
GAME_CALLBACK_SECRET=provider-এর-callback-secret
GAME_LAUNCH_PATH=/games/launch
GAME_DEMO_PATH=/games/demo
GAME_DEFAULT_CURRENCY=EUR
GAME_DISPLAY=iframe
GAME_SIGNATURE_HEADER=x-signature
GAME_CALLBACK_IPS=
\`\`\`

প্রতিটা variable কী কাজ করে:

- \`GAME_API_URL\` — provider API-এর base URL
- \`GAME_API_KEY\` — প্রতিটা request-এ \`Authorization: Bearer <key>\` হিসেবে যায়
- \`GAME_API_SECRET\` — থাকলে request body-র HMAC-SHA256 signature \`X-Signature\` header-এ যায়
- \`GAME_OPERATOR_ID\` — আপনার operator ID, request-এ \`operatorId\` হিসেবে যায়
- \`GAME_CALLBACK_SECRET\` — provider-এর callback আসল কি না যাচাই করে (**অবশ্যই দিতে হবে**, না দিলে callback বন্ধ থাকে)
- \`GAME_LAUNCH_PATH\` / \`GAME_DEMO_PATH\` — real আর demo launch endpoint-এর path
- \`GAME_DISPLAY\` — \`iframe\` (সাইটের ভেতরে খোলে) বা \`redirect\` (provider iframe না দিলে)
- \`GAME_SIGNATURE_HEADER\` — provider যে header-এ signature পাঠায় তার নাম
- \`GAME_CALLBACK_IPS\` — কমা দিয়ে provider-এর IP; খালি রাখলে সব IP থেকে নেয় (signature তবুও লাগবেই)

**Key বসানোর পর app restart করুন:** \`pm2 restart aurum\` বা \`npm run build && npm run start\`।

## ধাপ ৩ — Admin panel-এ provider সেট করুন

- \`/admin/login\` দিয়ে admin panel-এ ঢুকুন
- **Games → Providers** → provider-এর পাশে edit (✏️) চাপুন
- **Integration adapter** বেছে নিন:
- \`aggregator\` — API key দিয়ে launch (বেশিরভাগ provider-এর জন্য এটাই)
- \`direct\` — প্রতিটা game-এর নিজস্ব launch URL থাকলে
- Save করুন

নতুন provider হলে **New** চেপে নাম, slug, logo আর adapter দিয়ে তৈরি করুন।

## ধাপ ৪ — প্রতিটা game-এ provider game ID দিন

- **Games → Games** → game edit করুন
- **Provider** — সঠিক provider বেছে নিন
- **Provider game ID (integration reference)** — provider-এর দেওয়া game ID (যেমন \`vs20olympgate\`)
- \`direct\` adapter হলে **Game URL** ঘরে launch URL দিন
- **Status** = \`active\` রাখুন। সাময়িক বন্ধ রাখতে \`maintenance\` দিন।
- **Categories**, **Thumbnail**, **Featured/Popular/New/Hot** ঠিক করে Save করুন

নতুন game যোগ করতে **New** চাপুন। যোগ করলেই homepage-এর game grid আর category-তে দেখা যাবে।

## ধাপ ৫ — provider-কে callback URL দিন

Provider-এর back-office-এ বা account manager-কে এই URL দিন:

\`\`\`
https://আপনার-domain.com/api/games/callback
\`\`\`

## Callback-এর format (provider-এর developer-দের জন্য)

প্রতিটা request হবে \`POST\`, body JSON, আর header-এ signature থাকবে:

\`\`\`
x-signature = hex( HMAC_SHA256( rawBody, GAME_CALLBACK_SECRET ) )
\`\`\`

### authenticate — game খোলার সময় player যাচাই

\`\`\`
{ "action": "authenticate", "token": "<launch-এ পাঠানো token>" }
\`\`\`

### balance

\`\`\`
{ "action": "balance", "token": "<token>" }
\`\`\`

### bet

\`\`\`
{ "action": "bet", "token": "<token>", "amount": 5.00, "roundId": "R-1001", "transactionId": "TX-A1" }
\`\`\`

### win (হারলে amount 0 পাঠানো যায়)

\`\`\`
{ "action": "win", "token": "<token>", "amount": 12.50, "roundId": "R-1001", "transactionId": "TX-A2" }
\`\`\`

### rollback — bet বাতিল করে টাকা ফেরত

\`\`\`
{ "action": "rollback", "token": "<token>", "roundId": "R-1001", "transactionId": "TX-A1" }
\`\`\`

\`token\`-এর বদলে \`userId\` পাঠানো যায়। \`gameSlug\` ঐচ্ছিক।

### সফল response

\`\`\`
{ "ok": true, "balance": 257.00, "mainBalance": 257.00, "bonusBalance": 0, "currency": "EUR", "transactionId": "TX-...", "duplicate": false }
\`\`\`

### Error response

- \`401\` — ভুল signature বা মেয়াদ শেষ token (\`INVALID_TOKEN\`)
- \`400\` — balance কম (\`INSUFFICIENT_FUNDS\`) বা ভুল data
- \`403\` — player blocked (\`PLAYER_BLOCKED\`) বা IP অনুমোদিত নয়
- \`404\` — player পাওয়া যায়নি (\`PLAYER_NOT_FOUND\`)

## Wallet-এর নিয়ম (সিস্টেম নিজে থেকে যা করে)

- **একই transactionId দুবার এলে** টাকা একবারই কাটে বা যোগ হয় (duplicate নিরাপদ)
- **Bet** আগে main balance থেকে কাটে; main-এ কম থাকলে bonus balance থেকে
- **Win** সেই balance-এই ফেরে যেখান থেকে bet হয়েছিল
- **Rollback** আসল bet-টা পুরো ফেরত দেয় আর সেটাকে \`reversed\` চিহ্নিত করে
- **Balance কখনো মাইনাসে যায় না** — কম থাকলে bet আটকে যায়
- প্রতিটা bet **bonus wagering** আর **VIP points** বাড়ায়
- সব লেনদেন **Admin → Finance → Ledger**-এ before/after balance সহ দেখা যায়

## ধাপ ৬ — পরীক্ষা করুন

- Homepage-এ যেকোনো game খুলে **Demo** চাপুন (login ছাড়াই চলে)
- Login করে **Play Now** চাপুন → game full-screen player-এ খুলবে
- কয়েকটা spin দিন, তারপর **Admin → Finance → Ledger**-এ bet/win দেখুন
- Player-এর **Account → Transactions**-এও একই হিসাব দেখা যাবে

### Terminal থেকে callback পরীক্ষা (Linux/Mac)

\`\`\`
BODY='{"action":"balance","userId":"PLAYER-UUID"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "YOUR_CALLBACK_SECRET" | awk '{print $NF}')
curl -X POST https://আপনার-domain.com/api/games/callback -H "Content-Type: application/json" -H "x-signature: $SIG" -d "$BODY"
\`\`\`

Player-এর UUID পাবেন **Admin → Users** থেকে।

## Provider-এর API format আলাদা হলে (developer-দের জন্য)

প্রতিটা provider-এর request/response field-এর নাম একটু আলাদা। তখন নিজের adapter লিখুন:

- \`src/lib/server/games/adapters.ts\` খুলুন
- \`aggregatorAdapter\` পুরোটা কপি করে নতুন নাম দিন, যেমন \`myProviderAdapter\` (code: \`myprovider\`)
- request \`body\`-র field নাম provider-এর docs অনুযায়ী বদলান
- response থেকে game URL কোন field-এ আসে সেটা ঠিক করুন
- \`REGISTRY\`-তে যোগ করুন: \`[myProviderAdapter.code]: myProviderAdapter\`
- \`src/lib/admin/resources.ts\`-এ providers-এর **Integration adapter** options-এ \`"myprovider"\` যোগ করুন
- Admin panel-এ provider-এর adapter \`myprovider\` করে দিন

উদাহরণ (সংক্ষেপে):

\`\`\`
const myProviderAdapter: GameAdapter = {
  code: "myprovider",
  label: "My Provider",
  async launch(i) {
    const res = await fetch(process.env.GAME_API_URL + "/session", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": process.env.GAME_API_KEY! },
      body: JSON.stringify({ game_code: i.game.integrationRef, player_id: i.user?.id, session_token: i.token, currency: i.user?.currency, demo: i.mode === "demo" }),
    });
    const data = await res.json();
    return { url: data.game_url, display: "iframe" };
  },
};
\`\`\`

Callback-এর field নাম আলাদা হলে \`src/app/api/games/callback/route.ts\` ফাইলের শুরুতে \`schema\`-র আগে provider-এর field-গুলোকে আমাদের নামে (\`action\`, \`amount\`, \`roundId\`, \`transactionId\`, \`token\`) map করে নিন।

## সমস্যা হলে যা দেখবেন

- **"Game provider API is not configured"** — \`.env\`-এ \`GAME_API_URL\` / \`GAME_API_KEY\` নেই, অথবা key বসানোর পর restart করা হয়নি
- **"has no provider game ID"** — game-এ Provider game ID বসানো হয়নি
- **"has no Game URL configured"** — provider-এর adapter \`direct\`, কিন্তু game-এ URL নেই
- **"Game callback not configured" (503)** — \`GAME_CALLBACK_SECRET\` বসানো হয়নি
- **"Invalid signature" (401)** — secret মিলছে না, অথবা provider অন্য header-এ signature পাঠাচ্ছে (\`GAME_SIGNATURE_HEADER\` ঠিক করুন)
- **Game খোলে কিন্তু সাদা/খালি পর্দা** — provider iframe আটকাচ্ছে; \`GAME_DISPLAY=redirect\` দিন
- **"Invalid or expired token"** — token-এর মেয়াদ ৬ ঘণ্টা; game আবার খুলুন। \`AUTH_SECRET\` বদলালে পুরনো token বাতিল হয়ে যায়
- বিস্তারিত error দেখতে সার্ভারের log দেখুন: \`pm2 logs aurum\` (log-এ \`[games]\` লেখা লাইনগুলো)

## নিরাপত্তার জরুরি নিয়ম

- API key, secret কখনো frontend code, GitHub বা chat-এ দেবেন না — শুধু সার্ভারের \`.env\`-এ
- \`.env\` ফাইল git-এ commit করবেন না
- \`GAME_CALLBACK_SECRET\` লম্বা আর random রাখুন, আর provider-এর সাথে নিরাপদ উপায়ে share করুন
- Provider IP list পেলে \`GAME_CALLBACK_IPS\`-এ বসিয়ে দিন
- সাইট অবশ্যই **HTTPS**-এ চালাবেন
- Real-money চালুর আগে provider-এর **staging/test** credentials দিয়ে পুরোটা পরীক্ষা করে নিন

## সংশ্লিষ্ট ফাইল

- \`src/lib/server/games/adapters.ts\` — provider adapter (direct, aggregator, custom)
- \`src/lib/server/games/launch.ts\` — game launch আর নিরাপদ session token
- \`src/app/api/games/launch/route.ts\` — Play/Demo API
- \`src/app/api/games/callback/route.ts\` — seamless wallet callback
- \`src/lib/server/finance.ts\` — \`processGameEvent\`: wallet-এর হিসাব
- \`src/components/games/GamePlayer.tsx\` — full-screen game player
- \`.env.example\` — সব environment variable-এর template
`;
