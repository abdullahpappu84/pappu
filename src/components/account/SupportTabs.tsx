"use client";

import { ArrowLeft, Bell, FileCheck2, FileUp, Headset, LifeBuoy, MessageCircle, Send } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { Button } from "@/components/ui/Button";
import { Card, Empty, Input, Label, Pagination, Select, Spinner, StatusBadge, Table, Textarea, useApi, inputCls } from "@/components/ui/kit";
import { api, errMsg, fmtDate } from "@/lib/api";

type Ticket = { id: string; reference: string; subject: string; category: string; status: string; lastMessageAt: string };
type Msg = { id: string; senderType: string; senderName: string | null; body: string; createdAt: string };

export function SupportTab() {
  const { notify, setChatOpen, go } = useApp();
  const list = useApi<{ items: Ticket[] }>("/api/me/tickets");
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState({ subject: "", category: "general", message: "" });
  const thread = useApi<{ ticket: Ticket; messages: Msg[] }>(open ? `/api/me/tickets/${open}` : null);
  const [reply, setReply] = useState("");

  const create = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api("/api/me/tickets", { body: form });
      notify({ title: "Ticket created", description: "Our team will reply shortly.", tone: "success" });
      setForm({ subject: "", category: "general", message: "" });
      list.reload();
    } catch (err) {
      notify({ title: "Failed", description: errMsg(err), tone: "info" });
    }
  };
  const send = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api(`/api/me/tickets/${open}/messages`, { body: { body: reply } });
      setReply("");
      thread.reload();
      list.reload();
    } catch (err) {
      notify({ title: "Failed", description: errMsg(err), tone: "info" });
    }
  };

  if (open)
    return (
      <Card title={thread.data?.ticket.subject ?? "Ticket"} icon={<button onClick={() => setOpen(null)} aria-label="Back"><ArrowLeft className="h-5 w-5" /></button>} action={thread.data && <StatusBadge status={thread.data.ticket.status} />}>
        {!thread.data ? <Spinner /> : (
          <>
            <div className="max-h-[420px] space-y-2.5 overflow-y-auto pr-1">
              {thread.data.messages.map((m) => (
                <div key={m.id} className={`flex ${m.senderType === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-[13px] ${m.senderType === "user" ? "bg-gold-gradient text-ink-950" : "border border-white/10 bg-ink-700 text-white"}`}>
                    <p className={`mb-0.5 text-[10.5px] font-semibold ${m.senderType === "user" ? "text-ink-950/60" : "text-gold-300"}`}>{m.senderName} · {fmtDate(m.createdAt)}</p>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                  </div>
                </div>
              ))}
            </div>
            {thread.data.ticket.status !== "closed" && (
              <form onSubmit={send} className="mt-3 flex gap-2">
                <input className={inputCls} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply…" required />
                <Button type="submit" aria-label="Send"><Send className="relative h-4 w-4" /></Button>
              </form>
            )}
          </>
        )}
      </Card>
    );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <button onClick={() => setChatOpen(true)} className="panel flex items-center gap-3 rounded-2xl p-4 text-left hover:border-gold-300/40"><MessageCircle className="h-6 w-6 text-sky-300" /><span><b className="block text-white">Live chat</b><span className="text-[12px] text-white/50">Instant help, 24/7</span></span></button>
        <button onClick={() => go("/p/faq")} className="panel flex items-center gap-3 rounded-2xl p-4 text-left hover:border-gold-300/40"><LifeBuoy className="h-6 w-6 text-gold-300" /><span><b className="block text-white">FAQ</b><span className="text-[12px] text-white/50">Quick answers</span></span></button>
        <button onClick={() => go("/p/contact")} className="panel flex items-center gap-3 rounded-2xl p-4 text-left hover:border-gold-300/40"><Headset className="h-6 w-6 text-emerald-300" /><span><b className="block text-white">Contact</b><span className="text-[12px] text-white/50">Email & phone</span></span></button>
      </div>
      <Card title="Open a support ticket" icon={<Headset className="h-5 w-5" />}>
        <form onSubmit={create} className="grid gap-3 sm:grid-cols-2">
          <Input label="Subject" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} required minLength={3} />
          <Select label="Category" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} options={["general", "payments", "bonuses", "account", "technical", "kyc"].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))} />
          <div className="sm:col-span-2"><Textarea label="Message" value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} required minLength={5} /></div>
          <div><Button type="submit">Submit ticket</Button></div>
        </form>
      </Card>
      <Card title="Ticket history">
        {!list.data ? <Spinner /> : (
          <Table head={["Reference", "Subject", "Category", "Status", "Last update", ""]} empty={!list.data.items.length}>
            {list.data.items.map((t) => (
              <tr key={t.id} className="text-white/80">
                <td className="font-mono text-[11.5px]">{t.reference}</td>
                <td>{t.subject}</td>
                <td className="capitalize text-white/55">{t.category}</td>
                <td><StatusBadge status={t.status} /></td>
                <td className="text-white/55">{fmtDate(t.lastMessageAt)}</td>
                <td><button onClick={() => setOpen(t.id)} className="text-[12px] text-gold-300 hover:underline">Open</button></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

export function NotificationsTab() {
  const { go, markAllRead } = useApp();
  const [page, setPage] = useState(1);
  const { data, reload } = useApi<{ items: { id: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string; type: string }[]; total: number; page: number; pageSize: number }>(`/api/me/notifications?page=${page}`);
  return (
    <Card title="Notifications" icon={<Bell className="h-5 w-5" />} action={<button onClick={() => markAllRead().then(reload)} className="text-[12px] text-gold-300">Mark all read</button>}>
      {!data ? <Spinner /> : !data.items.length ? <Empty text="No notifications yet." /> : (
        <ul className="divide-y divide-white/[0.05]">
          {data.items.map((n) => (
            <li key={n.id}>
              <button onClick={() => n.link && go(n.link)} className="flex w-full items-start gap-3 py-3 text-left">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-white/15" : "bg-gold-300"}`} />
                <span className="flex-1">
                  <span className="block text-[13.5px] text-white">{n.title}</span>
                  {n.body && <span className="block text-[12.5px] text-white/55">{n.body}</span>}
                  <span className="mt-0.5 block text-[11px] capitalize text-white/35">{n.type} · {fmtDate(n.createdAt)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
    </Card>
  );
}

function FilePick({ label, name, required, file, onFile }: { label: string; name: string; required?: boolean; file: File | null; onFile: (f: File | null) => void }) {
  return (
    <Label label={`${label}${required ? " *" : ""}`} hint="JPG, PNG, WEBP or PDF · max 8MB">
      <label className={`${inputCls} flex cursor-pointer items-center gap-2 text-white/60`}>
        <FileUp className="h-4 w-4 text-gold-300" />
        <span className="truncate">{file?.name ?? "Choose file…"}</span>
        <input name={name} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      </label>
    </Label>
  );
}

export function KycTab() {
  const { notify, refreshUser } = useApp();
  const { data, reload } = useApi<{ status: string; submission: { status: string; adminNote: string | null; createdAt: string; documentType: string } | null }>("/api/me/kyc");
  const [f, setF] = useState({ fullName: "", dateOfBirth: "", country: "", address: "", documentType: "passport", documentNumber: "" });
  const [files, setFiles] = useState<Record<string, File | null>>({ front: null, back: null, selfie: null });
  const [busy, setBusy] = useState(false);
  const canSubmit = data && ["none", "rejected", "resubmission"].includes(data.status);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const fd = new FormData();
      Object.entries(f).forEach(([k, v]) => fd.set(k, v));
      Object.entries(files).forEach(([k, v]) => v && fd.set(k, v));
      await api("/api/me/kyc", { form: fd });
      notify({ title: "Documents submitted", description: "We'll review them within 24 hours.", tone: "success" });
      reload();
      refreshUser();
    } catch (err) {
      notify({ title: "Submission failed", description: errMsg(err), tone: "info" });
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <Spinner />;
  return (
    <div className="space-y-4">
      <Card title="Identity verification" icon={<FileCheck2 className="h-5 w-5" />} action={<StatusBadge status={data.status} />}>
        <p className="text-[13px] text-white/65">
          {data.status === "approved" ? "Your identity is verified. Thank you!" : data.status === "pending" || data.status === "under_review" ? "Your documents are being reviewed. We'll notify you once complete." : "Verify your identity to unlock withdrawals and higher limits."}
        </p>
        {data.submission?.adminNote && <p className="mt-2 rounded-xl border border-orange-400/20 bg-orange-500/10 p-3 text-[12.5px] text-orange-100">Reviewer note: {data.submission.adminNote}</p>}
      </Card>
      {canSubmit && (
        <Card title="Submit documents">
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
            <Input label="Full legal name" value={f.fullName} onChange={(e) => setF((p) => ({ ...p, fullName: e.target.value }))} required />
            <Input label="Date of birth" type="date" value={f.dateOfBirth} onChange={(e) => setF((p) => ({ ...p, dateOfBirth: e.target.value }))} required />
            <Input label="Country" value={f.country} onChange={(e) => setF((p) => ({ ...p, country: e.target.value }))} required />
            <Input label="Address" value={f.address} onChange={(e) => setF((p) => ({ ...p, address: e.target.value }))} required />
            <Select label="Document type" value={f.documentType} onChange={(e) => setF((p) => ({ ...p, documentType: e.target.value }))} options={[{ value: "passport", label: "Passport" }, { value: "national_id", label: "National ID" }, { value: "driving_licence", label: "Driving licence" }]} />
            <Input label="Document number" value={f.documentNumber} onChange={(e) => setF((p) => ({ ...p, documentNumber: e.target.value }))} required />
            <FilePick label="Document front" name="front" required file={files.front} onFile={(x) => setFiles((p) => ({ ...p, front: x }))} />
            <FilePick label="Document back" name="back" file={files.back} onFile={(x) => setFiles((p) => ({ ...p, back: x }))} />
            <FilePick label="Selfie with document" name="selfie" file={files.selfie} onFile={(x) => setFiles((p) => ({ ...p, selfie: x }))} />
            <div className="self-end"><Button type="submit" disabled={busy || !files.front}>{busy ? "Uploading…" : "Submit for review"}</Button></div>
          </form>
        </Card>
      )}
    </div>
  );
}
