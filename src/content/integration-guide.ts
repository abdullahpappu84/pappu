export const INTEGRATION_GUIDE = `# যেকোনো Payment Gateway ও Game API যোগ করার নোট

এই casino-তে এখন **যেকোনো** payment gateway বা game provider-এর API **Admin panel থেকেই** যোগ করা যায়, code লিখতে হয় না। Gateway বা provider-এর API documentation দেখে কয়েকটা ঘর পূরণ করলেই হবে।

## কোথায় পাবেন

- **Payment gateway:** Admin → Finance → **Custom Gateways**
- **Game API:** Admin → Games → **Custom Game APIs**
- প্রতিটা integration-এর জন্য দরকারি URL (webhook / callback) ফর্মের উপরেই দেখায় — কপি করে gateway বা provider-কে দিন

## শুরুর আগে provider/gateway-এর কাছ থেকে যা নেবেন

- API documentation (সবচেয়ে জরুরি)
- API base URL — sandbox আর live দুটোই
- API key / Merchant ID / Store ID / Secret key / Signing key
- Webhook বা callback-এর signature নিয়ম (কোন header-এ আসে, কোন algorithm — HMAC-SHA256, MD5 ইত্যাদি)
- Game provider হলে: game list (প্রতিটা game-এর ID)

## মূল ধারণা: template আর variable

সব request "template" দিয়ে তৈরি হয়। Template-এ \`{{variable}}\` লিখলে সিস্টেম সেখানে আসল মান বসিয়ে দেয়।

\`\`\`
{ "order_id": "{{reference}}", "amount": "{{amount}}", "api_key": "{{secret.API_KEY}}" }
\`\`\`

- \`{{reference}}\` → আমাদের deposit reference (যেমন DEP-ABC123)
- \`{{amount}}\` → টাকার পরিমাণ (যেমন 1300.00)
- \`{{secret.API_KEY}}\` → আপনার সেভ করা secret

### Filter

\`{{variable|filter}}\` — একাধিক filter চেইন করা যায়:

- \`url\` — URL-encode (query string-এ দরকার): \`{{lobby_url|url}}\`
- \`upper\` / \`lower\` / \`trim\`
- \`base64\`
- \`md5\` / \`sha1\` / \`sha256\` / \`sha512\` — hash: \`{{reference|md5}}\`

### Path (response থেকে মান বের করা)

Response-এর ভেতরের মান dotted path দিয়ে বলুন:

\`\`\`
{ "status": "success", "data": { "id": "PAY-9", "links": [ { "url": "https://pay..." } ] } }
\`\`\`

- \`data.id\` → PAY-9
- \`data.links[0].url\` → https://pay...
- Gateway শুধু plain text URL ফেরত দিলে path দিন \`raw\`

## Secret (API key) কীভাবে রাখবেন

- ফর্মের **Secrets** অংশে নাম (যেমন \`API_KEY\`) আর মান দিন
- মান **এনক্রিপ্ট করে** সেভ হয়, আর admin panel-এও আর কখনো দেখা যায় না (শুধু "stored" লেখা থাকে)
- বদলাতে নতুন মান টাইপ করে Save করুন। ফাঁকা রাখলে আগেরটাই থাকে
- **.env থেকে নিতে চাইলে:** মান হিসেবে লিখুন \`env:VAR_NAME\`। যেমন \`env:AAMARPAY_SIGNATURE_KEY\`, তারপর সার্ভারের \`.env\`-এ \`AAMARPAY_SIGNATURE_KEY=...\` বসিয়ে restart করুন
- Template-এ ব্যবহার: \`{{secret.API_KEY}}\`

## Preset (তৈরি টেমপ্লেট)

নতুন integration খুললে **Load a preset** থেকে কাছাকাছি একটা বেছে নিন। সব ঘর আগে থেকে পূরণ হয়ে যাবে, আপনি শুধু URL, field-এর নাম আর secret মিলিয়ে নেবেন।

- **JSON API + HMAC webhook** — আধুনিক বেশিরভাগ gateway
- **Form API + verification API** — aamarPay / SSLCommerz ধরনের
- **Hosted form POST + MD5** — পুরনো ধরনের PSP (browser form post করে)
- **Seamless wallet aggregator** — JSON launch API + wallet callback
- **Direct URL template** — launch API নেই, URL বানিয়ে iframe-এ খোলে

## পর্ব ক — Payment Gateway যোগ করা

### ধাপ ১: নতুন gateway খুলুন

- Admin → Finance → **Custom Gateways** → **Add gateway**
- **Display name** (player যা দেখবে), যেমন \`aamarPay\`
- **Code** — ছোট হাতের ইংরেজি, যেমন \`aamarpay\` (URL-এ ব্যবহার হয়, পরে বদলানো যায় না)
- Preset বেছে নিন
- Secrets দিন (API key ইত্যাদি)

### ধাপ ২: Create payment (checkout)

- **Checkout type:**
- \`api\` — আমাদের সার্ভার gateway-এর API-তে request পাঠায়, gateway একটা payment page URL দেয়, player সেখানে যায়
- \`form_post\` — player-এর browser একটা form নিজে থেকে gateway-তে submit করে (পুরনো PSP)
- **HTTP method** আর **Body format** (\`json\` অথবা \`form\`)
- **Create URL** — gateway-এর payment তৈরির endpoint
- **Headers** — প্রতি লাইনে একটা: \`Authorization: Bearer {{secret.API_KEY}}\`
- **Body template** — JSON হলে JSON লিখুন; form হলে প্রতি লাইনে \`key=value\`

Payment-এর variable:

- \`reference\`, \`deposit_id\`
- \`amount\` (gateway currency-তে, যেমন 1300.00), \`amount_cents\` (×100), \`amount_int\`
- \`currency\`, \`site_amount\`, \`site_currency\`
- \`description\`
- \`customer_name\`, \`customer_email\`, \`customer_phone\`, \`user_id\`
- \`success_url\`, \`fail_url\`, \`cancel_url\`, \`return_url\`
- \`webhook_url\` (gateway-এর IPN/notify URL হিসেবে দিন)
- \`site_url\`, \`timestamp\`, \`timestamp_ms\`, \`iso_time\`, \`nonce\`, \`signature\`
- \`secret.NAME\`

### ধাপ ৩: Gateway response (শুধু api ধরনের জন্য)

- **Payment page URL path** — response-এর কোথায় payment link আছে (যেমন \`data.payment_url\`)
- **Gateway payment ID path** — gateway-এর transaction ID (যেমন \`data.id\`)
- **Success flag path / values** — যদি response-এ \`"status":"success"\` জাতীয় flag থাকে
- **Error message path** — ব্যর্থ হলে player-কে যে বার্তা দেখাবে

### ধাপ ৪: Request signature (যদি gateway চায়)

কিছু gateway প্রতিটা request-এ signature চায়:

- **Algorithm** — \`hmac-sha256\`, \`md5\` ইত্যাদি
- **Sign what** — \`body\` (পুরো request body) অথবা \`template\` (নিজের মতো string)
- **Signature template** — যেমন \`{{secret.MERCHANT_ID}}|{{reference}}|{{amount}}|{{secret.SECRET_KEY}}\`
- **Secret name** — HMAC-এর key কোন secret
- ফলাফল \`{{signature}}\` হিসেবে body/header-এ বসানো যায়, অথবা **Send in header**-এ header-এর নাম দিন
- Signature যদি body-র ভেতরেই পাঠাতে হয় (যেমন \`sign={{signature}}\`), তাহলে **Sign what = template** দিন

### ধাপ ৫: Currency

- **Gateway currency** — যেমন \`BDT\` (ফাঁকা = site currency)
- **Exchange rate** — site currency-র ১ একক = gateway currency-র কত একক (যেমন ১ EUR = ১৩০ BDT → \`130\`)
- Currency আলাদা অথচ rate নেই হলে deposit আটকে যাবে (ভুল হিসাব এড়াতে)

### ধাপ ৬: Payment confirmation (সবচেয়ে গুরুত্বপূর্ণ)

Payment শেষ হলে gateway জানায় (webhook/IPN) বা player ফিরে আসে (return)। সিস্টেম **শুধু যাচাই হলে** টাকা জমা করে।

**Verification method:**

- \`signature\` — gateway-এর পাঠানো signature মিলিয়ে দেখে (সবচেয়ে প্রচলিত)
- \`requery\` — gateway-এর "verify / transaction status" API-তে জিজ্ঞেস করে নিশ্চিত হয় (aamarPay, SSLCommerz ধরনের)
- \`none\` — কখনো নিজে থেকে জমা হয় না; admin Finance → Deposits থেকে approve করবেন

**Field mapping** (webhook-এ gateway কোন নামে পাঠায়):

- **Our reference field** — আমাদের reference কোন field-এ ফেরত আসে (যেমন \`order_id\`, \`tran_id\`, \`mer_txnid\`)
- **Status field** — যেমন \`status\`, \`pay_status\`
- **Amount field**, **Currency field**, **Gateway transaction ID field**
- **Amount divisor** — gateway পয়সা/সেন্টে পাঠালে \`100\`
- **Paid / Failed / Cancelled status values** — কমা দিয়ে, যেমন \`paid,success,Successful\`
- **Webhook reply** — gateway যে উত্তর চায় (যেমন \`OK\` বা \`{"status":"ok"}\`)

### ধাপ ৭ক: Webhook signature (verification = signature)

- **Signature location** — \`header\` (যেমন \`x-signature\`) অথবা \`field\` (body-র ভেতরে, যেমন \`sign\`)
- **Strip prefix** — header-এ \`sha256=abc...\` থাকলে \`sha256=\` দিন
- **Algorithm** আর **Encoding** (\`hex\` / \`hex-upper\` / \`base64\`)
- **Signed data:**
- \`raw\` — পুরো raw body (JSON webhook-এ সাধারণত এটাই)
- \`sorted\` — সব field key অনুযায়ী সাজিয়ে \`a=1&b=2\` (signature field বাদে)
- \`template\` — নিজের মতো, যেমন \`{{body.order_id}}{{body.amount}}{{body.status}}{{secret.SECRET_KEY}}\`
- **Secret name** — কোন secret দিয়ে যাচাই

### ধাপ ৭খ: Verification API (verification = requery)

- **Verify URL**, method, headers, body — variable: \`{{reference}}\`, \`{{provider_ref}}\`, \`{{body.*}}\`, \`{{query.*}}\`, \`{{secret.*}}\`
- Response থেকে reference / status / amount / currency / transaction ID-এর path দিন

### ধাপ ৮: Gateway-কে URL দিন

ফর্মের উপরে দেখানো URL দুটো:

- **Webhook / IPN URL:** \`https://আপনার-domain.com/api/payments/webhook/{code}\` — gateway-এর panel-এ বসান (অনেক gateway-এ \`{{webhook_url}}\` দিয়ে প্রতি request-এ পাঠানোও যায়)
- **Return URL:** নিজে থেকেই \`{{success_url}}\` / \`{{fail_url}}\` / \`{{cancel_url}}\`-এ যায়

### ধাপ ৯: Save, test, চালু

- **Save** চাপলে Finance → Payment Methods-এ একই নামে payment method **নিজে থেকে তৈরি** হয়। সেখানে limit, fee, logo, নাম বদলাতে পারবেন
- তালিকায় 🧪 (**Test**) চাপুন → gateway-তে একটা test session তৈরি হবে, আর পুরো request/response দেখা যাবে (secret লুকানো থাকে)। কোনো deposit রেকর্ড হয় না
- তারপর player হিসেবে ছোট amount দিয়ে আসল sandbox payment করে দেখুন
- **Active** বন্ধ করলে method player-দের কাছে লুকিয়ে যায়

## উদাহরণ ১: JSON gateway (HMAC webhook)

Docs বলছে: \`POST https://api.gw.com/v1/checkout\`, header \`X-API-KEY\`, response \`{"checkout_url": "...", "id": "..."}\`; webhook header \`X-GW-Signature\` = HMAC-SHA256(raw body), body \`{"merchant_ref":"...","state":"COMPLETED","total":"500.00","currency":"BDT","id":"..."}\`

- Create URL: \`https://api.gw.com/v1/checkout\` · method POST · json
- Headers: \`X-API-KEY: {{secret.API_KEY}}\`
- Body:

\`\`\`
{
  "merchant_ref": "{{reference}}",
  "total": "{{amount}}",
  "currency": "{{currency}}",
  "customer_email": "{{customer_email}}",
  "redirect_url": "{{success_url}}",
  "cancel_url": "{{cancel_url}}",
  "notify_url": "{{webhook_url}}"
}
\`\`\`

- Payment page URL path: \`checkout_url\` · ID path: \`id\`
- Verification: \`signature\` · header \`X-GW-Signature\` · \`hmac-sha256\` · hex · raw · secret \`WEBHOOK_SECRET\`
- Reference field \`merchant_ref\` · Status field \`state\` · Amount \`total\` · Currency \`currency\` · ID \`id\`
- Paid values: \`completed\` · Failed: \`failed,declined\` · Cancelled: \`cancelled,expired\`

## উদাহরণ ২: aamarPay ধরনের (form + verify API)

- Preset: **Form API + verification API**
- Create URL: sandbox \`https://sandbox.aamarpay.com/jsonpost.php\` (live URL docs থেকে নিন)
- Secrets: \`STORE_ID\`, \`SIGNATURE_KEY\`
- Verify URL: docs-এর transaction check endpoint, body-তে \`request_id={{reference}}\`
- Status path \`pay_status\`, paid value \`Successful\`
- Currency \`BDT\`; site currency EUR হলে exchange rate দিন

(Endpoint আর field-এর নাম সবসময় gateway-এর সর্বশেষ docs থেকে মিলিয়ে নিন।)

## পর্ব খ — Game API যোগ করা

### ধাপ ১: নতুন game API খুলুন

- Admin → Games → **Custom Game APIs** → **Add game API**
- Name, Code (যেমন \`evoagg\`), Preset, Secrets (API key, secret, operator ID, callback secret)

### ধাপ ২: Game launch

- **Launch type:**
- \`api\` — provider-এর launch API-তে request পাঠিয়ে game URL নেয়
- \`url_template\` — কোনো API নেই; URL নিজেই বানায়: \`https://games.provider.com/launch?game={{game_id}}&token={{token}}&lobby={{lobby_url|url}}\`
- **Open game as** — \`iframe\` (সাইটের ভেতরের full-screen player) অথবা \`redirect\` (provider iframe না দিলে)
- **Demo URL** — demo-র জন্য আলাদা endpoint থাকলে
- api হলে: method, body format, headers, body template, **Game URL path** (যেমন \`data.url\`)

Game-এর variable:

- \`game_id\` — game-এর **Provider game ID** (Admin → Games-এ প্রতিটা game-এ বসান)
- \`game_slug\`, \`game_name\`, \`provider\`
- \`mode\` (real/demo), \`demo\` (true/false), \`real\`
- \`player_id\`, \`player_name\`, \`player_email\` (demo-তে ফাঁকা)
- \`currency\`, \`language\`
- \`token\` — নিরাপদ session token (৬ ঘণ্টা মেয়াদ)। Provider এটা callback-এ ফেরত পাঠায়
- \`device\` / \`platform\` (desktop/mobile), \`lobby_url\`, \`callback_url\`, \`ip\`
- \`timestamp\`, \`nonce\`, \`signature\`, \`secret.NAME\`

### ধাপ ৩: Wallet callback security

Provider খেলার সময় balance, bet, win আর rollback-এর জন্য আমাদের সার্ভারে request পাঠায়:

\`\`\`
https://আপনার-domain.com/api/games/callback/{code}
\`\`\`

- **Authentication:**
- \`signature\` — HMAC/hash যাচাই (payment-এর মতোই: location, algorithm, encoding, signed data, secret)
- \`header_token\` — একটা header-এর মান (যেমন \`Authorization: Bearer XYZ\`) একটা secret-এর সাথে মেলায়
- \`none\` — **ব্যবহার করবেন না** (শুধু পরীক্ষার জন্য)

### ধাপ ৪: Callback field mapping

Provider কোন নামে data পাঠায়, সেটা বলে দিন:

- **Action field** — যেমন \`action\`, \`type\`, \`method\`
- **Session token field** — যেমন \`token\`, \`session_token\`
- **Player ID field** — যেমন \`player_id\`, \`userId\`
- **Amount**, **Round ID**, **Transaction ID**, **Game ID** field
- **Amount divisor** — provider সেন্টে পাঠালে \`100\`
- **Action values** — provider-এর action নাম আমাদের action-এর সাথে মেলান:
- Authenticate: \`authenticate,auth,init\`
- Balance: \`balance,getBalance\`
- Bet: \`bet,debit,withdraw\`
- Win: \`win,credit,deposit\`
- Rollback: \`rollback,refund,cancel\`

### ধাপ ৫: Callback responses

Provider যে format-এ উত্তর চায়, সেটা template হিসেবে লিখুন:

\`\`\`
{"status":"OK","balance":{{balance}},"currency":"{{currency}}","transaction_id":"{{transaction_id}}"}
\`\`\`

\`\`\`
{"status":"ERROR","error_code":"{{error_code}}","message":"{{message}}"}
\`\`\`

- Variable: \`balance\`, \`balance_main\`, \`balance_bonus\`, \`currency\`, \`transaction_id\`, \`player_id\`, \`player_name\`, \`duplicate\`, \`error_code\`, \`message\`, \`request.*\`
- **Balance multiplier** — balance সেন্টে পাঠাতে \`100\`
- **Error HTTP status** — অনেক provider সব উত্তরে HTTP 200 চায় → \`200\`
- **Error code mapping** — আমাদের error code থেকে provider-এর code, প্রতি লাইনে \`OUR=THEIRS\`:

\`\`\`
INSUFFICIENT_FUNDS=1006
INVALID_TOKEN=1001
PLAYER_NOT_FOUND=1002
PLAYER_BLOCKED=1003
INVALID_SIGNATURE=1004
BAD_REQUEST=1000
ERROR=9999
\`\`\`

### ধাপ ৬: Provider-এর সাথে যুক্ত করুন

- Save করুন
- Admin → Games → **Providers** → provider edit → **Integration adapter** = আপনার integration (যেমন \`Evo Agg (custom)\`)। নতুন provider হলে **New** দিয়ে তৈরি করুন
- Admin → Games → **Games** → প্রতিটা game-এ **Provider** বেছে **Provider game ID** বসান, Status = active
- Provider-কে callback URL দিন: \`https://আপনার-domain.com/api/games/callback/{code}\`

### ধাপ ৭: Test

- তালিকায় 🧪 চাপুন → Provider game ID দিন → demo বা real → **Run test** → launch URL আর পুরো request/response দেখা যাবে
- সাইটে game খুলে **Demo** আর **Play Now** দিয়ে দেখুন
- কয়েকটা spin দিয়ে Admin → Finance → **Ledger**-এ bet/win দেখুন

## Wallet-এর নিয়ম (সব integration-এ একই)

- একই transaction ID দুবার এলে টাকা একবারই কাটে/যোগ হয়
- Bet আগে main balance থেকে, না থাকলে bonus balance থেকে
- Win সেই balance-এই যায় যেখান থেকে bet হয়েছিল
- Rollback আসল bet পুরো ফেরত দেয়
- Balance কখনো মাইনাসে যায় না (\`INSUFFICIENT_FUNDS\`)
- প্রতিটা bet bonus wagering আর VIP points বাড়ায়
- সব লেনদেন ledger-এ before/after balance সহ থাকে

## Payment-এর নিরাপত্তা (সিস্টেম নিজে যা করে)

- Browser-এর কথায় কখনো টাকা জমা হয় না — signature বা verify API দিয়ে যাচাই হলেই শুধু জমা
- একই payment দুবার জমা হয় না
- Amount কম এলে বা currency না মিললে জমা না করে admin review-তে রাখে (admin note-এ কারণ)
- সব পরিবর্তন (integration তৈরি/বদল/মুছে ফেলা, secret বদল) audit log-এ থাকে
- শুধু **finance.settings** (payment) আর **games.edit** (game) permission-ধারী admin integration দেখতে/বদলাতে পারেন

## সমস্যা হলে

- **"request URL is not configured"** — Create/Launch URL ফাঁকা
- **"body template is not valid JSON after rendering"** — JSON template-এ কমা/কোট ভুল। সংখ্যা বা true/false কোট ছাড়া বসাতে চাইলে \`"demo": {{demo}}\` লিখুন
- **"Gateway misconfigured: set an exchange rate"** — currency আলাদা, rate দিন
- **"payment could not be created"** — Test চেপে response দেখুন, **Payment page URL path** ঠিক আছে কি না মিলিয়ে নিন
- **Webhook "Invalid signature"** — algorithm, encoding, signed data (raw/sorted/template), prefix বা secret ভুল। Gateway-এর docs-এর উদাহরণ দিয়ে মেলান
- **Payment হলো কিন্তু balance বাড়েনি** — (১) verification \`none\` দেওয়া আছে, (২) reference field-এর নাম ভুল, (৩) paid values-এ gateway-এর status নেই, (৪) \`APP_URL\` ভুল, তাই webhook আসছে না। Admin → Finance → Deposits-এর admin note আর সার্ভারের log দেখুন: \`pm2 logs aurum\` (\`[payments:code]\`)
- **Game callback-এ "Unknown action"** — Action values-এ provider-এর action নাম যোগ করুন
- **"Invalid or expired token"** — token-এর মেয়াদ ৬ ঘণ্টা; game আবার খুলুন। Token field-এর নাম ঠিক আছে কি না দেখুন
- **"PLAYER_NOT_FOUND"** — provider token না পাঠালে player ID field-এ আমাদের player UUID আসতে হবে (launch-এ \`{{player_id}}\` পাঠান)
- **Game খোলে কিন্তু সাদা পর্দা** — provider iframe আটকাচ্ছে; Open game as = \`redirect\`

## Terminal থেকে callback/webhook পরীক্ষা

\`\`\`
BODY='{"action":"balance","player_id":"PLAYER-UUID"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "CALLBACK_SECRET" | awk '{print $NF}')
curl -X POST https://আপনার-domain.com/api/games/callback/evoagg -H "Content-Type: application/json" -H "x-signature: $SIG" -d "$BODY"
\`\`\`

## Built-in আর Custom — কোনটা কখন

- **Stripe, SSLCommerz, bKash, NOWPayments** আগে থেকেই তৈরি আছে — শুধু \`.env\`-এ key দিলেই চলে (PAYMENT_GATEWAY_GUIDE.md দেখুন)
- তালিকায় না থাকা যেকোনো gateway/provider → **Custom Gateways / Custom Game APIs**
- খুব অদ্ভুত নিয়মের API হলে (একাধিক ধাপের handshake, বিশেষ encryption) developer দিয়ে code-এ adapter লেখান: \`src/lib/server/gateways/\` (payment) বা \`src/lib/server/games/adapters.ts\` (game)

## সংশ্লিষ্ট ফাইল (developer-দের জন্য)

- \`src/lib/integrations/fields.ts\` — ফর্মের ঘর, preset, variable-এর তালিকা
- \`src/lib/server/integrations/engine.ts\` — template, filter, path, signature, HTTP request
- \`src/lib/server/integrations/payment.ts\` — universal payment adapter
- \`src/lib/server/integrations/game.ts\` — universal game launch আর wallet callback
- \`src/lib/server/integrations/store.ts\` — এনক্রিপ্টেড secret, cache
- \`src/app/api/payments/webhook/[gateway]\`, \`return/[gateway]\`, \`redirect\` — payment URL
- \`src/app/api/games/callback/[code]\` — game callback URL
- \`src/components/admin/IntegrationsSection.tsx\` — admin panel-এর ফর্ম
`;
