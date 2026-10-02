import "server-only";
import { eq, or } from "drizzle-orm";
import { db } from "@/db";
import { games, users, wallets } from "@/db/schema";
import { safeEqual } from "../crypto";
import { processGameEvent } from "../finance";
import { ApiError, conflict } from "../http";
import type { GameAdapter } from "../games/adapters";
import { verifyGameToken } from "../games/launch";
import { baseVars, getPath, lines, listOf, mask, num, readIncoming, render, sendRequest, str, verifySignature, type Cfg, type DebugLog, type Vars } from "./engine";
import { resolveSecrets, type IntegrationRow } from "./store";
import { launchAggregatorGame } from "../games/adapters";

const DEFAULT_OK = '{"status":"OK","balance":{{balance}},"currency":"{{currency}}","transaction_id":"{{transaction_id}}"}';
const DEFAULT_ERR = '{"status":"ERROR","error_code":"{{error_code}}","message":"{{message}}"}';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Builds a GameAdapter (launch) from an admin-configured integration row. */
export function buildGameAdapter(row: IntegrationRow, debug?: DebugLog): GameAdapter {
  const c = (row.config ?? {}) as Cfg;
  if (c.apiType === "aggregator") return {
    code: row.code,
    label: row.name,
    launch: (input) => launchAggregatorGame(row, input),
  };
  return {
    code: row.code,
    label: row.name,
    async launch(i) {
      const secrets = resolveSecrets(row.secrets);
      const base = i.lobbyUrl.replace(/\/$/, "");
      const customMetadata = (i.game.aggregatorMetadata as { customApi?: { launchUrl?: string; demoUrl?: string } } | null)?.customApi;
      const vars: Vars = {
        ...baseVars(secrets),
        game_id: i.game.integrationRef || i.game.slug,
        game_slug: i.game.slug,
        game_name: i.game.name,
        game_launch_url: customMetadata?.launchUrl ?? "",
        game_demo_url: customMetadata?.demoUrl ?? "",
        provider: i.providerSlug ?? "",
        mode: i.mode,
        demo: i.mode === "demo" ? "true" : "false",
        real: i.mode === "real" ? "true" : "false",
        player_id: i.user?.id ?? "",
        player_name: i.user?.name ?? "",
        player_email: i.user?.email ?? "",
        currency: i.user?.currency ?? "EUR",
        language: i.language,
        token: i.token ?? "",
        device: i.device,
        platform: i.device,
        lobby_url: i.lobbyUrl,
        callback_url: `${base}/api/games/callback/${row.code}`,
        ip: i.ip,
      };
      const target = i.mode === "demo" && c.demoUrl ? c.demoUrl : c.launchUrl;
      let url: string;
      if ((c.launchMode || "api") === "url_template") {
        if (!target) throw conflict(`${row.name}: launch URL is not configured.`);
        url = render(target, vars);
        debug?.push({ launchUrl: mask(url, secrets) });
      } else {
        const r = await sendRequest(
          { method: c.launchMethod, url: target, contentType: c.launchContentType, headers: c.launchHeaders, body: c.launchBody, sigAlgo: c.reqSigAlgo, sigPayload: c.reqSigPayload, sigTemplate: c.reqSigTemplate, sigSecret: c.reqSigSecret, sigEncoding: c.reqSigEncoding, sigHeader: c.reqSigHeader },
          vars,
          row.name,
          secrets,
          debug,
        );
        url = str(getPath(r.data, c.launchUrlPath || "url"));
        if (!r.ok || !url) throw conflict(str(getPath(r.data, c.launchErrorPath || "message")) || `${row.name}: the game could not be launched.`);
      }
      if (!/^https?:\/\//.test(url)) throw conflict(`${row.name}: launch URL is invalid.`);
      return { url, display: c.display === "redirect" ? "redirect" : "iframe" };
    },
  };
}

async function walletBalance(userId: string) {
  const [w] = await db.select().from(wallets).where(eq(wallets.userId, userId));
  const main = Number(w?.mainBalance ?? 0);
  const bonus = Number(w?.bonusBalance ?? 0);
  return { main, bonus, total: main + bonus, currency: w?.currency ?? "EUR" };
}

/** Universal seamless-wallet callback for admin-configured game integrations. */
export async function handleGameCallback(row: IntegrationRow, req: Request): Promise<Response> {
  const c = (row.config ?? {}) as Cfg;
  const secrets = resolveSecrets(row.secrets);
  const inc = await readIncoming(req);
  const vars: Vars = { ...baseVars(secrets), body: inc.params, query: inc.query, headers: inc.headers, request: inc.params };
  const codes = Object.fromEntries(
    lines(c.errorCodes)
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
      .filter(([k]) => k),
  );
  const mult = num(c.balanceMultiplier) || 1;
  const fmt = (v: number) => (mult >= 100 ? String(Math.round(v * mult)) : (Math.round(v * mult * 100) / 100).toFixed(2));
  const reply = (tpl: string, extra: Vars, status: number) => {
    const body = render(tpl, { ...vars, ...extra }, "json");
    const isJson = /^\s*[[{]/.test(body);
    return new Response(body, { status, headers: { "Content-Type": isJson ? "application/json" : "text/plain" } });
  };
  const fail = (code: string, message: string, http: number) =>
    reply(c.responseError?.trim() || DEFAULT_ERR, { error_code: codes[code] ?? code, message, ok: "false", balance: "0" }, num(c.errorHttpStatus) ?? http);

  try {
    const mode = c.cbSigMode || "signature";
    if (mode === "signature" && !verifySignature(c, "cbSig", inc, secrets, vars)) return fail("INVALID_SIGNATURE", "Invalid signature.", 401);
    if (mode === "header_token") {
      const got = (inc.headers[(c.cbSigHeader || "authorization").toLowerCase()] ?? "").replace(/^Bearer\s+/i, "").trim();
      const expected = c.cbSigSecret ? secrets[c.cbSigSecret] : "";
      if (!expected || !safeEqual(got, expected)) return fail("INVALID_SIGNATURE", "Unauthorized.", 401);
    }

    const actionRaw = str(getPath(inc.params, c.cbActionPath || "action")).toLowerCase();
    const is = (key: string, def: string) => listOf(c[key], def).includes(actionRaw);
    const action = is("actionAuth", "authenticate,auth")
      ? "auth"
      : is("actionBalance", "balance,getbalance")
        ? "balance"
        : is("actionBet", "bet,debit")
          ? "bet"
          : is("actionWin", "win,credit")
            ? "win"
            : is("actionRollback", "rollback,refund,cancel")
              ? "rollback"
              : null;
    if (!action) return fail("BAD_REQUEST", `Unknown action "${actionRaw}".`, 400);

    const token = str(getPath(inc.params, c.cbTokenPath || "token"));
    let userId = str(getPath(inc.params, c.cbUserPath || "player_id"));
    let gameKey = str(getPath(inc.params, c.cbGamePath || "game_id"));
    if (token) {
      const t = verifyGameToken(token);
      if (t) {
        userId = t.uid;
        gameKey ||= t.g;
      } else if (action === "auth" || !userId) return fail("INVALID_TOKEN", "Invalid or expired token.", 401);
    }
    if (!UUID.test(userId)) return fail("PLAYER_NOT_FOUND", "Player not found.", 404);
    const [u] = await db.select({ id: users.id, name: users.name, status: users.status }).from(users).where(eq(users.id, userId));
    if (!u) return fail("PLAYER_NOT_FOUND", "Player not found.", 404);

    const ok = async (extra: Vars) => {
      const b = await walletBalance(u.id);
      return reply(c.responseOk?.trim() || DEFAULT_OK, { ok: "true", balance: fmt(b.total), balance_main: fmt(b.main), balance_bonus: fmt(b.bonus), currency: b.currency, player_id: u.id, player_name: u.name, transaction_id: "", duplicate: "false", ...extra }, 200);
    };
    if (action === "auth" || action === "balance") return ok({});
    if (action === "bet" && u.status !== "active") return fail("PLAYER_BLOCKED", "Player is restricted.", 403);

    const roundId = str(getPath(inc.params, c.cbRoundPath || "round_id"));
    const txId = str(getPath(inc.params, c.cbTxPath || "transaction_id"));
    if (!roundId && !txId) return fail("BAD_REQUEST", "round/transaction ID is required.", 400);
    const amount = (num(getPath(inc.params, c.cbAmountPath || "amount")) ?? 0) / (num(c.amountDivisor) || 1);
    let gameSlug: string | undefined;
    if (gameKey) {
      const [g] = await db.select({ slug: games.slug }).from(games).where(or(eq(games.integrationRef, gameKey), eq(games.slug, gameKey))).limit(1);
      gameSlug = g?.slug ?? gameKey;
    }
    const r = await processGameEvent({ action, userId: u.id, amount, roundId: roundId || txId, transactionId: txId || undefined, gameSlug });
    return ok({ transaction_id: r.transaction?.reference ?? "", duplicate: r.duplicate ? "true" : "false" });
  } catch (e) {
    if (e instanceof ApiError) return fail(e.code === "INSUFFICIENT_FUNDS" ? "INSUFFICIENT_FUNDS" : "BAD_REQUEST", e.message, e.status);
    console.error(`[games:${row.code}] callback error`, e);
    return fail("ERROR", "Internal error.", 500);
  }
}
