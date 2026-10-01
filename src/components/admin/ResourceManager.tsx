"use client";

import { Eye, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Card, Empty, Label, Pagination, Spinner, StatusBadge, Table, inputCls } from "@/components/ui/kit";
import { api, errMsg, fmtDate } from "@/lib/api";
import { ICON_NAMES } from "@/lib/icons";
import type { FieldDef, ResourceDef } from "@/lib/admin/resources";
import type { AdminMe } from "./AdminApp";
import { ProviderGamesDialog } from "./ProviderGamesDialog";

type Row = Record<string, unknown> & { id: string | number };
type ListResp = { items: Row[]; total: number; page: number; pageSize: number; options: Record<string, { value: string; label: string }[]>; canEdit: boolean; canCreate: boolean; canDelete: boolean };

const toLocal = (v: unknown) => (v ? new Date(String(v)).toISOString().slice(0, 16) : "");

function initial(def: ResourceDef, row?: Row) {
  const out: Record<string, unknown> = {};
  for (const f of def.fields) {
    const v = row?.[f.name];
    if (f.type === "json") out[f.name] = v == null ? "" : JSON.stringify(v, null, 2);
    else if (f.type === "tags") out[f.name] = Array.isArray(v) ? v.join(", ") : "";
    else if (f.type === "datetime") out[f.name] = toLocal(v);
    else if (f.type === "multiselect") out[f.name] = Array.isArray(v) ? v.map(String) : [];
    else if (f.type === "boolean") out[f.name] = row ? Boolean(v) : !["reset2fa", "isFeatured", "isPopular", "isNew", "isHot", "requiresProof"].includes(f.name);
    else if (f.type === "password") out[f.name] = "";
    else out[f.name] = v ?? (f.type === "select" && f.options?.[0] && f.required ? f.options[0].value : f.type === "color" ? "#f9cf66" : f.type === "icon" ? "Sparkles" : "");
  }
  return out;
}

function FieldInput({ f, value, onChange, options }: { f: FieldDef; value: unknown; onChange: (v: unknown) => void; options?: { value: string; label: string }[] }) {
  const [filter, setFilter] = useState("");
  const str = (value ?? "") as string;
  switch (f.type) {
    case "textarea":
      return <textarea className={`${inputCls} h-auto min-h-[120px] py-2.5 font-mono text-[12.5px]`} value={str} onChange={(e) => onChange(e.target.value)} />;
    case "json":
      return <textarea className={`${inputCls} h-auto min-h-[90px] py-2.5 font-mono text-[12px]`} value={str} onChange={(e) => onChange(e.target.value)} placeholder="{}" />;
    case "boolean":
      return (
        <button type="button" onClick={() => onChange(!value)} className={`relative h-7 w-12 rounded-full transition ${value ? "bg-gold-gradient" : "bg-white/15"}`} aria-pressed={Boolean(value)}>
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${value ? "left-6" : "left-1"}`} />
        </button>
      );
    case "select": {
      const opts = f.optionsFrom ? [{ value: "", label: "— none —" }, ...(options ?? [])] : f.options ?? [];
      return (
        <select className={inputCls} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
          {opts.map((o) => <option key={o.value} value={o.value} className="bg-ink-800">{o.label}</option>)}
        </select>
      );
    }
    case "icon":
      return (
        <select className={inputCls} value={str} onChange={(e) => onChange(e.target.value)}>
          {ICON_NAMES.map((n) => <option key={n} value={n} className="bg-ink-800">{n}</option>)}
        </select>
      );
    case "multiselect": {
      const sel = new Set((value as string[]) ?? []);
      const list = (options ?? []).filter((o) => o.label.toLowerCase().includes(filter.toLowerCase()));
      return (
        <div className="rounded-xl border border-white/10 bg-ink-950/60 p-2">
          <input className="mb-2 h-8 w-full rounded-lg bg-white/[0.04] px-2.5 text-[12.5px] text-white outline-none" placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <div className="grid max-h-48 gap-1 overflow-y-auto sm:grid-cols-2">
            {list.map((o) => (
              <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[12.5px] text-white/80 hover:bg-white/5">
                <input type="checkbox" className="accent-[#f0b93f]" checked={sel.has(o.value)} onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(o.value); else n.delete(o.value); onChange([...n]); }} />
                {o.label}
              </label>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-white/40">{sel.size} selected</p>
        </div>
      );
    }
    case "image":
      return (
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {str && <img src={str} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover ring-1 ring-white/10" />}
          <input className={inputCls} value={str} onChange={(e) => onChange(e.target.value)} placeholder="/images/… or https://…" />
          <label className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-xl border border-white/10 text-gold-300 hover:border-gold-300/50" title="Upload">
            <Upload className="h-4 w-4" />
            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; const fd = new FormData(); fd.set("file", file); try { const r = await api<{ url: string }>("/api/admin/upload", { form: fd }); onChange(r.url); } catch (err) { alert(errMsg(err)); } }} />
          </label>
        </div>
      );
    case "color":
      return (
        <div className="flex gap-2">
          <input type="color" value={str || "#f9cf66"} onChange={(e) => onChange(e.target.value)} className="h-11 w-14 cursor-pointer rounded-xl border border-white/10 bg-transparent" />
          <input className={inputCls} value={str} onChange={(e) => onChange(e.target.value)} />
        </div>
      );
    case "datetime":
      return <input type="datetime-local" className={inputCls} value={str} onChange={(e) => onChange(e.target.value)} />;
    case "number":
    case "money":
      return <input type="number" step="any" className={inputCls} value={str} onChange={(e) => onChange(e.target.value)} />;
    case "password":
      return <input type="password" className={inputCls} value={str} onChange={(e) => onChange(e.target.value)} autoComplete="new-password" />;
    default:
      return <input className={inputCls} value={str} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder} />;
  }
}

function Cell({ type, v }: { type?: string; v: unknown }) {
  if (type === "boolean") return <StatusBadge status={v ? "active" : "inactive"} />;
  if (type === "badge") return <StatusBadge status={String(v ?? "")} />;
  // eslint-disable-next-line @next/next/no-img-element
  if (type === "image") return v ? <img src={String(v)} alt="" className="h-9 w-9 rounded-lg object-cover ring-1 ring-white/10" /> : <span className="block h-9 w-9 rounded-lg bg-white/5" />;
  if (type === "money") return <span className="tabular-nums">{Number(v ?? 0).toFixed(2)}</span>;
  if (type === "date") return <span className="text-white/55">{v ? fmtDate(String(v), false) : "—"}</span>;
  if (type === "list") return <span className="text-white/60">{Array.isArray(v) ? v.join(", ") : ""}</span>;
  return <span className="line-clamp-1 max-w-[260px]">{v == null || v === "" ? "—" : String(v)}</span>;
}

export function ResourceManager({ resource: def, me }: { resource: ResourceDef; me: AdminMe }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResp | null>(null);
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [providerGames, setProviderGames] = useState<Row | null>(null);
  void me;

  const load = async () => {
    try {
      setData(await api<ListResp>(`/api/admin/resources/${def.key}?q=${encodeURIComponent(q)}&page=${page}`));
    } catch (e) {
      setError(errMsg(e));
    }
  };
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def.key, q, page]);

  const open = (row: Row | "new") => {
    setEditing(row);
    setForm(initial(def, row === "new" ? undefined : row));
    setError(null);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      for (const f of def.fields) {
        let v = form[f.name];
        if (f.type === "datetime" && v) v = new Date(String(v)).toISOString();
        if (f.type === "password" && !v) continue;
        body[f.name] = v;
      }
      if (editing === "new") await api(`/api/admin/resources/${def.key}`, { body });
      else if (editing) await api(`/api/admin/resources/${def.key}/${editing.id}`, { method: "PATCH", body });
      setEditing(null);
      load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: Row) => {
    if (!confirm(`Delete this ${def.singular.toLowerCase()}? This cannot be undone.`)) return;
    try {
      await api(`/api/admin/resources/${def.key}/${row.id}`, { method: "DELETE" });
      load();
    } catch (e) {
      alert(errMsg(e));
    }
  };

  return (
    <Card
      title={def.label}
      action={
        <div className="flex items-center gap-2">
          <label className="relative hidden sm:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <input className={`${inputCls} h-9 w-56 pl-9`} placeholder="Search…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </label>
          {data?.canCreate && <Button size="sm" iconLeft={<Plus className="relative h-4 w-4" />} onClick={() => open("new")}>New</Button>}
        </div>
      }
    >
      {!data ? (error ? <p className="text-rose-300">{error}</p> : <Spinner />) : !data.items.length ? <Empty /> : (
        <Table head={[...def.columns.map((c) => c.label), ""]}>
          {data.items.map((row) => (
            <tr key={String(row.id)} className="text-white/80">
              {def.columns.map((c) => <td key={c.name}><Cell type={c.type} v={row[c.name]} /></td>)}
              <td className="whitespace-nowrap text-right">
                {def.key === "providers" && <button onClick={() => setProviderGames(row)} className="mr-2 inline-grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-white/70 hover:text-gold-200" aria-label={`View games for ${String(row.name)}`} title="View Games"><Eye className="h-3.5 w-3.5" /></button>}
                {data.canEdit && <button onClick={() => open(row)} className="mr-2 inline-grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-white/70 hover:text-gold-200" aria-label="Edit"><Pencil className="h-3.5 w-3.5" /></button>}
                {data.canDelete && <button onClick={() => remove(row)} className="inline-grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-white/70 hover:text-rose-300" aria-label="Delete"><Trash2 className="h-3.5 w-3.5" /></button>}
              </td>
            </tr>
          ))}
        </Table>
      )}
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}

      <Modal open={editing !== null} onClose={() => setEditing(null)} label={def.singular} maxWidth="md:max-w-[860px]">
        <div className="p-5 md:p-7">
          <h2 className="font-display text-[24px] font-semibold text-white">{editing === "new" ? `New ${def.singular}` : `Edit ${def.singular}`}</h2>
          <div className="mt-5 grid gap-3.5 md:grid-cols-2">
            {def.fields.map((f) => (
              <div key={f.name} className={f.full || f.type === "multiselect" || f.type === "textarea" || f.type === "json" ? "md:col-span-2" : ""}>
                <Label label={`${f.label}${f.required ? " *" : ""}`} hint={f.help}>
                  <FieldInput f={f} value={form[f.name]} onChange={(v) => setForm((p) => ({ ...p, [f.name]: v }))} options={f.optionsFrom ? data?.options[f.optionsFrom] : undefined} />
                </Label>
              </div>
            ))}
          </div>
          {error && <p className="mt-4 rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-[12.5px] text-rose-200">{error}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      </Modal>
      {providerGames && <ProviderGamesDialog key={String(providerGames.id)} providerId={Number(providerGames.id)} canEdit={data?.canEdit ?? false} onClose={() => setProviderGames(null)} />}
    </Card>
  );
}
