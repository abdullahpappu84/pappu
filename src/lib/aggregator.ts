import "server-only";

export type AggregatorMode = "test" | "live";

export type AggregatorGame = {
  id: string;
  provider_game_id: string;
  provider_code: string;
  name: string;
  brand?: string | null;
  category: string;
  game_type?: string | null;
  rtp?: number | null;
  volatility?: string | null;
  has_mobile?: boolean;
  has_desktop?: boolean;
  has_demo: boolean;
  thumbnail_url?: string | null;
  free_rounds_support?: boolean;
  blocked_countries?: string[];
  certified_markets?: Record<string, unknown> | null;
  features?: string[];
  release_date?: string | null;
  supported_currencies?: string[];
  [key: string]: unknown;
};

export type AggregatorGamesPage = {
  games: AggregatorGame[];
  total: number;
  page: number;
  per_page: number;
};

export type AggregatorProvider = {
  provider_code: string;
  is_registered: boolean;
  supported_currencies: string[];
  blocked_countries: string[];
};

export class AggregatorError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "AggregatorError";
  }
}

const getMode = (): AggregatorMode => {
  const mode = process.env.AGGREGATOR_MODE?.trim().toLowerCase() || "test";
  if (mode !== "test" && mode !== "live") throw new AggregatorError("AGGREGATOR_MODE must be test or live.", 500);
  return mode;
};

export const aggregatorMode = getMode;

function configuration() {
  const baseUrl = (process.env.AGGREGATOR_API_URL?.trim() || process.env.GAME_API_URL?.trim() || "https://api.aggregator.gg/v1").replace(/\/+$/, "");
  const apiKey = process.env.AGGREGATOR_API_KEY?.trim() || process.env.GAME_API_KEY?.trim();
  if (!apiKey) throw new AggregatorError("Aggregator API is not configured (AGGREGATOR_API_KEY).", 503);
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new AggregatorError("AGGREGATOR_API_URL must be a valid HTTPS URL.", 500);
  }
  if (url.protocol !== "https:" && process.env.NODE_ENV === "production") throw new AggregatorError("Aggregator API URL must use HTTPS.", 500);
  return { baseUrl, apiKey };
}

export async function aggregatorRequest<T>(path: string, init: RequestInit = {}): Promise<{ data: T; headers: Headers }> {
  const { baseUrl, apiKey } = configuration();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${apiKey}`);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path.startsWith("/") ? path : `/${path}`}`, {
      ...init,
      headers,
      cache: "no-store",
      signal: init.signal ?? AbortSignal.timeout(15000),
    });
  } catch {
    throw new AggregatorError("Aggregator API is temporarily unreachable.", 503);
  }

  const json = (await response.json().catch(() => null)) as
    | { error?: { code?: string; message?: string; request_id?: string } }
    | T
    | null;
  if (!response.ok) {
    const error = json && typeof json === "object" && "error" in json ? json.error : undefined;
    throw new AggregatorError(
      error && typeof error === "object" && "message" in error && typeof error.message === "string"
        ? error.message
        : `Aggregator API request failed (${response.status}).`,
      response.status,
      error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : undefined,
      error && typeof error === "object" && "request_id" in error && typeof error.request_id === "string" ? error.request_id : undefined,
    );
  }
  if (!json) throw new AggregatorError("Aggregator API returned an invalid JSON response.", 502);
  return { data: json as T, headers: response.headers };
}

export async function listAggregatorGames(params: { page?: number; per_page?: number; search?: string; provider?: string; provider_game_id?: string; type?: string; volatility?: string; rtp_min?: number; rtp_max?: number; features?: string[]; currency?: string } = {}) {
  const query = new URLSearchParams();
  query.set("page", String(params.page ?? 1));
  query.set("per_page", String(params.per_page ?? 200));
  if (params.search) query.set("search", params.search);
  if (params.provider) query.set("provider", params.provider);
  if (params.provider_game_id) query.set("provider_game_id", params.provider_game_id);
  if (params.type) query.set("type", params.type);
  if (params.volatility) query.set("volatility", params.volatility);
  if (params.rtp_min !== undefined) query.set("rtp_min", String(params.rtp_min));
  if (params.rtp_max !== undefined) query.set("rtp_max", String(params.rtp_max));
  if (params.features?.length) query.set("features", params.features.join(","));
  if (params.currency) query.set("currency", params.currency);
  const { data } = await aggregatorRequest<AggregatorGamesPage>(`/games?${query}`);
  if (!Array.isArray(data.games) || !Number.isInteger(data.total) || !Number.isInteger(data.page)) {
    throw new AggregatorError("Aggregator returned an invalid games page.", 502);
  }
  return data;
}

export async function listAllAggregatorGames() {
  const first = await listAggregatorGames({ page: 1, per_page: 200 });
  const games = [...first.games];
  const pages = Math.ceil(first.total / first.per_page);
  for (let page = 2; page <= pages; page++) {
    const next = await listAggregatorGames({ page, per_page: first.per_page });
    if (next.page !== page || next.games.length === 0) throw new AggregatorError(`Aggregator catalog pagination stopped at page ${page}.`, 502);
    games.push(...next.games);
  }
  if (games.length !== first.total) throw new AggregatorError(`Aggregator catalog expected ${first.total} games but fetched ${games.length}.`, 502);
  return games;
}

export async function listAggregatorProviders() {
  const { data } = await aggregatorRequest<{ providers: AggregatorProvider[]; total_count: number }>("/providers/registry");
  if (!Array.isArray(data.providers)) throw new AggregatorError("Aggregator returned an invalid provider registry.", 502);
  return data.providers;
}

export async function testAggregatorConnection() {
  const { data: page, headers } = await aggregatorRequest<AggregatorGamesPage>("/games?page=1&per_page=1");
  if (!Array.isArray(page.games) || !Number.isInteger(page.total)) throw new AggregatorError("Aggregator returned an invalid games page.", 502);
  return { ok: true, mode: aggregatorMode(), serverMode: headers.get("x-api-mode"), totalGames: page.total };
}
