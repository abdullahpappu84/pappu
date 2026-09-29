import "server-only";
import { createHash, createHmac } from "crypto";
import type { games } from "@/db/schema";
import { conflict } from "../http";

/**
 * ============================================================================
 *  GAME PROVIDER ADAPTERS
 * ============================================================================
 *  To connect a game provider / aggregator:
 *   1. Put the credentials in .env (NEVER in frontend code or the database):
 *        GAME_API_URL, GAME_API_KEY, GAME_API_SECRET, GAME_OPERATOR_ID, GAME_CALLBACK_SECRET
 *   2. Admin → Games → Providers → set "Integration adapter" (direct / aggregator / your custom one)
 *   3. Admin → Games → set each game's "Integration reference" (the provider's game ID)
 *      or "Game URL" (for direct iframe providers)
 *   4. Give the provider your wallet callback URL:  https://YOUR-DOMAIN/api/games/callback
 *
 *  If your provider's API differs, copy `aggregatorAdapter`, adjust the request/response
 *  mapping, and add it to REGISTRY below.
 * ============================================================================
 */

export type GameRow = typeof games.$inferSelect;

export interface LaunchInput {
  game: GameRow;
  providerSlug: string | null;
  mode: "real" | "demo";
  user: { id: string; name: string; email: string; currency: string } | null;
  /** Signed, short-lived session token. The provider sends it back in wallet callbacks. */
  token: string | null;
  language: string;
  device: "desktop" | "mobile";
  lobbyUrl: string;
  ip: string;
}

export interface LaunchResult {
  url: string;
  /** iframe = open inside our GamePlayer · redirect = provider forbids iframes */
  display: "iframe" | "redirect";
  /** Providers with play-money credentials can force the player UI to show demo mode. */
  mode?: "real" | "demo";
}

export interface GameAdapter {
  code: string;
  label: string;
  launch(input: LaunchInput): Promise<LaunchResult>;
}

const env = (k: string) => process.env[k]?.trim() || undefined;

/** 1) DIRECT — provider gives a launch URL per game (set in Admin → Games → Game URL). */
const directAdapter: GameAdapter = {
  code: "direct",
  label: "Direct URL (iframe)",
  async launch(i) {
    if (!i.game.gameUrl) throw conflict(`${i.game.name} has no Game URL configured yet.`);
    const url = new URL(i.game.gameUrl);
    const params: Record<string, string | undefined> = {
      token: i.token ?? undefined,
      mode: i.mode,
      lang: i.language.toLowerCase(),
      currency: i.user?.currency,
      operator: env("GAME_OPERATOR_ID"),
      lobby: i.lobbyUrl,
      device: i.device,
      game: i.game.integrationRef ?? i.game.slug,
    };
    for (const [k, v] of Object.entries(params)) if (v && !url.searchParams.has(k)) url.searchParams.set(k, v);
    return { url: url.toString(), display: "iframe" };
  },
};

/** 2) AGGREGATOR — generic REST launch API authenticated with an API key (+ optional HMAC signature). */
const aggregatorAdapter: GameAdapter = {
  code: "aggregator",
  label: "Aggregator API (API key)",
  async launch(i) {
    const base = env("GAME_API_URL");
    const key = env("GAME_API_KEY");
    if (!base || !key) throw conflict("Game provider API is not configured (GAME_API_URL / GAME_API_KEY).");
    if (!i.game.integrationRef) throw conflict(`${i.game.name} has no provider game ID (Integration reference).`);

    const body = JSON.stringify({
      operatorId: env("GAME_OPERATOR_ID"),
      gameId: i.game.integrationRef,
      provider: i.providerSlug,
      mode: i.mode, // "real" | "demo"
      playerId: i.user?.id,
      playerName: i.user?.name,
      currency: i.user?.currency ?? env("GAME_DEFAULT_CURRENCY") ?? "EUR",
      language: i.language.toLowerCase(),
      token: i.token,
      device: i.device,
      lobbyUrl: i.lobbyUrl,
      ip: i.ip,
    });


    const headers: Record<string, string> = { "Content-Type": "application/json", Authorization: `Bearer ${key}` };
    const secret = env("GAME_API_SECRET");
    if (secret) headers["X-Signature"] = createHmac("sha256", secret).update(body).digest("hex");

    const path = i.mode === "demo" ? env("GAME_DEMO_PATH") ?? "/games/demo" : env("GAME_LAUNCH_PATH") ?? "/games/launch";
    let res: Response;
    try {
      res = await fetch(`${base.replace(/\/$/, "")}${path}`, { method: "POST", headers, body, signal: AbortSignal.timeout(12000), cache: "no-store" });
    } catch (e) {
      console.error("[games] provider unreachable", e);
      throw conflict("Game provider is not reachable. Please try again shortly.");
    }
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & { data?: Record<string, unknown> };
    const url = (data.url ?? data.gameUrl ?? data.launchUrl ?? data.link ?? data.data?.url ?? data.data?.gameUrl) as string | undefined;
    if (!res.ok || !url) {
      console.error("[games] launch failed", res.status, data);
      throw conflict((data.message as string) || (data.error as string) || "The game could not be launched.");
    }
    return { url, display: env("GAME_DISPLAY") === "redirect" ? "redirect" : "iframe" };
  },
};
const casinoApiProAdapter: GameAdapter = {
  code: "casino_api_pro",
  label: "Casino API Pro",

  async launch(i) {
    const base =
      env("CASINOAPIPRO_BASE_URL") ||
      env("CASINO_API_URL") ||
      "https://api.casinoapipro.com/v1";

    const apiKey = env("CASINOAPIPRO_API_KEY") || env("CASINO_API_KEY");
    const apiSecret = env("CASINOAPIPRO_API_SECRET") || env("CASINO_API_SECRET");

    if (!apiKey || !apiSecret) {
      throw conflict(
        "Casino API Pro is not configured."
      );
    }

    if (!i.game.integrationRef) {
      throw conflict(
        `${i.game.name} has no Casino API Pro game ID.`
      );
    }

    // Get access token
    let tokenResponse: Response;

    try {
      tokenResponse = await fetch(
        `${base}/auth/token`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            api_key: apiKey,
            api_secret: apiSecret,
          }),
          cache: "no-store",
        }
      );
    } catch (error) {
      console.error(
        "[casino_api_pro] token request failed",
        error
      );

      throw conflict(
        "Casino API Pro is not reachable."
      );
    }

    const tokenData =
      (await tokenResponse
        .json()
        .catch(() => ({}))) as Record<string, unknown>;

    if (!tokenResponse.ok) {
      console.error(
        "[casino_api_pro] token error",
        tokenResponse.status,
        tokenData
      );

      throw conflict(
        String(
          tokenData.message ||
          tokenData.error ||
          "Casino API Pro authentication failed."
        )
      );
    }

    const tokenObject =
      tokenData.data as
        | Record<string, unknown>
        | undefined;

    const accessToken = String(
      tokenData.access_token ||
      tokenObject?.access_token ||
      ""
    );

    if (!accessToken) {
      throw conflict(
        "Casino API Pro did not return an access token."
      );
    }

    const playerId = i.user?.id ?? `demo_${createHash("sha256").update(i.ip).digest("hex").slice(0, 24)}`;
    const currency = env("CASINOAPIPRO_CURRENCY") || "USD";

    // The sandbox wallet needs a play-money player before the first session.
    // Look it up first so reopening a game never tops up the player again.
    if (apiKey.startsWith("ck_test_")) {
      const playerUrl = `${base}/players/${encodeURIComponent(playerId)}`;
      const playerResponse = await fetch(playerUrl, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
        signal: AbortSignal.timeout(12000),
        cache: "no-store",
      }).catch(() => null);

      if (!playerResponse) throw conflict("Casino API Pro player service is not reachable.");
      if (playerResponse.status === 404) {
        const createPlayerResponse = await fetch(`${base}/sandbox/players`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ player_id: playerId, currency, balance: "1000.00" }),
          signal: AbortSignal.timeout(12000),
          cache: "no-store",
        }).catch(() => null);

        if (!createPlayerResponse) throw conflict("Casino API Pro sandbox wallet is not reachable.");
        if (!createPlayerResponse.ok) {
          const errorData = (await createPlayerResponse.json().catch(() => ({}))) as Record<string, unknown>;
          throw conflict(String(errorData.message || errorData.error || "Casino API Pro sandbox player could not be created."));
        }
      } else if (!playerResponse.ok) {
        throw conflict("Casino API Pro player lookup failed.");
      }
    }

    // Create game session
    let sessionResponse: Response;

    try {
      sessionResponse = await fetch(
        `${base}/sessions`,
        {
          method: "POST",
          headers: {
            Authorization:
              `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            game_id: i.game.integrationRef,
            player_id: playerId,
            currency,
            player_name:
              i.user?.name,
            return_url:
              i.lobbyUrl,
          }),
          cache: "no-store",
        }
      );
    } catch (error) {
      console.error(
        "[casino_api_pro] session request failed",
        error
      );

      throw conflict(
        "Casino API Pro session service is not reachable."
      );
    }

    const sessionData =
      (await sessionResponse
        .json()
        .catch(() => ({}))) as Record<string, unknown>;

    if (!sessionResponse.ok) {
      console.error(
        "[casino_api_pro] session error",
        sessionResponse.status,
        sessionData
      );

      throw conflict(
        String(
          sessionData.message ||
          sessionData.error ||
          "Casino API Pro session creation failed."
        )
      );
    }

    const sessionObject =
      sessionData.data as
        | Record<string, unknown>
        | undefined;

    const launchUrl = String(
      sessionData.launch_url ||
      sessionData.launchUrl ||
      sessionData.url ||
      sessionObject?.launch_url ||
      sessionObject?.launchUrl ||
      sessionObject?.url ||
      ""
    );

    if (
      !launchUrl ||
      !/^https?:\/\//.test(launchUrl)
    ) {
      console.error(
        "[casino_api_pro] launch URL missing",
        sessionData
      );

      throw conflict(
        "Casino API Pro did not return a valid launch URL."
      );
    }

    return {
      url: launchUrl,
      display: "iframe",
      mode: apiKey.startsWith("ck_test_") ? "demo" : i.mode,
    };
  },
};
const REGISTRY: Record<string, GameAdapter> = {
  [directAdapter.code]: directAdapter,
  [aggregatorAdapter.code]: aggregatorAdapter,
  [casinoApiProAdapter.code]: casinoApiProAdapter,
};

export const getGameAdapter = (code?: string | null) => REGISTRY[code || env("GAME_DEFAULT_ADAPTER") || "direct"] ?? directAdapter;
export const GAME_ADAPTER_CODES = Object.keys(REGISTRY);

/** Built-in adapter for a provider's adapter code (null code → default). Unknown codes return undefined (custom integration). */
export function findBuiltinGameAdapter(code?: string | null): GameAdapter | undefined {
  if (!code) return getGameAdapter(null);
  return REGISTRY[code];
}
