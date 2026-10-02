"use client";

import { Copy, FlaskConical, KeyRound, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Card, Empty, Input, Label, Select, Spinner, StatusBadge, Table, Textarea, useApi, inputCls } from "@/components/ui/kit";
import { api, errMsg, fmtDate } from "@/lib/api";
import { GAME_SECTIONS, PAYMENT_SECTIONS, PRESETS, VARIABLES, type IntegrationKind, type ISection } from "@/lib/integrations/fields";

type SecretInfo = { name: string; envRef: string | null; set: boolean };
type EnvironmentApi = { code: string; name: string; type: string; configured: boolean; endpoint: string; mode: string; lastSyncAt: string | null };
type UnmappedGame = { gameName: string; externalProviderId: string | null; externalProviderName: string | null; reason: string };
type Row = { id: number; kind: IntegrationKind; code: string; name: string; isActive: boolean; notes: string | null; config: Record<string, string>; secretInfo: SecretInfo[]; updatedAt: string; lastTestAt?: string | null; lastSyncAt?: string | null; gameCount?: number; apiType?: string; mode?: string };
type SecretDraft = { name: string; value: string; stored: boolean; envRef: string | null; remove?: boolean };
type Draft = { id?: number; code: string; name: string; isActive: boolean; notes: string; config: Record<string, string>; secrets: SecretDraft[] };

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <Label label={label}>
      <div className="flex gap-2">
        <input readOnly value={value} className={`${inputCls} font-mono text-[12px]`} />
        <button type="button" onClick={() => navigator.clipboard.writeText(value)} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 text-gold-300 hover:border-gold-300/50" aria-label="Copy">
          <Copy className="h-4 w-4" />
        </button>
      </div>
    </Label>
  );
}

function SectionForm({ section, config, set }: { section: ISection; config: Record<string, string>; set: (k: string, v: string) => void }) {
  if (section.showIf && !section.showIf[1].includes(config[section.showIf[0]] ?? "")) return null;
  return (
    <fieldset className="rounded-2xl border border-white/[0.07] p-4">
      <legend className="px-2 font-display text-[16px] font-semibold text-gold-200">{section.title}</legend>
      {section.description && <p className="mb-3 text-[12px] text-white/45">{section.description}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {section.fields.map((f) => {
          const v = config[f.key] ?? "";
          const cls = f.full || f.type === "textarea" ? "md:col-span-2" : "";
          return (
            <div key={f.key} className={cls}>
              <Label label={f.label} hint={f.help}>
                {f.type === "select" ? (
                  <select className={inputCls} value={v} onChange={(e) => set(f.key, e.target.value)}>
                    <option value="" className="bg-ink-800">— default —</option>
                    {f.options?.map((o) => <option key={o} value={o} className="bg-ink-800">{o}</option>)}
                  </select>
                ) : f.type === "textarea" ? (
                  <textarea className={`${inputCls} h-auto min-h-[92px] py-2.5 font-mono text-[12px]`} value={v} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} spellCheck={false} />
                ) : (
                  <input className={`${inputCls} ${f.key.endsWith("Path") || f.key.endsWith("Url") ? "font-mono text-[12.5px]" : ""}`} type={f.type === "number" ? "number" : "text"} step="any" value={v} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />
                )}
              </Label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

export function IntegrationsSection({ kind }: { kind: IntegrationKind }) {
  const { data, reload } = useApi<{ items: Row[]; baseUrl: string; environmentApis?: EnvironmentApi[] }>(`/api/admin/integrations?kind=${kind}`);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<{ row: Row; result?: unknown; running?: boolean; gameId: string; mode: "demo" | "real"; amount: string } | null>(null);
  const [catalogMessage, setCatalogMessage] = useState("");
  const [unmappedGames, setUnmappedGames] = useState<UnmappedGame[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const [deletePolicy, setDeletePolicy] = useState<"keep" | "disable" | "delete">("keep");
  const sections = kind === "payment" ? PAYMENT_SECTIONS : GAME_SECTIONS;
  const presets = PRESETS.filter((p) => p.kind === kind);
  const base = data?.baseUrl ?? "";
  const urls = (code: string) =>
    kind === "payment"
      ? [
          ["Webhook / IPN URL (give this to the gateway)", `${base}/api/payments/webhook/${code || "{code}"}`],
          ["Return URL (sent automatically)", `${base}/api/payments/return/${code || "{code}"}`],
        ]
      : [["Wallet callback URL (give this to the provider)", `${base}/api/games/callback/${code || "{code}"}`]];

  const openNew = () => {
    setError(null);
    setDraft({ code: "", name: "", isActive: true, notes: "", config: { ...presets[0].config, apiType: "custom" }, secrets: presets[0].secrets.map((n) => ({ name: n, value: "", stored: false, envRef: null })) });
  };
  const openEdit = (r: Row) => {
    setError(null);
    setDraft({ id: r.id, code: r.code, name: r.name, isActive: r.isActive, notes: r.notes ?? "", config: { ...r.config }, secrets: r.secretInfo.map((s) => ({ name: s.name, value: "", stored: s.set || Boolean(s.envRef), envRef: s.envRef })) });
  };
  const applyPreset = (id: string) => {
    const p = presets.find((x) => x.id === id);
    if (!p || !draft) return;
    const existing = new Set(draft.secrets.map((s) => s.name));
    setDraft({ ...draft, config: { ...p.config }, secrets: [...draft.secrets, ...p.secrets.filter((n) => !existing.has(n)).map((n) => ({ name: n, value: "", stored: false, envRef: null }))] });
  };

  const setApiType = (value: string) => {
    if (!draft) return;
    const aggregator = value === "aggregator";
    const required = aggregator ? ["API_KEY", "API_SECRET", "WEBHOOK_SECRET"] : [];
    const present = new Set(draft.secrets.map((secret) => secret.name));
    setDraft({
      ...draft,
      name: aggregator && !draft.id ? "Aggregator.gg" : draft.name,
      code: aggregator && !draft.id ? "aggregator" : !aggregator && !draft.id && draft.code === "aggregator" ? "" : draft.code,
      config: { ...draft.config, apiType: value, ...(aggregator ? { baseUrl: draft.config.baseUrl || "https://api.aggregator.gg/v1", catalogMode: draft.config.catalogMode || "sandbox", currency: draft.config.currency || "EUR" } : {}) },
      secrets: [...draft.secrets, ...required.filter((name) => !present.has(name)).map((name) => ({ name, value: "", stored: false, envRef: null }))],
    });
  };

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const secrets: Record<string, string | null> = {};
      for (const s of draft.secrets) {
        const name = s.name.trim().toUpperCase();
        if (!name) continue;
        if (s.remove) secrets[name] = null;
        else if (s.value) secrets[name] = s.value;
      }
      const config = Object.fromEntries(Object.entries(draft.config).filter(([, v]) => v !== "" && v != null));
      const body = { name: draft.name, isActive: draft.isActive, notes: draft.notes || null, config, secrets };
      if (draft.id) await api(`/api/admin/integrations/${draft.id}`, { method: "PATCH", body });
      else await api("/api/admin/integrations", { body: { ...body, kind, code: draft.code } });
      setDraft(null);
      reload();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    try {
      await api(`/api/admin/integrations/${deleteTarget.id}`, { method: "DELETE", body: { gamePolicy: deletePolicy } });
      setDeleteTarget(null);
      reload();
    } catch (e) {
      alert(errMsg(e));
    }
  };

  const runTest = async () => {
    if (!test) return;
    setTest({ ...test, running: true, result: undefined });
    try {
      const r = await api(`/api/admin/integrations/${test.row.id}/test`, { body: kind === "payment" ? { amount: Number(test.amount) || 10 } : { gameId: test.gameId, mode: test.mode } });
      setTest((t) => (t ? { ...t, running: false, result: r } : t));
    } catch (e) {
      setTest((t) => (t ? { ...t, running: false, result: { ok: false, error: errMsg(e) } } : t));
    }
  };

  const runCatalogAction = async (row: Row, action: "test" | "detect" | "sync" | "clean-sync") => {
    if (row.apiType === "aggregator" && action === "sync" && !confirm(`Re-sync ${row.name}? This fetches the current catalog, updates matches by external game ID, repairs provider and image links, and keeps local categories/settings.`)) return;
    if (action === "clean-sync" && !confirm(`Clean & Re-sync ${row.name}? This rebuilds the API catalog mapping and disables stale games after a complete successful fetch. It does not delete games or categories.`)) return;
    setBusy(true); setError(null); setCatalogMessage(""); setUnmappedGames([]);
    try {
      const result = await api<Record<string, unknown>>(`/api/admin/integrations/${row.id}/catalog/${action}`, { body: {} });
      if (result.ok === false) throw new Error(String(result.error ?? "Catalog request failed."));
      if (action === "detect") {
        const detected = result.detected as Record<string, string>;
        setDraft((current) => current?.id === row.id ? { ...current, config: { ...current.config, ...detected } } : current);
        setCatalogMessage(`Detected ${Object.keys(detected).length} fields. Review and save the mapping in the editor.`);
        return;
      }
      setCatalogMessage(action === "test" ? `Connected. Catalog returned ${result.fetched ?? result.totalGames ?? 0} games.` : `Fetched ${result.totalFetched}; ${result.newGames} new, ${result.updatedGames} updated, ${result.skipped ?? result.failedRecords ?? 0} errors; providers: ${result.providersMatched} matched, ${result.providersCreated} created; thumbnails updated: ${result.thumbnailsUpdated}.${action === "clean-sync" ? ` Stale games disabled: ${result.staleGamesDisabled ?? 0}.` : ""}`);
      const unmapped = Array.isArray(result.unmappedGames) ? result.unmappedGames as UnmappedGame[] : [];
      if (action === "sync" && unmapped.length) {
        setUnmappedGames(unmapped);
        setCatalogMessage((message) => `${message} ${unmapped.length} game(s) have no provider mapping.`);
      }
      if (action === "sync" || action === "clean-sync") reload();
    } catch (e) { setCatalogMessage(errMsg(e)); }
    finally { setBusy(false); }
  };

  const runEnvironmentAction = async (source: EnvironmentApi, action: "test" | "sync") => {
    setBusy(true); setError(null); setCatalogMessage(""); setUnmappedGames([]);
    try {
      const result = await api<Record<string, unknown>>(`/api/admin/integrations/environment/${source.code}/catalog/${action}`, { body: {} });
      if (result.ok === false) throw new Error(String(result.error ?? "Catalog request failed."));
      setCatalogMessage(action === "test" ? `${source.name} connected. Catalog returned ${result.fetched} games.` : `${source.name}: fetched ${result.totalFetched}; ${result.newGames} new, ${result.updatedGames} updated, ${result.skipped} skipped; provider ${result.providersMatched ? "matched" : "created"}; thumbnails updated: ${result.thumbnailsUpdated}.`);
      if (action === "sync") reload();
    } catch (e) { setCatalogMessage(errMsg(e)); }
    finally { setBusy(false); }
  };

  return (
    <Card
      title={kind === "payment" ? "Custom payment gateways" : "Custom game APIs"}
      action={<Button size="sm" iconLeft={<Plus className="relative h-4 w-4" />} onClick={openNew}>Add {kind === "payment" ? "gateway" : "game API"}</Button>}
    >
      <p className="mb-4 text-[12.5px] leading-relaxed text-white/55">
        {kind === "payment"
          ? "Connect any payment gateway without code: set its API URL, request template, response mapping and webhook verification. A matching payment method is created automatically (Finance → Payment Methods)."
          : "Connect any game provider or aggregator without code: set its launch API/URL template and wallet-callback mapping, then choose this integration as the adapter on a provider (Games → Providers)."}{" "}
        Full guide: <a href="/install/integrations" target="_blank" className="text-gold-300 underline">/install/integrations</a>
      </p>
      {kind === "game" && data?.environmentApis?.some((source) => source.code !== "aggregator") ? <div className="mb-5 grid gap-2 md:grid-cols-3">
        {data.environmentApis.filter((source) => source.code !== "aggregator").map((source) => <div key={source.code} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
          <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold text-white">{source.name}</span><StatusBadge status={source.configured ? "configured" : "not configured"} /></div>
          <p className="mt-1 text-[11px] text-white/45">{source.type} · {source.mode}</p>
          <p className="mt-1 truncate font-mono text-[10px] text-white/35" title={source.endpoint}>{source.endpoint}</p>
          <p className="mt-1 text-[10px] text-white/35">Last sync: {source.lastSyncAt ? fmtDate(source.lastSyncAt, false) : "Never"}</p>
          {source.code === "casino_api_pro" && <div className="mt-2 flex gap-2">
            <Button size="xs" variant="outline" disabled={busy || !source.configured} onClick={() => runEnvironmentAction(source, "test")}>Test connection</Button>
            <Button size="xs" disabled={busy || !source.configured} onClick={() => runEnvironmentAction(source, "sync")}>Sync games</Button>
          </div>}
        </div>)}
      </div> : null}
      {!data ? (
        <Spinner />
      ) : !data.items.length ? (
        <Empty text="No custom integrations yet." />
      ) : (
        kind === "game" ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{data.items.map((r) => <article key={r.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h4 className="truncate font-semibold text-white">{r.name}</h4><p className="text-[11px] text-white/45">{{ aggregator: "Aggregator", custom: "Custom API", generic: "Generic API" }[r.apiType || "custom"] || "Custom API"} · {r.mode || "sandbox"}</p></div><StatusBadge status={r.isActive ? "active" : "inactive"}/></div>
          <p className="mt-3 truncate font-mono text-[10px] text-white/40" title={r.config.catalogUrl || r.config.launchUrl}>{r.config.catalogUrl || r.config.launchUrl || "Endpoint not configured"}</p>
          <p className="mt-2 text-xs text-white/55">{(r.gameCount ?? 0).toLocaleString()} games · Last test: {r.lastTestAt ? fmtDate(r.lastTestAt, false) : "Not tested"} · Last sync: {r.lastSyncAt ? fmtDate(r.lastSyncAt, false) : "Never"}</p>
          <div className="mt-3 flex flex-wrap gap-2"><Button size="xs" variant="outline" disabled={busy} onClick={() => runCatalogAction(r, "test")}>Test</Button><Button size="xs" disabled={busy || !r.isActive} onClick={() => runCatalogAction(r, "sync")}>{r.apiType === "aggregator" ? "Re-sync Games" : "Sync"}</Button>{r.apiType === "aggregator" && <Button size="xs" variant="outline" className="border-amber-300/30 text-amber-200" disabled={busy || !r.isActive} onClick={() => runCatalogAction(r, "clean-sync")}>Clean &amp; Re-sync</Button>}<Button size="xs" variant="outline" onClick={async()=>{try{await api(`/api/admin/integrations/${r.id}`,{method:"PATCH",body:{isActive:!r.isActive}});reload();}catch(e){alert(errMsg(e));}}}>{r.isActive ? "Disable" : "Enable"}</Button><Button size="xs" variant="outline" onClick={() => openEdit(r)}>Edit</Button><Button size="xs" variant="outline" className="border-rose-400/30 text-rose-300" onClick={() => { setDeleteTarget(r); setDeletePolicy("keep"); }}>Delete</Button></div>
        </article>)}</div> : <Table head={["Name", "Code", "Endpoint", "Secrets", "Status", "Updated", ""]}>
          {data.items.map((r) => (
            <tr key={r.id} className="text-white/80">
              <td className="font-semibold text-white">{r.name}</td>
              <td className="font-mono text-[12px]">{r.code}</td>
              <td className="max-w-[240px] truncate font-mono text-[11px] text-white/50">{r.config.createUrl || r.config.catalogUrl || r.config.launchUrl || "—"}</td>
              <td className="text-[12px]">
                {r.secretInfo.length ? r.secretInfo.map((s) => <span key={s.name} className={`mr-1 inline-block rounded px-1.5 py-0.5 text-[10px] ${s.set ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"}`}>{s.name}{s.envRef ? " (env)" : ""}</span>) : "—"}
              </td>
              <td><StatusBadge status={r.isActive ? "active" : "inactive"} /></td>
              <td className="text-white/50">{fmtDate(r.updatedAt, false)}</td>
              <td className="whitespace-nowrap text-right">
                <button onClick={() => setTest({ row: r, gameId: "", mode: "demo", amount: "10" })} className="mr-2 inline-grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-white/70 hover:text-sky-300" aria-label="Test"><FlaskConical className="h-3.5 w-3.5" /></button>
                <button onClick={() => openEdit(r)} className="mr-2 inline-grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-white/70 hover:text-gold-200" aria-label="Edit"><Pencil className="h-3.5 w-3.5" /></button>
                <button onClick={() => { setDeleteTarget(r); setDeletePolicy("keep"); }} className="inline-grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-white/70 hover:text-rose-300" aria-label="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
              </td>
            </tr>
          ))}
        </Table>
      )}
      {catalogMessage && kind === "game" && <p className="mt-3 text-[12.5px] text-white/70">{catalogMessage}</p>}
      {unmappedGames.length > 0 && <details className="mt-2 rounded-xl border border-amber-300/20 p-3 text-[12px]">
        <summary className="cursor-pointer font-semibold text-amber-200">Unmapped games ({unmappedGames.length})</summary>
        <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">{unmappedGames.map((game, index) => <p key={`${game.gameName}-${index}`} className="text-white/60"><span className="text-white">{game.gameName}</span> · provider ID: {game.externalProviderId || "—"} · provider: {game.externalProviderName || "—"} · {game.reason}</p>)}</div>
      </details>}

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} label="Delete API">
        {deleteTarget && <div className="space-y-4 p-5"><h3 className="text-lg font-semibold text-white">Delete {deleteTarget.name}?</h3><p className="text-sm text-white/55">Deleting the API configuration does not automatically delete its existing games.</p>{kind === "game" && <div className="space-y-2">{([["keep", "Keep existing games"], ["disable", "Disable games from this API"], ["delete", "Delete games from this API"]] as const).map(([value, label]) => <label key={value} className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 p-3 text-sm text-white/75"><input type="radio" name="game-policy" checked={deletePolicy === value} onChange={() => setDeletePolicy(value)} />{label}</label>)}</div>}<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button><Button className="bg-rose-600 text-white" onClick={remove}>Delete API</Button></div></div>}
      </Modal>

      {/* ---------------- Editor ---------------- */}
      <Modal open={!!draft} onClose={() => setDraft(null)} label="Integration" maxWidth="md:max-w-[980px]">
        {draft && (
          <div className="space-y-4 p-5 md:p-7">
            <h2 className="font-display text-[24px] font-semibold text-white">{draft.id ? `Edit ${draft.name}` : kind === "payment" ? "New payment gateway" : "New game API"}</h2>
            <div className="grid gap-3 md:grid-cols-3">
              {kind === "game" && <div className="md:col-span-3"><Select label="API Type" value={draft.config.apiType || "custom"} disabled={draft.id !== undefined && draft.config.apiType === "aggregator"} onChange={(e) => setApiType(e.target.value)} options={[{value:"aggregator",label:"Aggregator"},{value:"custom",label:"Custom API"},{value:"generic",label:"Generic API"}]} /></div>}
              <Input label="Display name *" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={kind === "payment" ? "aamarPay" : "Evo Aggregator"} />
              <Input label="Code * (used in URLs)" value={draft.code} disabled={!!draft.id} onChange={(e) => setDraft({ ...draft, code: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })} placeholder={kind === "payment" ? "aamarpay" : "evoagg"} hint="lowercase, cannot be changed later" />
              <label className="flex items-center justify-between rounded-xl border border-white/10 px-3.5 text-[13px] text-white/80 md:mt-6">
                Active
                <input type="checkbox" className="h-4 w-4 accent-[#f0b93f]" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} />
              </label>
            </div>
            {kind === "game" && draft.config.apiType === "aggregator" && <fieldset className="grid gap-3 rounded-2xl border border-gold-300/20 p-4 sm:grid-cols-2"><legend className="px-2 text-sm font-semibold text-gold-200">Aggregator connection</legend><Input label="Base URL *" value={draft.config.baseUrl || ""} onChange={(e) => setDraft({...draft,config:{...draft.config,baseUrl:e.target.value.trim()}})} placeholder="https://api.aggregator.gg/v1"/><Select label="Environment" value={draft.config.catalogMode || "sandbox"} onChange={(e)=>setDraft({...draft,config:{...draft.config,catalogMode:e.target.value}})} options={[{value:"sandbox",label:"Sandbox / Test"},{value:"live",label:"Live"}]}/><Input label="Operator ID" value={draft.config.operatorId || ""} onChange={(e)=>setDraft({...draft,config:{...draft.config,operatorId:e.target.value}})}/><Input label="Currency" value={draft.config.currency || "EUR"} onChange={(e)=>setDraft({...draft,config:{...draft.config,currency:e.target.value.toUpperCase()}})}/><Input label="Country" value={draft.config.country || ""} onChange={(e)=>setDraft({...draft,config:{...draft.config,country:e.target.value.toUpperCase()}})} placeholder="BD"/><p className="self-end text-xs text-white/45">API credentials remain encrypted on the server.</p></fieldset>}
            <Select label="Load a preset template (optional)" value="" onChange={(e) => e.target.value && applyPreset(e.target.value)} options={[{ value: "", label: "— choose a preset to prefill all fields —" }, ...presets.map((p) => ({ value: p.id, label: `${p.name} — ${p.description}` }))]} />
            <div className="grid gap-3 md:grid-cols-2">{urls(draft.code).map(([l, v]) => <CopyField key={l} label={l} value={v} />)}</div>

            {/* Secrets */}
            <fieldset className="rounded-2xl border border-gold-300/25 p-4">
              <legend className="flex items-center gap-1.5 px-2 font-display text-[16px] font-semibold text-gold-200"><KeyRound className="h-4 w-4" /> Secrets (API keys)</legend>
              <p className="mb-3 text-[12px] text-white/45">Encrypted on the server and never shown again. Use in templates as <code className="text-gold-100">{"{{secret.NAME}}"}</code>. To read from .env instead, enter <code className="text-gold-100">env:VAR_NAME</code> as the value.</p>
              <div className="space-y-2">
                {draft.secrets.map((s, i) => (
                  <div key={i} className={`grid gap-2 sm:grid-cols-[200px_1fr_auto] ${s.remove ? "opacity-40" : ""}`}>
                    <input className={`${inputCls} font-mono uppercase`} value={s.name} disabled={s.stored} placeholder="API_KEY" onChange={(e) => setDraft({ ...draft, secrets: draft.secrets.map((x, j) => (j === i ? { ...x, name: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "") } : x)) })} />
                    <input className={inputCls} type="password" autoComplete="new-password" value={s.value} placeholder={s.stored ? (s.envRef ? `stored → env:${s.envRef} (type to replace)` : "•••••••• stored (type to replace)") : "value or env:VAR_NAME"} onChange={(e) => setDraft({ ...draft, secrets: draft.secrets.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} />
                    <button type="button" onClick={() => setDraft({ ...draft, secrets: s.stored ? draft.secrets.map((x, j) => (j === i ? { ...x, remove: !x.remove } : x)) : draft.secrets.filter((_, j) => j !== i) })} className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 text-white/60 hover:text-rose-300" aria-label="Remove secret"><X className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
              <Button type="button" size="xs" variant="outline" className="mt-3" onClick={() => setDraft({ ...draft, secrets: [...draft.secrets, { name: "", value: "", stored: false, envRef: null }] })}>+ Add secret</Button>
            </fieldset>

            {!(kind === "game" && draft.config.apiType === "aggregator") && sections.map((s) => <SectionForm key={s.title} section={s} config={draft.config} set={(k, v) => setDraft({ ...draft, config: { ...draft.config, [k]: v } })} />)}
            {kind === "game" && <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" disabled={busy || !draft.id} onClick={() => draft.id && runCatalogAction(data?.items.find((row) => row.id === draft.id) ?? ({ ...draft, kind: "game", isActive: draft.isActive, notes: draft.notes || null, config: draft.config, secretInfo: [], updatedAt: "" } as Row), "detect")}>Detect fields from catalog</Button>
              {!draft.id && <span className="text-[11px] text-white/40">Save this API before testing or detecting its catalog.</span>}
              {catalogMessage && <span className="text-[12px] text-white/65">{catalogMessage}</span>}
            </div>}

            <details className="rounded-2xl border border-white/[0.07] p-4 text-[12.5px]">
              <summary className="cursor-pointer font-semibold text-white">Template variables &amp; filters</summary>
              <div className="mt-3 grid gap-1.5 sm:grid-cols-2">{VARIABLES[kind].map(([k, d]) => <p key={k}><code className="text-gold-100">{`{{${k}}}`}</code> <span className="text-white/50">— {d}</span></p>)}</div>
              <p className="mt-3 text-white/50">Filters: <code className="text-gold-100">{"{{lobby_url|url}}"}</code> url · upper · lower · trim · base64 · md5 · sha1 · sha256 · sha512 (chainable)</p>
            </details>
            <Textarea label="Internal notes" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
            {error && <p className="rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-[12.5px] text-rose-200">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
              <Button onClick={save} disabled={busy || !draft.name || !draft.code}>{busy ? "Saving…" : "Save integration"}</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ---------------- Tester ---------------- */}
      <Modal open={!!test} onClose={() => setTest(null)} label="Test integration" maxWidth="md:max-w-[860px]">
        {test && (
          <div className="space-y-3 p-6">
            <h3 className="font-display text-[22px] text-white">Test · {test.row.name}</h3>
            <p className="text-[12.5px] text-white/55">{kind === "payment" ? "Creates a real test session at the gateway (use sandbox credentials). No deposit is recorded." : "Calls the launch API / builds the URL for a test game."}</p>
            <div className="flex flex-wrap items-end gap-2">
              {kind === "payment" ? (
                <Input label="Amount (site currency)" type="number" value={test.amount} onChange={(e) => setTest({ ...test, amount: e.target.value })} className="w-40" />
              ) : (
                <>
                  <Input label="Provider game ID" value={test.gameId} onChange={(e) => setTest({ ...test, gameId: e.target.value })} className="w-56" />
                  <Select label="Mode" value={test.mode} onChange={(e) => setTest({ ...test, mode: e.target.value as "demo" | "real" })} options={[{ value: "demo", label: "demo" }, { value: "real", label: "real (test player)" }]} />
                </>
              )}
              <Button onClick={runTest} disabled={test.running}>{test.running ? "Running…" : "Run test"}</Button>
            </div>
            {test.result !== undefined && <pre className="max-h-[50vh] overflow-auto rounded-xl border border-white/10 bg-ink-950/80 p-4 font-mono text-[11.5px] leading-relaxed text-white/80">{JSON.stringify(test.result, null, 2)}</pre>}
          </div>
        )}
      </Modal>
    </Card>
  );
}
