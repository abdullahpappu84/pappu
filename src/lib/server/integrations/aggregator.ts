import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { integrations, siteSettings } from "@/db/schema";
import type { AggregatorConnection } from "@/lib/aggregator";
import { AggregatorError, testAggregatorConnection } from "@/lib/aggregator";
import { mergeSecrets, clearIntegrationCache, resolveSecrets, type IntegrationRow } from "./store";

/** One-time import for deployments that still have Aggregator credentials in environment variables. */
export async function ensureAggregatorGameApi() {
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(424249)`);
    const [existing] = await tx.select().from(integrations).where(and(eq(integrations.kind, "game"), eq(integrations.code, "aggregator"))).limit(1);
    const [marker] = await tx.select({ key: siteSettings.key }).from(siteSettings).where(eq(siteSettings.key, "__aggregator_env_imported_v1"));
    if (existing) {
      const envApiKey = process.env.AGGREGATOR_API_KEY?.trim() || process.env.GAME_API_KEY?.trim();
      const envBaseUrl = process.env.AGGREGATOR_API_URL?.trim() || process.env.GAME_API_URL?.trim();
      const config = {
        ...existing.config,
        apiType: "aggregator",
        baseUrl: existing.config.baseUrl || envBaseUrl || "https://api.aggregator.gg/v1",
        catalogMode: existing.config.catalogMode || ((process.env.AGGREGATOR_MODE?.trim().toLowerCase() || "test") === "live" ? "live" : "sandbox"),
      };
      const storedSecrets = resolveSecrets(existing.secrets);
      const secrets = !storedSecrets.API_KEY && envApiKey
        ? mergeSecrets(existing.secrets, { API_KEY: envApiKey })
        : existing.secrets;
      const [migrated] = await tx.update(integrations).set({ config, secrets }).where(eq(integrations.id, existing.id)).returning();
      await tx.insert(siteSettings).values({ key: "__aggregator_env_imported_v1", value: true }).onConflictDoNothing();
      return migrated;
    }
    if (marker) return null;
    const apiKey = process.env.AGGREGATOR_API_KEY?.trim() || process.env.GAME_API_KEY?.trim();
    if (!apiKey) return null;
    const baseUrl = (process.env.AGGREGATOR_API_URL?.trim() || process.env.GAME_API_URL?.trim() || "https://api.aggregator.gg/v1").replace(/\/+$/, "");
    const mode = (process.env.AGGREGATOR_MODE?.trim().toLowerCase() || "test") === "live" ? "live" : "sandbox";
    const secretValues: Record<string, string> = { API_KEY: apiKey };
    const apiSecret = process.env.AGGREGATOR_API_SECRET?.trim() || process.env.GAME_API_SECRET?.trim();
    const webhookSecret = process.env.AGGREGATOR_CALLBACK_SECRET?.trim() || process.env.GAME_CALLBACK_SECRET?.trim();
    if (apiSecret) secretValues.API_SECRET = apiSecret;
    if (webhookSecret) secretValues.WEBHOOK_SECRET = webhookSecret;
    const [created] = await tx.insert(integrations).values({
      kind: "game", code: "aggregator", name: "Aggregator.gg", isActive: true,
      config: {
        apiType: "aggregator", baseUrl, catalogMode: mode,
        operatorId: process.env.GAME_OPERATOR_ID?.trim() || "",
        currency: process.env.GAME_DEFAULT_CURRENCY?.trim() || "EUR",
        country: process.env.GAME_DEFAULT_COUNTRY?.trim() || "",
      },
      secrets: mergeSecrets({}, secretValues),
      notes: "Imported from the existing server environment configuration.",
    }).onConflictDoNothing().returning();
    if (created) await tx.insert(siteSettings).values({ key: "__aggregator_env_imported_v1", value: true }).onConflictDoNothing();
    return created ?? (await tx.select().from(integrations).where(and(eq(integrations.kind, "game"), eq(integrations.code, "aggregator"))).limit(1))[0] ?? null;
  });
  if (result) clearIntegrationCache();
  return result;
}

export function aggregatorConnection(row: IntegrationRow): AggregatorConnection {
  const secrets = resolveSecrets(row.secrets);
  const config = row.config ?? {};
  const baseUrl = config.baseUrl?.trim();
  const apiKey = secrets.API_KEY?.trim();
  if (!baseUrl || !apiKey) throw new Error("Set an Aggregator base URL and API key in this API configuration.");
  return { baseUrl, apiKey, mode: config.catalogMode === "live" ? "live" : "test" };
}

export const isAggregatorApi = (row: IntegrationRow) => row.kind === "game" && row.config?.apiType === "aggregator";

export async function testAggregatorApi(row: IntegrationRow) {
  try { return await testAggregatorConnection(aggregatorConnection(row)); }
  catch (error) { return { ok: false, error: safeAggregatorError(error) }; }
}

export function safeAggregatorError(error: unknown) {
  if (error instanceof AggregatorError) {
    if (error.status === 401 || error.status === 403) return "Connection failed: the API rejected these credentials.";
    if (error.status === 429) return "Connection failed: the API rate limit was reached. Try again shortly.";
    if (error.status >= 500) return "Connection failed: the API service is temporarily unavailable.";
  }
  if (error instanceof Error && error.message.startsWith("Set an Aggregator base URL")) return error.message;
  return "The API request failed. Check the API configuration and try again.";
}
