# Aggregator.gg integration

This document records the current implementation and the published Aggregator.gg API contract reviewed on 2026-10-01. The integration uses the existing PlayLounge providers/games, account authentication, wallets, ledger transactions, favorites/recent-play tables, admin permissions, and database migration runner.

## Official contract and field inventory

| Prompt item | Current documented behavior |
|---|---|
| A. API base URL | Production base URL is `https://api.aggregator.gg/v1`. Operators integrate against the production API; account/key authorization controls access. |
| B. Authentication | Backend requests use `Authorization: Bearer <API key>`. |
| C. API key | Issued by Aggregator for the operator/integration. Keep server-side. The docs do not define a key prefix as a mode switch. |
| D. Games endpoint | `GET /games`; paginates with `page` and `per_page` (maximum 200). Documented filters include `search`, `provider`, `provider_game_id`, `type`, `volatility`, `rtp_min`, `rtp_max`, `features`, and `currency`. The docs do not define a category query parameter, so category filtering is local. |
| E. Game ID | Catalog `id` is the Aggregator `game_id` for session creation. It is stored in `games.aggregator_game_id`; it is distinct from `provider_game_id`. |
| F. Provider game ID | `provider_game_id` identifies the game within its provider. Do not pass it as session `game_id`. |
| G. Provider code | `provider_code`; provider registry is `GET /providers/registry`. |
| H. Game name | `name`. Provider registry supplies a code/registration metadata, not a guaranteed display name; synced provider display name therefore uses the provider code. |
| I. Category/type | Catalog fields `category` and `game_type`. Local PlayLounge categories are stored in `categories`/`game_categories` and are not overwritten by sync. |
| J. RTP | `rtp` where supplied. |
| K. Volatility | `volatility` where supplied. |
| L. Image | `thumbnail_url` where supplied. |
| M. Demo | `has_demo`; demo session endpoint is `POST /demo-sessions`. |
| N. Device support | `has_mobile`, `has_desktop`. |
| O. Free rounds | `free_rounds_support` where supplied. |
| P. Country blocks | `blocked_countries`. Session launch rejects a matching country. |
| Q. Currencies | `supported_currencies` on games and provider registry. A real session must match the player's wallet currency when a game lists supported currencies. |
| Other metadata | The API response is retained as JSON in `games.aggregator_metadata`; provider registry response is retained in `providers.aggregator_metadata`. Catalog also documents brand, features, release date, certified markets and bet limits when available. |
| R. Real session | `POST /sessions`. |
| S. Session input | Requires `game_id`, `player_id`, integer `balance` in minor units, ISO-4217 `currency`, ISO-3166-1 alpha-2 `country`; optional `lang` and `return_url`. Send a fresh `Idempotency-Key` header. |
| T. Session response | Includes `session_id` and `game_url`. The current adapter accepts the documented response and returns its URL to the caller. |
| U. URL behavior | `game_url` is a single-use/short-lived session URL. It is returned to the browser only after the server creates a new session and is not stored in the catalog or session mapping. |
| V. Player ID | Real sessions use the authenticated local user UUID as `player_id`. The session ID + Aggregator player ID maps callbacks back to the same local user. |
| W. Country | Valid two-letter uppercase country code from the user's profile, falling back to `GAME_DEFAULT_COUNTRY` (`BD` in `.env.example`). |
| X. Currency | Existing wallet currency, falling back to `GAME_DEFAULT_CURRENCY` where no player wallet is available. Real wallet callbacks must match the wallet currency. |
| Y. Callback URL | Configure `https://<your-domain>/api/aggregator/callback`; the prior `/api/games/callback` route remains available and both call the same handler. |
| Z. Callback payload | The published wallet callback contract uses JSON with `transaction_type`, `transaction_id`, `player_id`, `provider_code`, `round_id`, `amount`, and currency/game/session context fields. The implementation accepts the existing integration's documented `currency`, optional `session_id`, `game`/`game_id`, `is_free`, and refund original reference fields. |
| AA. BET | `transaction_type: "bet"`; debit from the existing main/bonus wallet ledger. |
| AB. WIN | `transaction_type: "win"`; credit the existing wallet ledger. |
| AC. REFUND | `transaction_type: "refund"`; reverse the original recorded bet through the existing rollback engine. |
| AD. Transaction ID | `transaction_id`; idempotency is scoped by provider code and action in the existing ledger's external reference. Duplicate results replay the saved callback balance. |
| AE. Round ID | `round_id`; used to associate wins/refunds with bets. |
| AF. Session ID | `session_id`; session mapping resolves the Aggregator player to a local user. |
| AG. Amount | Integer in the ISO-4217 minor unit: 2-decimal currencies use ×100, 0-decimal currencies use ×1, and 3-decimal currencies use ×1000. This project's numeric(18,2) wallet supports 0/2 decimal currencies; 3-decimal currencies are rejected until the wallet schema supports them. |
| AH. Balance response | Successful wallet reply includes integer `balance` in minor units plus ISO currency and player ID. |
| AI. Signature header | `X-SIGNATURE`. |
| AJ. Signature | HMAC-SHA256 over the exact raw body bytes, using `AGGREGATOR_CALLBACK_SECRET`; compare timing-safely before parsing/processing transactions. |
| AK. Idempotency | Real session creation requires `Idempotency-Key`. Wallet callbacks use a transaction identity scoped to provider/action and return the stored reply for duplicates. |
| AL. Errors | The docs describe HTTP/API error responses; wallet integration handles invalid signature (401), unknown player (404), invalid request/currency, insufficient funds (402), and duplicate callbacks. Error body details can be account/version-specific; do not infer unpublished codes. |
| AM. Test/demo | `POST /demo-sessions` creates a no-wallet demo session. Test/live authorization is determined by Aggregator's issued key/account/deployment policy; `AGGREGATOR_MODE` is a local label and does not switch the remote environment by itself. The API may report mode in `X-API-Mode`. |
| AN. Live | Use the production API URL and the production-authorized key after Aggregator enables the account. |
| AO. Go-live | Obtain the appropriate Aggregator account/key and complete their operator approval/configuration. Public docs reviewed here do not expose account-specific go-live checklist details. |
| AP. Provider restrictions | Provider registration/availability is returned by `/providers/registry`, including currency and blocked-country metadata. |
| AQ. Game restrictions | Enforce game blocked countries, supported currencies, mobile/desktop/demo availability and local active status before launch. Any additional per-account restriction is returned by Aggregator when a session is requested. |

## Sources

- [Authentication](https://docs.aggregator.gg/get-started/authentication/)
- [Environments](https://docs.aggregator.gg/get-started/environments/)
- [Games API](https://docs.aggregator.gg/api/v1/operations/listgames/)
- [Provider registry](https://docs.aggregator.gg/api/v1/operations/listproviderregistry/)
- [Create session](https://docs.aggregator.gg/api/v1/operations/createsession/)
- [Create demo session](https://docs.aggregator.gg/api/v1/operations/createdemosession/)
- [Wallet callbacks](https://docs.aggregator.gg/guides/wallet-callbacks/)
- [Round workflow](https://docs.aggregator.gg/get-started/how-a-round-works/)

If Aggregator changes a documented request/response schema, use their live account's current documentation as authoritative. Account-specific keys, mode, provider entitlements, and production approval cannot be confirmed from this repository.

## Local routes and admin

- Admin → Games → Aggregator.gg: test credentials and sync the catalog. The admin API never returns the key or callback secret.
- `POST /api/casino/launch` accepts `{ "gameId": "<aggregator catalog id>", "device": "desktop" }` and requires the real authenticated player.
- `POST /api/casino/demo` accepts the same game ID and creates a no-wallet demo session for demo-enabled games.
- `POST /api/aggregator/callback` is the recommended configured callback URL. `/api/games/callback` remains a compatible route to the same handler.
- A catalog sync fetches all pages before updating records, upserts by Aggregator game ID, retains raw metadata and local category/editorial fields, and only deactivates missing entries after a complete successful read without per-record failures.

## Environment

Set these as server-only deployment variables:

```dotenv
AGGREGATOR_API_URL=https://api.aggregator.gg/v1
AGGREGATOR_API_KEY=<issued Aggregator API key>
AGGREGATOR_CALLBACK_SECRET=<issued callback/webhook secret>
AGGREGATOR_MODE=test
GAME_DEFAULT_COUNTRY=BD
GAME_DEFAULT_CURRENCY=EUR
```

`AGGREGATOR_MODE` is descriptive; setting it to `test` does not convert a production key into a sandbox key. Never use `NEXT_PUBLIC_` for credentials. For live operations, use the live-authorized key and set the label to `live` after Aggregator confirms production enablement.

## Database and current limitations

Migration `0002_aggregator_catalog.sql` adds catalog metadata to the existing `providers` and `games` tables. `0001_aggregator_game_sessions.sql` already provides callback identity mapping. Wallet movements and duplicate protection use the existing `wallets` and `transactions` tables.

The pre-existing PlayLounge category editor, favorites, recently-played tracking, and ledger admin/player views remain the source for those features. A dedicated Aggregator transaction admin screen, editable credential form, and per-game category assignment UX are not added here: those require additional product screens beyond the existing resource manager. Keep credentials in Render environment configuration so users and browsers cannot retrieve them.

The app stores money at two decimal places. Aggregator amounts use the ISO currency minor-unit exponent. Zero-decimal currency amounts are handled at ×1; two-decimal currencies at ×100. Three-decimal currencies are rejected for real play/callback settlement until the existing wallet schema is widened and its finance arithmetic updated. Verify currency entitlements with Aggregator before go-live.
