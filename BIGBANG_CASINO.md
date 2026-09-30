# BigBang Casino API

The sandbox API key and game catalog endpoint are configured in the local `.env`:

- `BIGBANG_API_URL=https://api.bigbangcasino.bet/api/v1/games`
- `BIGBANG_API_KEY` is the sandbox key and must remain server-side.

An admin with `games.edit` permission can import the provider catalog with
`POST /api/admin/bigbang/sync-games`. It creates or updates provider and game rows
using the provider name and game ID from the response. Imported games use the `bigbang`
adapter.

The launch contract posts `{ "game_id": <integrationRef>, "demo": true }` to
`/api/v1/games/launch`, authenticates with `X-API-Key`, and opens the returned
`game_url`. The adapter always launches demo games, even if a caller requests real mode.
The callback/wallet contract was not provided, so this integration is demo-only.

Use only sandbox credentials for now. The endpoint could not be reached from the
current development environment, so catalog sync and game launch have not been verified
here.
