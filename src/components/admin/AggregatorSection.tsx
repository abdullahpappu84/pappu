"use client";

import { useState } from "react";
import { RefreshCw, Wifi } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/kit";
import { api, errMsg } from "@/lib/api";

type SyncResult = { totalFetched: number; newGames: number; updatedGames: number; deactivatedGames: number; failedRecords: number; providersMatched: number; providersCreated: number; thumbnailsUpdated: number };

export function AggregatorSection() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [stats, setStats] = useState<SyncResult | null>(null);
  const act = async (path: string, label: string) => {
    setBusy(true); setMessage("");
    try {
      const result = await api<SyncResult & { ok?: boolean; mode?: string; serverMode?: string | null; totalGames?: number }>(`/api/admin/${path}`, { method: "POST" });
      if (path.endsWith("sync")) { setStats(result); setMessage("Catalog sync completed."); }
      else setMessage(`Connection successful (configured: ${result.mode}${result.serverMode ? `, Aggregator: ${result.serverMode}` : ""}; ${result.totalGames} catalog games).`);
    } catch (e) { setMessage(errMsg(e)); }
    finally { setBusy(false); }
  };
  return <Card title="Aggregator.gg" icon={<Wifi className="h-5 w-5" />}>
    <p className="mb-4 text-sm text-white/60">API credentials are read from server environment variables and are never shown here. Manage credentials and test/live access in your hosting environment.</p>
    <div className="flex flex-wrap gap-3">
      <Button disabled={busy} variant="outline" onClick={() => act("aggregator/test-connection", "test")}><Wifi className="mr-2 h-4 w-4" />Test connection</Button>
      <Button disabled={busy} onClick={() => act("aggregator/sync", "sync")}><RefreshCw className="mr-2 h-4 w-4" />Sync games</Button>
    </div>
    {message && <p className="mt-4 text-sm text-white/70">{message}</p>}
    {stats && <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">{[["Fetched", stats.totalFetched], ["New", stats.newGames], ["Updated", stats.updatedGames], ["Providers matched", stats.providersMatched], ["Providers created", stats.providersCreated], ["Thumbnails updated", stats.thumbnailsUpdated], ["Errors", stats.failedRecords]].map(([k, v]) => <div key={k} className="rounded-lg bg-white/[0.04] p-3"><dt className="text-white/50">{k}</dt><dd className="mt-1 font-semibold">{v}</dd></div>)}</dl>}
  </Card>;
}
