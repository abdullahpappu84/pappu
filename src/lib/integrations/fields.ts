/**
 * Universal integration form definitions (shared by the admin UI and docs).
 * All config values are plain strings. Templates use {{variable}} placeholders and optional filters:
 *   {{amount}}  {{secret.API_KEY}}  {{lobby_url|url}}  {{language|lower}}  {{body.order_id}}
 * Filters: url, upper, lower, trim, base64, md5, sha1, sha256, sha512
 */
export type IntegrationKind = "payment" | "game";
export type IField = { key: string; label: string; type: "text" | "textarea" | "select" | "number"; options?: string[]; help?: string; placeholder?: string; full?: boolean };
export type ISection = { title: string; description?: string; showIf?: [string, string[]]; fields: IField[] };

const SIG_ALGOS = ["none", "hmac-sha256", "hmac-sha512", "hmac-sha1", "hmac-md5", "sha256", "sha512", "sha1", "md5"];
const VERIFY_ALGOS = SIG_ALGOS.filter((a) => a !== "none");
const ENCODINGS = ["hex", "hex-upper", "base64"];

const requestSigning = (title = "Outgoing request signature (optional)"): ISection => ({
  title,
  description: "If the provider requires signed requests. The result is available as {{signature}} in headers/body and can be sent in a header automatically.",
  fields: [
    { key: "reqSigAlgo", label: "Algorithm", type: "select", options: SIG_ALGOS },
    { key: "reqSigPayload", label: "Sign what", type: "select", options: ["body", "template"], help: "body = the rendered request body · template = the template below (use this when {{signature}} goes inside the body)" },
    { key: "reqSigSecret", label: "Secret name", type: "text", placeholder: "API_SECRET", help: "Name of a secret below (used for HMAC)" },
    { key: "reqSigEncoding", label: "Encoding", type: "select", options: ENCODINGS },
    { key: "reqSigHeader", label: "Send in header (optional)", type: "text", placeholder: "X-Signature" },
    { key: "reqSigTemplate", label: "Signature template", type: "textarea", full: true, placeholder: "{{secret.MERCHANT_ID}}|{{reference}}|{{amount}}|{{secret.SECRET_KEY}}" },
  ],
});

const verifySig = (p: "sig" | "cbSig"): IField[] => [
  { key: `${p}Source`, label: "Signature location", type: "select", options: ["header", "field"] },
  { key: `${p}Header`, label: "Header name", type: "text", placeholder: "x-signature" },
  { key: `${p}Field`, label: "Body/query field name", type: "text", placeholder: "signature" },
  { key: `${p}Prefix`, label: "Strip prefix (optional)", type: "text", placeholder: "sha256=" },
  { key: `${p}Algo`, label: "Algorithm", type: "select", options: VERIFY_ALGOS },
  { key: `${p}Encoding`, label: "Encoding", type: "select", options: ENCODINGS },
  { key: `${p}Payload`, label: "Signed data", type: "select", options: ["raw", "sorted", "template"], help: "raw = exact request body · sorted = key=value&… sorted by key (signature field excluded) · template = template below" },
  { key: `${p}Secret`, label: "Secret name", type: "text", placeholder: p === "sig" ? "WEBHOOK_SECRET" : "CALLBACK_SECRET" },
  { key: `${p}Template`, label: "Signature template", type: "textarea", full: true, placeholder: "{{body.order_id}}{{body.amount}}{{body.status}}{{secret.SECRET_KEY}}" },
];

export const PAYMENT_SECTIONS: ISection[] = [
  {
    title: "1 · Create payment (checkout)",
    fields: [
      { key: "createMode", label: "Checkout type", type: "select", options: ["api", "form_post"], help: "api = server calls the gateway API and redirects to the returned URL · form_post = player's browser auto-posts a form to the gateway" },
      { key: "createMethod", label: "HTTP method", type: "select", options: ["POST", "GET"] },
      { key: "createContentType", label: "Body format", type: "select", options: ["json", "form"] },
      { key: "createUrl", label: "Create / checkout URL", type: "text", full: true, placeholder: "https://api.gateway.com/v1/payments" },
      { key: "createHeaders", label: "Headers (one per line: Name: value)", type: "textarea", full: true, placeholder: "Authorization: Bearer {{secret.API_KEY}}" },
      { key: "createBody", label: "Body template", type: "textarea", full: true, help: "JSON template (json) — or one key=value per line (form / form_post)" },
    ],
  },
  {
    title: "2 · Gateway response",
    showIf: ["createMode", ["api", ""]],
    description: "Dotted paths into the JSON response, e.g. data.payment_url or items[0].url. Use raw if the gateway returns a plain URL.",
    fields: [
      { key: "responseUrlPath", label: "Payment page URL path", type: "text", placeholder: "data.payment_url" },
      { key: "responseIdPath", label: "Gateway payment ID path", type: "text", placeholder: "data.id" },
      { key: "responseSuccessPath", label: "Success flag path (optional)", type: "text", placeholder: "status" },
      { key: "responseSuccessValues", label: "Success values", type: "text", placeholder: "success,true,1" },
      { key: "responseErrorPath", label: "Error message path", type: "text", placeholder: "message" },
    ],
  },
  requestSigning(),
  {
    title: "3 · Currency",
    fields: [
      { key: "currency", label: "Gateway currency", type: "text", placeholder: "BDT", help: "Empty = site currency" },
      { key: "exchangeRate", label: "Exchange rate", type: "number", placeholder: "130", help: "1 site currency = N gateway currency (required if different)" },
    ],
  },
  {
    title: "4 · Payment confirmation (webhook / IPN / return)",
    description: "How a completed payment is recognised. Deposits are auto-credited ONLY when verified (signature or verification API).",
    fields: [
      { key: "verifyMode", label: "Verification method", type: "select", options: ["signature", "requery", "none"], help: "signature = verify HMAC/hash · requery = call the gateway's verify API · none = never auto-credit (admin approves)" },
      { key: "whRefPath", label: "Our reference field", type: "text", placeholder: "order_id" },
      { key: "whStatusPath", label: "Status field", type: "text", placeholder: "status" },
      { key: "whAmountPath", label: "Amount field", type: "text", placeholder: "amount" },
      { key: "whCurrencyPath", label: "Currency field", type: "text", placeholder: "currency" },
      { key: "whIdPath", label: "Gateway transaction ID field", type: "text", placeholder: "transaction_id" },
      { key: "amountDivisor", label: "Amount divisor", type: "number", placeholder: "1", help: "100 if the gateway sends cents/paisa" },
      { key: "paidValues", label: "Paid status values", type: "text", placeholder: "paid,success,completed" },
      { key: "failedValues", label: "Failed status values", type: "text", placeholder: "failed,declined" },
      { key: "cancelledValues", label: "Cancelled status values", type: "text", placeholder: "cancelled,expired" },
      { key: "webhookResponseType", label: "Webhook reply type", type: "select", options: ["json", "text"] },
      { key: "webhookResponse", label: "Webhook reply body", type: "textarea", placeholder: '{"status":"ok"}  or  OK' },
    ],
  },
  { title: "5 · Webhook signature", showIf: ["verifyMode", ["signature", ""]], fields: verifySig("sig") },
  {
    title: "5 · Verification API (re-query)",
    showIf: ["verifyMode", ["requery"]],
    description: "Available variables: {{reference}}, {{provider_ref}}, {{body.*}}, {{query.*}}, {{secret.*}}",
    fields: [
      { key: "requeryMethod", label: "HTTP method", type: "select", options: ["GET", "POST"] },
      { key: "requeryContentType", label: "Body format", type: "select", options: ["form", "json"] },
      { key: "requeryUrl", label: "Verify URL", type: "text", full: true, placeholder: "https://api.gateway.com/v1/payments/{{provider_ref}}" },
      { key: "requeryHeaders", label: "Headers", type: "textarea", full: true, placeholder: "Authorization: Bearer {{secret.API_KEY}}" },
      { key: "requeryBody", label: "Body / params", type: "textarea", full: true },
      { key: "rqRefPath", label: "Reference path in response", type: "text" },
      { key: "rqStatusPath", label: "Status path in response", type: "text" },
      { key: "rqAmountPath", label: "Amount path in response", type: "text" },
      { key: "rqCurrencyPath", label: "Currency path in response", type: "text" },
      { key: "rqIdPath", label: "Transaction ID path in response", type: "text" },
    ],
  },
];

export const GAME_SECTIONS: ISection[] = [
  {
    title: "Game catalog import & field mapping",
    description: "Optional. Catalog requests run server-side. Keep authentication values in Secrets and reference them from headers as {{secret.NAME}}.",
    fields: [
      { key: "catalogUrl", label: "Games endpoint", type: "text", full: true, placeholder: "https://api.provider.com/v1/games" },
      { key: "catalogMode", label: "Catalog environment", type: "select", options: ["sandbox", "live"] },
      { key: "catalogSandboxUrl", label: "Sandbox / test games endpoint", type: "text", placeholder: "https://sandbox.provider.com/v1/games" },
      { key: "catalogLiveUrl", label: "Live games endpoint", type: "text", placeholder: "https://api.provider.com/v1/games" },
      { key: "catalogSandboxCredentialSecret", label: "Sandbox API key secret name", type: "text", placeholder: "SANDBOX_API_KEY" },
      { key: "catalogLiveCredentialSecret", label: "Live API key secret name", type: "text", placeholder: "LIVE_API_KEY" },
      { key: "catalogMethod", label: "HTTP method", type: "select", options: ["GET", "POST"] },
      { key: "catalogContentType", label: "Body format", type: "select", options: ["json", "form"] },
      { key: "catalogHeaders", label: "Headers", type: "textarea", full: true, placeholder: "Authorization: Bearer {{secret.API_KEY}}" },
      { key: "catalogBody", label: "Request body / query", type: "textarea", full: true, placeholder: "{}" },
      { key: "catalogGamesPath", label: "Games array path", type: "text", placeholder: "data.games" },
      { key: "catalogFieldGameId", label: "Game ID field", type: "text", placeholder: "game_id" },
      { key: "catalogFieldName", label: "Game name field", type: "text", placeholder: "title" },
      { key: "catalogFieldProviderCode", label: "Provider code / ID field", type: "text", placeholder: "vendor_code" },
      { key: "catalogFieldProvider", label: "Provider name field", type: "text", placeholder: "vendor" },
      { key: "catalogFieldThumbnail", label: "Thumbnail field", type: "text", placeholder: "image_url" },
      { key: "catalogFieldLaunchUrl", label: "Launch URL field (metadata)", type: "text", placeholder: "launch_url" },
      { key: "catalogFieldDemoUrl", label: "Demo URL field (metadata)", type: "text", placeholder: "demo_url" },
      { key: "catalogFieldRtp", label: "RTP field", type: "text", placeholder: "rtp" },
      { key: "catalogFieldGameType", label: "Game type field", type: "text", placeholder: "game_type" },
      { key: "catalogFieldCurrency", label: "Currency field", type: "text", placeholder: "currency" },
      { key: "catalogFieldStatus", label: "Remote status field (new games only)", type: "text", placeholder: "status" },
    ],
  },
  {
    title: "1 · Game launch",
    fields: [
      { key: "launchMode", label: "Launch type", type: "select", options: ["api", "url_template"], help: "api = call the provider's launch API · url_template = build the game URL directly" },
      { key: "display", label: "Open game as", type: "select", options: ["iframe", "redirect"] },
      { key: "launchUrl", label: "Launch URL (API endpoint or game URL template)", type: "text", full: true },
      { key: "demoUrl", label: "Demo URL (optional)", type: "text", full: true, help: "Used for Demo play; empty = same as launch URL with {{mode}}=demo" },
      { key: "launchMethod", label: "HTTP method", type: "select", options: ["POST", "GET"] },
      { key: "launchContentType", label: "Body format", type: "select", options: ["json", "form"] },
      { key: "launchHeaders", label: "Headers", type: "textarea", full: true, placeholder: "Authorization: Bearer {{secret.API_KEY}}" },
      { key: "launchBody", label: "Body template", type: "textarea", full: true },
      { key: "launchUrlPath", label: "Game URL path in response", type: "text", placeholder: "data.url" },
      { key: "launchErrorPath", label: "Error message path", type: "text", placeholder: "message" },
    ],
  },
  requestSigning(),
  {
    title: "2 · Wallet callback security",
    description: "The provider calls https://YOUR-DOMAIN/api/games/callback/{code} for balance / bet / win / rollback.",
    fields: [{ key: "cbSigMode", label: "Authentication", type: "select", options: ["signature", "header_token", "none"], help: "header_token = compare a header (e.g. Authorization) to a secret · none is NOT recommended" }, ...verifySig("cbSig")],
  },
  {
    title: "3 · Callback field mapping",
    fields: [
      { key: "cbActionPath", label: "Action field", type: "text", placeholder: "action" },
      { key: "cbTokenPath", label: "Session token field", type: "text", placeholder: "token" },
      { key: "cbUserPath", label: "Player ID field", type: "text", placeholder: "player_id" },
      { key: "cbAmountPath", label: "Amount field", type: "text", placeholder: "amount" },
      { key: "cbRoundPath", label: "Round ID field", type: "text", placeholder: "round_id" },
      { key: "cbTxPath", label: "Transaction ID field", type: "text", placeholder: "transaction_id" },
      { key: "cbGamePath", label: "Game ID field", type: "text", placeholder: "game_id" },
      { key: "amountDivisor", label: "Amount divisor", type: "number", placeholder: "1", help: "100 if amounts are sent in cents" },
      { key: "actionAuth", label: "Authenticate action values", type: "text", placeholder: "authenticate,auth" },
      { key: "actionBalance", label: "Balance action values", type: "text", placeholder: "balance" },
      { key: "actionBet", label: "Bet/debit action values", type: "text", placeholder: "bet,debit" },
      { key: "actionWin", label: "Win/credit action values", type: "text", placeholder: "win,credit" },
      { key: "actionRollback", label: "Rollback action values", type: "text", placeholder: "rollback,refund,cancel" },
    ],
  },
  {
    title: "4 · Callback responses",
    description: "Variables: {{balance}} {{balance_main}} {{balance_bonus}} {{currency}} {{transaction_id}} {{player_id}} {{player_name}} {{error_code}} {{message}} {{request.*}}",
    fields: [
      { key: "responseOk", label: "Success response", type: "textarea", full: true },
      { key: "responseError", label: "Error response", type: "textarea", full: true },
      { key: "errorHttpStatus", label: "Error HTTP status", type: "number", placeholder: "200", help: "Many providers require 200 for every reply. Empty = 400/401/404" },
      { key: "balanceMultiplier", label: "Balance multiplier", type: "number", placeholder: "1", help: "100 to send balance in cents" },
      { key: "errorCodes", label: "Error code mapping (OUR=THEIRS per line)", type: "textarea", full: true, placeholder: "INSUFFICIENT_FUNDS=1006\nINVALID_TOKEN=1001\nPLAYER_NOT_FOUND=1002\nPLAYER_BLOCKED=1003\nINVALID_SIGNATURE=1004\nBAD_REQUEST=1000\nERROR=9999" },
    ],
  },
];

export const VARIABLES: Record<IntegrationKind, [string, string][]> = {
  payment: [
    ["reference", "Our deposit reference (DEP-…)"],
    ["deposit_id", "Internal deposit UUID"],
    ["amount", "Amount in gateway currency, e.g. 1300.00"],
    ["amount_cents", "Amount × 100 as integer"],
    ["amount_int", "Rounded whole amount"],
    ["currency", "Gateway currency"],
    ["site_amount / site_currency", "Original wallet amount/currency"],
    ["description", "Wallet deposit DEP-…"],
    ["customer_name / customer_email / customer_phone / user_id", "Player details"],
    ["success_url / fail_url / cancel_url / return_url", "Where the gateway sends the player back"],
    ["webhook_url", "Server notification URL"],
    ["site_url", "Your site base URL"],
    ["signature", "Result of the outgoing request signature"],
    ["timestamp / timestamp_ms / iso_time / nonce", "Time & random helpers"],
    ["secret.NAME", "A secret you saved below"],
    ["body.* / query.* / headers.*", "Incoming webhook data (signature templates & verify API)"],
  ],
  game: [
    ["game_id", "Provider game ID (Integration reference) or slug"],
    ["game_slug / game_name / provider", "Game info"],
    ["game_launch_url / game_demo_url", "Mapped per-game launch and demo URLs from the catalog, when provided"],
    ["mode / demo / real", "real|demo · true|false"],
    ["player_id / player_name / player_email", "Player (empty in demo)"],
    ["currency / language", "Player currency & language"],
    ["token", "Signed session token (the provider sends it back in callbacks)"],
    ["device / platform", "desktop|mobile"],
    ["lobby_url", "Return-to-lobby URL"],
    ["callback_url", "Your wallet callback URL for this integration"],
    ["ip", "Player IP"],
    ["signature", "Result of the outgoing request signature"],
    ["timestamp / timestamp_ms / iso_time / nonce", "Time & random helpers"],
    ["secret.NAME", "A secret you saved below"],
  ],
};

type Preset = { id: string; kind: IntegrationKind; name: string; description: string; secrets: string[]; config: Record<string, string> };

const J = (o: unknown) => JSON.stringify(o, null, 2);
const L = (...l: string[]) => l.join("\n");

export const PRESETS: Preset[] = [
  {
    id: "pay-json-hmac",
    kind: "payment",
    name: "JSON API + HMAC webhook (most modern gateways)",
    description: "Server creates a payment via JSON API, gateway sends a signed webhook.",
    secrets: ["API_KEY", "MERCHANT_ID", "WEBHOOK_SECRET"],
    config: {
      createMode: "api", createMethod: "POST", createContentType: "json", createUrl: "https://api.gateway.com/v1/payments",
      createHeaders: "Authorization: Bearer {{secret.API_KEY}}",
      createBody: L("{", '  "merchant_id": "{{secret.MERCHANT_ID}}",', '  "order_id": "{{reference}}",', '  "amount": "{{amount}}",', '  "currency": "{{currency}}",', '  "description": "{{description}}",', '  "customer": { "name": "{{customer_name}}", "email": "{{customer_email}}", "phone": "{{customer_phone}}" },', '  "success_url": "{{success_url}}",', '  "cancel_url": "{{cancel_url}}",', '  "callback_url": "{{webhook_url}}"', "}"),
      responseUrlPath: "data.payment_url", responseIdPath: "data.id", responseErrorPath: "message",
      reqSigAlgo: "none", reqSigPayload: "body", reqSigEncoding: "hex",
      verifyMode: "signature", sigSource: "header", sigHeader: "x-signature", sigAlgo: "hmac-sha256", sigEncoding: "hex", sigPayload: "raw", sigSecret: "WEBHOOK_SECRET",
      whRefPath: "order_id", whStatusPath: "status", whAmountPath: "amount", whCurrencyPath: "currency", whIdPath: "id", amountDivisor: "1",
      paidValues: "paid,success,completed", failedValues: "failed,declined", cancelledValues: "cancelled,expired",
      webhookResponseType: "json", webhookResponse: '{"status":"ok"}',
    },
  },
  {
    id: "pay-form-requery",
    kind: "payment",
    name: "Form API + verification API (aamarPay / SSLCommerz style)",
    description: "Form-encoded create request; every result is confirmed by calling the gateway's verify API.",
    secrets: ["STORE_ID", "SIGNATURE_KEY"],
    config: {
      createMode: "api", createMethod: "POST", createContentType: "form", createUrl: "https://sandbox.gateway.com/jsonpost.php",
      createBody: L("store_id={{secret.STORE_ID}}", "signature_key={{secret.SIGNATURE_KEY}}", "tran_id={{reference}}", "amount={{amount}}", "currency={{currency}}", "desc={{description}}", "cus_name={{customer_name}}", "cus_email={{customer_email}}", "cus_phone={{customer_phone}}", "success_url={{success_url}}", "fail_url={{fail_url}}", "cancel_url={{cancel_url}}", "type=json"),
      responseUrlPath: "payment_url", responseErrorPath: "message", currency: "BDT",
      reqSigAlgo: "none",
      verifyMode: "requery", requeryMethod: "GET", requeryContentType: "form", requeryUrl: "https://sandbox.gateway.com/api/v1/trxcheck/request.php",
      requeryBody: L("request_id={{reference}}", "store_id={{secret.STORE_ID}}", "signature_key={{secret.SIGNATURE_KEY}}", "type=json"),
      whRefPath: "mer_txnid", whIdPath: "pg_txnid", rqRefPath: "mer_txnid", rqStatusPath: "pay_status", rqAmountPath: "amount_original", rqCurrencyPath: "currency", rqIdPath: "pg_txnid",
      paidValues: "successful,success", failedValues: "failed", cancelledValues: "cancelled", webhookResponseType: "text", webhookResponse: "OK",
    },
  },
  {
    id: "pay-form-post-md5",
    kind: "payment",
    name: "Hosted form POST + MD5 signature (classic PSP)",
    description: "The player's browser posts a signed form to the gateway; the gateway posts back a signed notification.",
    secrets: ["MERCHANT_ID", "SECRET_KEY"],
    config: {
      createMode: "form_post", createMethod: "POST", createContentType: "form", createUrl: "https://checkout.gateway.com/pay",
      createBody: L("merchant={{secret.MERCHANT_ID}}", "order={{reference}}", "amount={{amount}}", "currency={{currency}}", "email={{customer_email}}", "return_url={{success_url}}", "cancel_url={{cancel_url}}", "notify_url={{webhook_url}}", "sign={{signature}}"),
      reqSigAlgo: "md5", reqSigPayload: "template", reqSigEncoding: "hex", reqSigTemplate: "{{secret.MERCHANT_ID}}|{{reference}}|{{amount}}|{{currency}}|{{secret.SECRET_KEY}}",
      verifyMode: "signature", sigSource: "field", sigField: "sign", sigAlgo: "md5", sigEncoding: "hex", sigPayload: "template",
      sigTemplate: "{{body.merchant}}|{{body.order}}|{{body.amount}}|{{body.currency}}|{{body.status}}|{{secret.SECRET_KEY}}",
      whRefPath: "order", whStatusPath: "status", whAmountPath: "amount", whCurrencyPath: "currency", whIdPath: "txn_id",
      paidValues: "paid,success,1", failedValues: "failed,0", cancelledValues: "cancelled", webhookResponseType: "text", webhookResponse: "OK",
    },
  },
  {
    id: "game-seamless-json",
    kind: "game",
    name: "Seamless wallet aggregator (JSON launch API)",
    description: "Launch through a JSON API; provider calls your wallet for balance/bet/win/rollback with an HMAC signature.",
    secrets: ["API_KEY", "API_SECRET", "OPERATOR_ID", "CALLBACK_SECRET"],
    config: {
      launchMode: "api", display: "iframe", launchMethod: "POST", launchContentType: "json", launchUrl: "https://api.aggregator.com/v1/game/launch",
      launchHeaders: "Authorization: Bearer {{secret.API_KEY}}",
      launchBody: J({ operator_id: "{{secret.OPERATOR_ID}}", game_id: "{{game_id}}", player_id: "{{player_id}}", player_name: "{{player_name}}", currency: "{{currency}}", language: "{{language|lower}}", session_token: "{{token}}", mode: "{{mode}}", platform: "{{device}}", lobby_url: "{{lobby_url}}", callback_url: "{{callback_url}}" }),
      launchUrlPath: "url", launchErrorPath: "message",
      reqSigAlgo: "hmac-sha256", reqSigPayload: "body", reqSigSecret: "API_SECRET", reqSigEncoding: "hex", reqSigHeader: "X-Signature",
      cbSigMode: "signature", cbSigSource: "header", cbSigHeader: "x-signature", cbSigAlgo: "hmac-sha256", cbSigEncoding: "hex", cbSigPayload: "raw", cbSigSecret: "CALLBACK_SECRET",
      cbActionPath: "action", cbTokenPath: "session_token", cbUserPath: "player_id", cbAmountPath: "amount", cbRoundPath: "round_id", cbTxPath: "transaction_id", cbGamePath: "game_id", amountDivisor: "1",
      actionAuth: "authenticate,auth,init", actionBalance: "balance,getbalance", actionBet: "bet,debit,withdraw", actionWin: "win,credit,deposit,payout", actionRollback: "rollback,refund,cancel",
      responseOk: '{"status":"OK","balance":{{balance}},"currency":"{{currency}}","transaction_id":"{{transaction_id}}","player_id":"{{player_id}}"}',
      responseError: '{"status":"ERROR","error_code":"{{error_code}}","message":"{{message}}"}',
      errorHttpStatus: "200", balanceMultiplier: "1",
      errorCodes: L("INSUFFICIENT_FUNDS=INSUFFICIENT_FUNDS", "INVALID_TOKEN=INVALID_TOKEN", "PLAYER_NOT_FOUND=PLAYER_NOT_FOUND", "PLAYER_BLOCKED=PLAYER_BLOCKED", "INVALID_SIGNATURE=INVALID_SIGNATURE", "BAD_REQUEST=BAD_REQUEST", "ERROR=ERROR"),
    },
  },
  {
    id: "game-url-template",
    kind: "game",
    name: "Direct URL template (iframe) + cents wallet",
    description: "Game URL built from a template (no launch API). Wallet amounts in cents.",
    secrets: ["OPERATOR_ID", "CALLBACK_SECRET"],
    config: {
      launchMode: "url_template", display: "iframe",
      launchUrl: "https://games.provider.com/launch?operator={{secret.OPERATOR_ID}}&game={{game_id}}&token={{token}}&currency={{currency}}&lang={{language|lower}}&mode={{mode}}&lobby={{lobby_url|url}}",
      reqSigAlgo: "none",
      cbSigMode: "signature", cbSigSource: "header", cbSigHeader: "x-hash", cbSigAlgo: "hmac-sha256", cbSigEncoding: "hex", cbSigPayload: "raw", cbSigSecret: "CALLBACK_SECRET",
      cbActionPath: "type", cbTokenPath: "token", cbUserPath: "playerId", cbAmountPath: "amount", cbRoundPath: "roundId", cbTxPath: "txId", cbGamePath: "gameId", amountDivisor: "100",
      actionAuth: "auth", actionBalance: "balance", actionBet: "debit", actionWin: "credit", actionRollback: "rollback",
      responseOk: '{"success":true,"balance":{{balance}},"currency":"{{currency}}","txId":"{{transaction_id}}"}',
      responseError: '{"success":false,"code":"{{error_code}}","message":"{{message}}"}',
      errorHttpStatus: "200", balanceMultiplier: "100",
    },
  },
];
