"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2, Trophy } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Card, Empty, Input, Spinner, StatusBadge } from "@/components/ui/kit";

type SportsApi = { id: number; name: string; apiName: string; apiType: string; baseUrl: string; currency: string; region: string; isActive: boolean; maintenanceMode: boolean; priority: number; credentials: { name: string; set: boolean }[] };
type Draft = Omit<SportsApi, "id" | "credentials"> & { id?: number; apiKey: string; apiSecret: string };
const emptyDraft = (): Draft => ({ name: "", apiName: "", apiType: "sportsbook", baseUrl: "", currency: "", region: "", isActive: true, maintenanceMode: false, priority: 1, apiKey: "", apiSecret: "" });

export function SportsApiManagement() {
  const [items, setItems] = useState<SportsApi[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { setItems((await api<{ items: SportsApi[] }>("/api/admin/sports-apis")).items); }
    catch (e) { setError(errMsg(e)); setItems([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!draft) return;
    setBusy(true); setError("");
    try {
      const payload = { ...draft, priority: Number(draft.priority) };
      if (draft.id) await api(`/api/admin/sports-apis/${draft.id}`, { method: "PATCH", body: payload });
      else await api("/api/admin/sports-apis", { body: payload });
      setDraft(null); await load();
    } catch (e) { setError(errMsg(e)); }
    finally { setBusy(false); }
  };
  const remove = async (item: SportsApi) => {
    if (!confirm(`Delete ${item.name}?`)) return;
    try { await api(`/api/admin/sports-apis/${item.id}`, { method: "DELETE" }); await load(); }
    catch (e) { setError(errMsg(e)); }
  };
  const toggle = async (item: SportsApi, key: "isActive" | "maintenanceMode") => {
    try { await api(`/api/admin/sports-apis/${item.id}`, { method: "PATCH", body: { [key]: !item[key] } }); await load(); }
    catch (e) { setError(errMsg(e)); }
  };

  return <div className="space-y-4">
    <Card title="Sports API Management" icon={<Trophy className="h-5 w-5" />} action={<Button size="sm" iconLeft={<Plus className="h-4 w-4" />} onClick={() => { setError(""); setDraft(emptyDraft()); }}>Add Sports API</Button>}>
      <p className="mb-4 text-sm text-white/50">Credentials are encrypted on the server. Provider adapters and documented health checks can be added independently.</p>
      {error && <p className="mb-3 text-sm text-rose-300">{error}</p>}
      {!items ? <Spinner /> : items.length === 0 ? <Empty text="No sports APIs configured." /> : <div className="space-y-2">
        <div className="hidden grid-cols-[1.3fr_1fr_1fr_90px_1.3fr] gap-3 px-3 text-[10px] uppercase tracking-wider text-white/40 md:grid"><span>Provider / API</span><span>Status</span><span>Maintenance</span><span>Priority</span><span className="text-right">Actions</span></div>
        {items.map((item) => <article key={item.id} className="grid gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 md:grid-cols-[1.3fr_1fr_1fr_90px_1.3fr] md:items-center">
          <div className="min-w-0"><b className="block truncate text-sm text-white">{item.name}</b><span className="block truncate text-xs text-white/45">{item.apiName} · {item.apiType}</span></div>
          <div><StatusBadge status={item.isActive ? "active" : "inactive"} /><button onClick={() => void toggle(item, "isActive")} className="ml-2 text-xs text-gold-200">{item.isActive ? "Disable" : "Enable"}</button></div>
          <div><span className={item.maintenanceMode ? "text-amber-200" : "text-white/55"}>{item.maintenanceMode ? "On" : "Off"}</span><button onClick={() => void toggle(item, "maintenanceMode")} className="ml-2 text-xs text-gold-200">Toggle</button></div>
          <span className="text-sm text-white/70">{item.priority}</span>
          <div className="flex justify-end gap-2"><Button size="xs" variant="outline" onClick={() => { setError(""); setDraft({ ...item, apiKey: "", apiSecret: "" }); }}><Pencil className="mr-1 h-3 w-3" />Edit</Button><Button size="xs" variant="outline" className="border-rose-400/30 text-rose-300" onClick={() => void remove(item)}><Trash2 className="mr-1 h-3 w-3" />Delete</Button></div>
        </article>)}
      </div>}
    </Card>
    <Modal open={Boolean(draft)} onClose={() => !busy && setDraft(null)} label="Sports API configuration" maxWidth="md:max-w-3xl">
      {draft && <div className="space-y-4 p-5 md:p-6"><div><h2 className="font-display text-xl font-semibold text-white">{draft.id ? "Edit Sports API" : "Add Sports API"}</h2><p className="mt-1 text-xs text-white/45">Secrets stay server-side and are never returned in this form.</p></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Provider name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <Input label="API name" value={draft.apiName} onChange={(e) => setDraft({ ...draft, apiName: e.target.value })} />
          <Input label="API type" value={draft.apiType} onChange={(e) => setDraft({ ...draft, apiType: e.target.value })} placeholder="Sportsbook, odds feed..." />
          <Input label="Base URL" type="url" value={draft.baseUrl} onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })} placeholder="https://api.provider.example" />
          <Input label={draft.id ? "API key (leave blank to keep current)" : "API key"} type="password" autoComplete="new-password" value={draft.apiKey} onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })} />
          <Input label={draft.id ? "API secret (leave blank to keep current)" : "API secret"} type="password" autoComplete="new-password" value={draft.apiSecret} onChange={(e) => setDraft({ ...draft, apiSecret: e.target.value })} />
          <Input label="Currency" value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })} placeholder="EUR" />
          <Input label="Country / region" value={draft.region} onChange={(e) => setDraft({ ...draft, region: e.target.value })} placeholder="BD" />
          <Input label="Priority (lower number first)" type="number" min={1} value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })} />
          <div className="flex flex-wrap items-center gap-4 pt-6 text-sm text-white/70"><label className="flex items-center gap-2"><input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} />Active</label><label className="flex items-center gap-2"><input type="checkbox" checked={draft.maintenanceMode} onChange={(e) => setDraft({ ...draft, maintenanceMode: e.target.checked })} />Maintenance mode</label></div>
        </div>
        {error && <p className="text-sm text-rose-300">{error}</p>}
        <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setDraft(null)}>Cancel</Button><Button disabled={busy} onClick={() => void save()}>{busy ? "Saving..." : "Save Sports API"}</Button></div>
      </div>}
    </Modal>
  </div>;
}
