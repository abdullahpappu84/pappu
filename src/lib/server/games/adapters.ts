import "server-only";
import { createHash, createHmac, randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { aggregatorGameSessions, wallets, type games } from "@/db/schema";
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
  country?: string | null;
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

/** 2) The Aggregator.gg API: catalog game UUIDs and its documented session contract. */
const aggregatorAdapter: GameAdapter = {
  code: "aggregator",
  label: "Aggregator.gg",
  async launch(i) {
    const base = env("GAME_API_URL");
    const key = env("GAME_API_KEY");
    if (!base || !key) throw conflict("Game provider API is not configured (GAME_API_URL / GAME_API_KEY).");
    const aggregatorGameId = i.game.integrationRef;
    if (!aggregatorGameId || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(aggregatorGameId)) {
      throw conflict(`${i.game.name} needs The Aggregator catalog game UUID (the catalog id field), not provider_game_id.`);
    }
    const currency = (i.user?.currency ?? env("GAME_DEFAULT_CURRENCY") ?? "EUR").toUpperCase();
    const path = i.mode === "demo" ? "/demo-sessions" : "/sessions";
    const balance = i.user
      ? await (async () => {
          const [w] = await db.select().from(wallets).where(eq(wallets.userId, i.user!.id));
          return Math.round((Number(w?.mainBalance ?? 0) + Number(w?.bonusBalance ?? 0)) * 100);
        })()
      : 0;
    const country = i.country?.trim().toUpperCase();
    const alpha2 = country && /^[A-Z]{2}$/.test(country) ? country : env("GAME_DEFAULT_COUNTRY")?.toUpperCase();
    if (i.mode === "real" && !alpha2) throw conflict("Set the player's two-letter country or GAME_DEFAULT_COUNTRY for Aggregator sessions.");
    const body = JSON.stringify(i.mode === "demo" ? { game_id: aggregatorGameId } : {
      game_id: aggregatorGameId,
      player_id: i.user!.id,
      balance,
      currency,
      country: alpha2,
      lang: i.language.slice(0, 2).toLowerCase(),
      return_url: i.lobbyUrl,
    });
    const headers: Record<string, string> = { "Content-Type": "application/json", Authorization: `Bearer ${key}` };
    if (i.mode === "real") headers["Idempotency-Key"] = randomUUID();
    let res: Response;
    try {
      res = await fetch(`${base.replace(/\/$/, "")}${path}`, { method: "POST", headers, body, signal: AbortSignal.timeout(12000), cache: "no-store" });
    } catch (e) {
      console.error("[games] provider unreachable", e);
      throw conflict("Game provider is not reachable. Please try again shortly.");
    }
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } };
    const url = data.game_url as string | undefined;
    if (!res.ok || !url) {
      console.error("[games] Aggregator session failed", res.status, typeof data.error === "object" ? data.error?.message : "request rejected");
      throw conflict((typeof data.error === "object" ? data.error?.message : undefined) || "The game could not be launched.");
    }
    if (i.mode === "real") {
      const sessionId = typeof data.session_id === "string" ? data.session_id : "";
      if (!sessionId || !i.user) throw conflict("Aggregator session response is missing its session ID.");
      await db.insert(aggregatorGameSessions).values({
        aggregatorSessionId: sessionId,
        aggregatorPlayerId: i.user.id,
        userId: i.user.id,
      });
    }
    return { url, display: "redirect" };
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
