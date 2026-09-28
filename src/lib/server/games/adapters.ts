import "server-only";
import { createHmac } from "crypto";
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

const REGISTRY: Record<string, GameAdapter> = {
  [directAdapter.code]: directAdapter,
  [aggregatorAdapter.code]: aggregatorAdapter,
  // mycustomprovider: myCustomAdapter,
};

export const getGameAdapter = (code?: string | null) => REGISTRY[code || env("GAME_DEFAULT_ADAPTER") || "direct"] ?? directAdapter;
export const GAME_ADAPTER_CODES = Object.keys(REGISTRY);

/** Built-in adapter for a provider's adapter code (null code → default). Unknown codes return undefined (custom integration). */
export function findBuiltinGameAdapter(code?: string | null): GameAdapter | undefined {
  if (!code) return getGameAdapter(null);
  return REGISTRY[code];
}
