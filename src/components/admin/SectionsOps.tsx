"use client";

import { Lock, Send, Upload } from "lucide-react";
import { BrandProvider } from "@/components/ui/BrandContext";
import { Logo, LogoMark } from "@/components/ui/Logo";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, Empty, Input, Label, Pagination, Select, Spinner, StatusBadge, Table, Textarea, useApi, inputCls } from "@/components/ui/kit";
import { api, errMsg, fmtDate } from "@/lib/api";
import { canDo, type AdminMe } from "./AdminApp";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = Record<string, any>;

export function TicketsSection({ me }: { me: AdminMe }) {
  const [f, setF] = useState({ status: "active", channel: "", q: "", mine: "" });
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const list = useApi<Any>(`/api/admin/tickets?${qs}`);
  const [sel, setSel] = useState<string | null>(null);
  const thread = useApi<Any>(sel ? `/api/admin/tickets/${sel}` : null);
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);

  useEffect(() => {
    const iv = setInterval(() => { list.reload(); if (sel) thread.reload(); }, 6000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, qs]);

  const send = async () => {
    if (!body.trim()) return;
    try { await api(`/api/admin/tickets/${sel}/messages`, { body: { body, internal } }); setBody(""); thread.reload(); list.reload(); } catch (e) { alert(errMsg(e)); }
  };
  const patch = async (b: Any) => {
    try { await api(`/api/admin/tickets/${sel}`, { method: "PATCH", body: b }); thread.reload(); list.reload(); } catch (e) { alert(errMsg(e)); }
  };
  const t = thread.data?.ticket;

  return (
    <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
      <Card title="Inbox">
        <div className="mb-3 grid grid-cols-2 gap-2">
          <Select value={f.status} onChange={(e) => setF((p) => ({ ...p, status: e.target.value }))} options={[{ value: "active", label: "Active" }, { value: "", label: "All" }, ...["open", "pending", "in_progress", "resolved", "closed"].map((v) => ({ value: v, label: v.replace("_", " ") }))]} />
          <Select value={f.channel} onChange={(e) => setF((p) => ({ ...p, channel: e.target.value }))} options={[{ value: "", label: "Chat + tickets" }, { value: "chat", label: "Live chat" }, { value: "ticket", label: "Tickets" }]} />
          <input className={`${inputCls} col-span-2`} placeholder="Search…" value={f.q} onChange={(e) => setF((p) => ({ ...p, q: e.target.value }))} />
          <label className="col-span-2 flex items-center gap-2 text-[12px] text-white/60"><input type="checkbox" className="accent-[#f0b93f]" checked={!!f.mine} onChange={(e) => setF((p) => ({ ...p, mine: e.target.checked ? "1" : "" }))} /> Assigned to me</label>
        </div>
        {!list.data ? <Spinner /> : !list.data.items.length ? <Empty /> : (
          <ul className="-mx-2 max-h-[60vh] space-y-1 overflow-y-auto">
            {list.data.items.map((x: Any) => (
              <li key={x.id}>
                <button onClick={() => setSel(x.id)} className={`w-full rounded-xl px-3 py-2.5 text-left ${sel === x.id ? "bg-gold-400/10 ring-1 ring-gold-300/40" : "hover:bg-white/[0.03]"}`}>
                  <div className="flex items-center justify-between gap-2"><span className="truncate text-[13px] text-white">{x.subject}</span><StatusBadge status={x.status} /></div>
                  <p className="mt-0.5 truncate text-[11.5px] text-white/45">{x.channel === "chat" ? "💬 " : "🎫 "}{x.userName} · {x.agent ?? "unassigned"} · {fmtDate(x.lastMessageAt)}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title={t ? `${t.reference} · ${t.subject}` : "Conversation"}>
        {!sel ? <Empty text="Select a conversation." /> : !thread.data ? <Spinner /> : (
          <>
            <div className="mb-3 grid gap-2 sm:grid-cols-3">
              <Select value={t.status} onChange={(e) => patch({ status: e.target.value })} options={["open", "pending", "in_progress", "resolved", "closed"].map((v) => ({ value: v, label: v.replace("_", " ") }))} />
              <Select value={t.priority} onChange={(e) => patch({ priority: e.target.value })} options={["low", "normal", "high", "urgent"].map((v) => ({ value: v, label: `Priority: ${v}` }))} />
              <Select value={t.assignedTo ?? ""} disabled={!canDo(me, "support.assign")} onChange={(e) => patch({ assignedTo: e.target.value || null })} options={[{ value: "", label: "Unassigned" }, ...thread.data.agents.map((a: Any) => ({ value: a.id, label: a.name }))]} />
            </div>
            <p className="mb-2 text-[12px] text-white/45">Player: {t.userName} ({t.userEmail}) · {t.channel}</p>
            <div className="max-h-[48vh] space-y-2 overflow-y-auto rounded-xl bg-ink-950/40 p-3">
              {thread.data.messages.map((m: Any) => (
                <div key={m.id} className={`flex ${m.senderType === "admin" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-[13px] ${m.isInternal ? "border border-dashed border-amber-300/40 bg-amber-500/10 text-amber-100" : m.senderType === "admin" ? "bg-gold-gradient text-ink-950" : m.senderType === "system" ? "bg-white/5 italic text-white/55" : "border border-white/10 bg-ink-700 text-white"}`}>
                    <p className="mb-0.5 text-[10.5px] font-semibold opacity-70">{m.isInternal && <Lock className="mr-1 inline h-3 w-3" />}{m.senderName} · {fmtDate(m.createdAt)}</p>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                  </div>
                </div>
              ))}
            </div>
            {canDo(me, "support.reply") && (
              <div className="mt-3 space-y-2">
                <Select value="" onChange={(e) => e.target.value && setBody(e.target.value)} options={[{ value: "", label: "Insert canned response…" }, ...thread.data.canned.map((c: Any) => ({ value: c.body, label: c.title }))]} />
                <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={internal ? "Internal note (hidden from player)" : "Reply to player…"} />
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-[12.5px] text-white/65"><input type="checkbox" className="accent-[#f0b93f]" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> Internal note</label>
                  <Button size="sm" iconLeft={<Send className="relative h-4 w-4" />} onClick={send}>Send</Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

export function NotificationsSection() {
  const meta = useApi<Any>("/api/admin/meta");
  const [f, setF] = useState<Any>({ target: "all", email: "", userIds: "", status: "", vipLevelId: "", kycStatus: "", marketingOnly: true, type: "promotion", title: "", body: "", link: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const set = (k: string) => (e: { target: { value: string } }) => setF((p: Any) => ({ ...p, [k]: e.target.value }));
  const send = async () => {
    try {
      const r = await api<{ sent: number }>("/api/admin/notifications/send", {
        body: {
          target: f.target, email: f.email || undefined, userIds: f.target === "users" ? f.userIds.split(/[\s,]+/).filter(Boolean) : undefined,
          group: f.target === "group" ? { status: f.status || undefined, vipLevelId: f.vipLevelId ? Number(f.vipLevelId) : undefined, kycStatus: f.kycStatus || undefined, marketingOnly: f.marketingOnly } : undefined,
          type: f.type, title: f.title, body: f.body || undefined, link: f.link || undefined,
        },
      });
      setMsg(`✔ Sent to ${r.sent} user(s).`);
    } catch (e) { setMsg(`✖ ${errMsg(e)}`); }
  };
  return (
    <Card title="Send notification">
      <div className="grid gap-3 md:grid-cols-2">
        <Select label="Audience" value={f.target} onChange={set("target")} options={[{ value: "all", label: "All eligible users" }, { value: "group", label: "User group" }, { value: "user", label: "Individual user (email)" }, { value: "users", label: "Selected users (IDs)" }]} />
        <Select label="Type" value={f.type} onChange={set("type")} options={["promotion", "system", "bonus", "deposit", "withdrawal", "security", "support", "kyc"].map((v) => ({ value: v, label: v }))} />
        {f.target === "user" && <Input label="User email" value={f.email} onChange={set("email")} />}
        {f.target === "users" && <div className="md:col-span-2"><Textarea label="User IDs (comma or newline separated)" value={f.userIds} onChange={set("userIds")} /></div>}
        {f.target === "group" && (
          <>
            <Select label="Status" value={f.status} onChange={set("status")} options={[{ value: "", label: "Any" }, ...["active", "suspended", "pending"].map((v) => ({ value: v, label: v }))]} />
            <Select label="VIP level" value={f.vipLevelId} onChange={set("vipLevelId")} options={[{ value: "", label: "Any" }, ...((meta.data?.vipLevels ?? []) as Any[]).map((l) => ({ value: l.id, label: l.name }))]} />
            <Select label="KYC" value={f.kycStatus} onChange={set("kycStatus")} options={[{ value: "", label: "Any" }, ...["none", "pending", "approved", "rejected"].map((v) => ({ value: v, label: v }))]} />
            <label className="flex items-center gap-2 self-end pb-3 text-[13px] text-white/70"><input type="checkbox" className="accent-[#f0b93f]" checked={f.marketingOnly} onChange={(e) => setF((p: Any) => ({ ...p, marketingOnly: e.target.checked }))} /> Marketing opt-in only</label>
          </>
        )}
        <div className="md:col-span-2"><Input label="Title" value={f.title} onChange={set("title")} /></div>
        <div className="md:col-span-2"><Textarea label="Message" value={f.body} onChange={set("body")} /></div>
        <Input label="Link (optional)" value={f.link} onChange={set("link")} placeholder="/account?tab=bonuses" />
      </div>
      <Button className="mt-4" iconLeft={<Send className="relative h-4 w-4" />} onClick={send} disabled={!f.title}>Send notification</Button>
      {msg && <p className="mt-3 text-[13px] text-white/70">{msg}</p>}
    </Card>
  );
}

const LONG = new Set(["message", "metaDescription", "robotsDisallow", "address", "keywords"]);

const IMAGE_FIELDS: Record<string, string> = {
  logoUrl: "Main logo. Transparent PNG/WEBP recommended, ~400×100 px (wide). Leave empty to use the text logo (name + tagline).",
  iconUrl: "Square icon, ~256×256 px transparent PNG. Replaces the crown mark in small places.",
  faviconUrl: "Browser tab icon. Square PNG, 64×64 or 180×180 px.",
  ogImage: "Social share image (Facebook/WhatsApp/X). 1200×630 px JPG/PNG.",
};

function ImageSetting({ label, hint, value, onChange, disabled }: { label: string; hint: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const upload = async (file: File) => {
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const r = await api<{ url: string }>("/api/admin/upload", { form: fd });
      onChange(r.url);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="md:col-span-2">
      <Label label={label} hint={err ?? hint}>
        <div className="flex items-center gap-2">
          <span className="grid h-14 w-24 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/10 bg-[repeating-conic-gradient(#1a1f2e_0_25%,#0f121c_0_50%)] bg-[length:14px_14px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {value ? <img src={value} alt="" className="max-h-12 max-w-[88px] object-contain" /> : <span className="text-[10px] text-white/35">none</span>}
          </span>
          <input className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} placeholder="/api/files/public/media/… or https://…" disabled={disabled} />
          <label className={`inline-flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-gold-300/40 px-3.5 text-[12.5px] font-semibold text-gold-200 hover:bg-gold-400/10 ${disabled ? "pointer-events-none opacity-50" : ""}`}>
            <Upload className="h-4 w-4" /> {busy ? "Uploading…" : "Upload"}
            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={disabled} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </label>
          {value && !disabled && (
            <button type="button" onClick={() => onChange("")} className="h-11 shrink-0 rounded-xl border border-white/10 px-3 text-[12px] text-white/60 hover:text-rose-300">Remove</button>
          )}
        </div>
      </Label>
    </div>
  );
}

function LogoPreview({ site }: { site: Any }) {
  return (
    <div className="mb-5 rounded-2xl border border-white/10 bg-ink-950/60 p-4">
      <p className="mb-3 text-[11px] uppercase tracking-wider text-white/45">Live preview (save to apply on the site)</p>
      <BrandProvider brand={site}>
        <div className="flex flex-wrap items-center gap-8">
          <div><p className="mb-1.5 text-[10px] text-white/35">Desktop header</p><Logo size="md" /></div>
          <div><p className="mb-1.5 text-[10px] text-white/35">Mobile header</p><Logo size="sm" /></div>
          <div><p className="mb-1.5 text-[10px] text-white/35">Icon</p><LogoMark className="h-9 w-9" /></div>
        </div>
      </BrandProvider>
    </div>
  );
}

export function SettingsSection({ me }: { me: AdminMe }) {
  const { data, reload } = useApi<Any>("/api/admin/settings");
  const [group, setGroup] = useState("site");
  const [draft, setDraft] = useState<Any>({});
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { if (data) setDraft(structuredClone(data.settings[group])); }, [data, group]);
  if (!data) return <Spinner />;
  const groups = Object.keys(data.defaults);
  const editable = canDo(me, "settings.edit") || (["withdrawal", "deposit"].includes(group) && canDo(me, "finance.settings"));

  const field = (k: string, v: unknown, path: string[] = []) => {
    const setVal = (val: unknown) => setDraft((d: Any) => { const n = structuredClone(d); let o = n; for (const p of path) o = o[p]; o[k] = val; return n; });
    if (typeof v === "boolean") return <label key={k} className="flex items-center justify-between rounded-xl border border-white/10 px-3.5 py-2.5 text-[13px] text-white/80"><span>{k}</span><input type="checkbox" className="h-4 w-4 accent-[#f0b93f]" checked={v} onChange={(e) => setVal(e.target.checked)} disabled={!editable} /></label>;
    if (typeof v === "number") return <Input key={k} label={k} type="number" step="any" value={String(v)} onChange={(e) => setVal(Number(e.target.value))} disabled={!editable} />;
    if (v && typeof v === "object") return <div key={k} className="md:col-span-2"><p className="mb-2 text-[11.5px] uppercase tracking-wider text-white/50">{k}</p><div className="grid gap-3 md:grid-cols-2">{Object.entries(v).map(([kk, vv]) => field(kk, vv, [...path, k]))}</div></div>;
    if (LONG.has(k)) return <div key={k} className="md:col-span-2"><Textarea label={k} value={String(v ?? "")} onChange={(e) => setVal(e.target.value)} disabled={!editable} /></div>;
    if (IMAGE_FIELDS[k]) return <ImageSetting key={k} label={k} hint={IMAGE_FIELDS[k]} value={String(v ?? "")} onChange={setVal} disabled={!editable} />;
    return <Input key={k} label={k} value={String(v ?? "")} onChange={(e) => setVal(e.target.value)} disabled={!editable} />;
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[200px_1fr]">
      <nav className="flex gap-1.5 overflow-x-auto no-scrollbar lg:flex-col">
        {groups.map((g) => <button key={g} onClick={() => { setGroup(g); setMsg(null); }} className={`shrink-0 rounded-lg px-3 py-2 text-left text-[13px] capitalize ${group === g ? "bg-gold-400/15 text-gold-200" : "text-white/65 hover:bg-white/5"}`}>{g === "seo" ? "SEO" : g}</button>)}
      </nav>
      <Card title={`${group === "seo" ? "SEO" : group[0].toUpperCase() + group.slice(1)} settings`}>
        {group === "site" && draft && <LogoPreview site={draft} />}
        <div className="grid gap-3 md:grid-cols-2">{Object.entries(draft ?? {}).map(([k, v]) => field(k, v))}</div>
        {group === "seo" && <p className="mt-3 text-[12px] text-white/45">Sitemap: <a href="/sitemap.xml" target="_blank" className="text-gold-300">/sitemap.xml</a> · Robots: <a href="/robots.txt" target="_blank" className="text-gold-300">/robots.txt</a></p>}
        {editable && <Button className="mt-4" onClick={async () => { try { await api(`/api/admin/settings/${group}`, { method: "PUT", body: draft }); setMsg("✔ Saved"); reload(); } catch (e) { setMsg(`✖ ${errMsg(e)}`); } }}>Save settings</Button>}
        {msg && <p className="mt-2 text-[13px] text-white/70">{msg}</p>}
        <Label label=" "><span /></Label>
      </Card>
    </div>
  );
}

export function AuditSection() {
  const [f, setF] = useState({ q: "", from: "", to: "", page: 1 });
  const qs = new URLSearchParams(Object.entries({ ...f, page: String(f.page) }).filter(([, v]) => v)).toString();
  const { data } = useApi<Any>(`/api/admin/audit-logs?${qs}`);
  return (
    <Card title="Audit log">
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <input className={inputCls} placeholder="Action, admin, target, description" value={f.q} onChange={(e) => setF((p) => ({ ...p, q: e.target.value, page: 1 }))} />
        <input type="date" className={inputCls} value={f.from} onChange={(e) => setF((p) => ({ ...p, from: e.target.value, page: 1 }))} />
        <input type="date" className={inputCls} value={f.to} onChange={(e) => setF((p) => ({ ...p, to: e.target.value, page: 1 }))} />
      </div>
      {!data ? <Spinner /> : (
        <Table head={["Date / time", "Admin", "Action", "Target", "IP", "Description"]} empty={!data.items.length}>
          {data.items.map((l: Any) => <tr key={l.id} className="text-white/80"><td className="whitespace-nowrap text-white/55">{fmtDate(l.createdAt)}</td><td>{l.adminEmail ?? "system"}</td><td className="font-mono text-[11.5px] text-gold-200">{l.action}</td><td className="text-white/55">{l.targetType ? `${l.targetType}:${String(l.targetId ?? "").slice(0, 10)}` : "—"}</td><td className="text-white/55">{l.ip ?? "—"}</td><td className="max-w-[360px] truncate">{l.description}</td></tr>)}
        </Table>
      )}
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(page) => setF((p) => ({ ...p, page }))} />}
    </Card>
  );
}
