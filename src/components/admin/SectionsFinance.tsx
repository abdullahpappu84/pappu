"use client";

import { Download, Search } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Card, Input, Pagination, Select, Spinner, StatusBadge, Table, Textarea, useApi, inputCls } from "@/components/ui/kit";
import { api, errMsg, fmtDate, money } from "@/lib/api";
import { canDo, type AdminMe } from "./AdminApp";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = Record<string, any>;

function Filters({ f, setF, statuses, methods }: { f: Any; setF: (fn: (p: Any) => Any) => void; statuses: string[]; methods?: { id: number; name: string }[] }) {
  const set = (k: string) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value, page: 1 }));
  return (
    <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
      <label className="relative lg:col-span-2"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" /><input className={`${inputCls} pl-9`} placeholder="Reference, user email or name" value={f.q} onChange={set("q")} /></label>
      <Select value={f.status} onChange={set("status")} options={[{ value: "", label: "All statuses" }, ...statuses.map((s) => ({ value: s, label: s }))]} />
      {methods ? <Select value={f.method} onChange={set("method")} options={[{ value: "", label: "All methods" }, ...methods.map((m) => ({ value: m.id, label: m.name }))]} /> : <span />}
      <div className="flex gap-2"><input type="date" className={inputCls} value={f.from} onChange={set("from")} aria-label="From" /><input type="date" className={inputCls} value={f.to} onChange={set("to")} aria-label="To" /></div>
    </div>
  );
}

const qsOf = (f: Any) => new URLSearchParams(Object.entries({ ...f, page: String(f.page) }).filter(([, v]) => v)).toString();

export function DepositsSection({ me }: { me: AdminMe }) {
  const [f, setF] = useState<Any>({ q: "", status: "pending", method: "", from: "", to: "", page: 1 });
  const { data, reload } = useApi<Any>(`/api/admin/deposits?${qsOf(f)}`);
  const [open, setOpen] = useState<Any | null>(null);
  const [note, setNote] = useState("");
  const act = async (path: string, body: Any) => {
    try { await api(path, { body }); setOpen(null); reload(); } catch (e) { alert(errMsg(e)); }
  };
  return (
    <Card title="Deposits">
      <Filters f={f} setF={setF} statuses={["pending", "approved", "rejected", "cancelled"]} methods={data?.methods} />
      {!data ? <Spinner /> : (
        <Table head={["Date", "Reference", "User", "Method", "Amount", "Promo/Bonus", "Status", ""]} empty={!data.items.length}>
          {data.items.map((d: Any) => (
            <tr key={d.id} className="text-white/80">
              <td className="text-white/55">{fmtDate(d.createdAt)}</td><td className="font-mono text-[11px]">{d.reference}</td><td>{d.userName}<p className="text-[11px] text-white/45">{d.userEmail}</p></td><td>{d.method}</td>
              <td className="font-semibold tabular-nums text-white">{money(d.amount)}</td><td className="text-white/55">{d.promoCode ?? (d.bonusId ? `Bonus #${d.bonusId}` : "—")}</td><td><StatusBadge status={d.status} /></td>
              <td><button onClick={() => { setOpen(d); setNote(d.adminNote ?? ""); }} className="text-[12px] text-gold-300 hover:underline">Review</button></td>
            </tr>
          ))}
        </Table>
      )}
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(page) => setF((p) => ({ ...p, page }))} />}
      <Modal open={!!open} onClose={() => setOpen(null)} label="Deposit review">
        {open && (
          <div className="space-y-3 p-6">
            <h3 className="font-display text-[24px] text-white">{open.reference}</h3>
            <p className="text-[13px] text-white/65">{open.userName} ({open.userEmail}) · {open.method} · <b className="text-white">{money(open.amount)}</b> (fee {money(open.fee)})</p>
            {open.userNote && <p className="text-[12.5px] text-white/55">Player note: {open.userNote}</p>}
            {open.proofUrl ? <a href={open.proofUrl} target="_blank" rel="noreferrer" className="inline-block text-[13px] text-gold-300 underline">View payment proof ↗</a> : <p className="text-[12.5px] text-white/40">No proof uploaded.</p>}
            <Textarea label="Admin note" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              {open.status === "pending" && canDo(me, "finance.approve") && <Button size="sm" onClick={() => act(`/api/admin/deposits/${open.id}/approve`, { note })}>Approve &amp; credit</Button>}
              {open.status === "pending" && canDo(me, "finance.reject") && <Button size="sm" variant="outline" className="text-rose-300" onClick={() => act(`/api/admin/deposits/${open.id}/reject`, { note })}>Reject</Button>}
              <Button size="sm" variant="outline" onClick={() => act(`/api/admin/deposits/${open.id}/note`, { note })}>Save note</Button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}

export function WithdrawalsSection({ me }: { me: AdminMe }) {
  const [f, setF] = useState<Any>({ q: "", status: "pending", method: "", from: "", to: "", page: 1 });
  const { data, reload } = useApi<Any>(`/api/admin/withdrawals?${qsOf(f)}`);
  const [open, setOpen] = useState<Any | null>(null);
  const [note, setNote] = useState("");
  const setStatus = async (status: string) => {
    try { await api(`/api/admin/withdrawals/${open!.id}/status`, { body: { status, note: note || undefined } }); setOpen(null); reload(); } catch (e) { alert(errMsg(e)); }
  };
  const next: Record<string, string[]> = { pending: ["processing", "approved", "completed", "rejected"], processing: ["approved", "completed", "rejected"], approved: ["processing", "completed", "rejected"] };
  return (
    <Card title="Withdrawals">
      <Filters f={f} setF={setF} statuses={["pending", "processing", "approved", "completed", "rejected", "cancelled"]} methods={data?.methods} />
      {!data ? <Spinner /> : (
        <Table head={["Date", "Reference", "User", "Method", "Amount", "Net", "KYC", "Status", ""]} empty={!data.items.length}>
          {data.items.map((w: Any) => (
            <tr key={w.id} className="text-white/80">
              <td className="text-white/55">{fmtDate(w.createdAt)}</td><td className="font-mono text-[11px]">{w.reference}</td><td>{w.userName}<p className="text-[11px] text-white/45">{w.userEmail}</p></td><td>{w.method}</td>
              <td className="font-semibold tabular-nums text-white">{money(w.amount)}</td><td className="tabular-nums">{money(w.netAmount)}</td><td><StatusBadge status={w.kycStatus} /></td><td><StatusBadge status={w.status} /></td>
              <td><button onClick={() => { setOpen(w); setNote(w.adminNote ?? ""); }} className="text-[12px] text-gold-300 hover:underline">Review</button></td>
            </tr>
          ))}
        </Table>
      )}
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(page) => setF((p) => ({ ...p, page }))} />}
      <Modal open={!!open} onClose={() => setOpen(null)} label="Withdrawal review">
        {open && (
          <div className="space-y-3 p-6">
            <h3 className="font-display text-[24px] text-white">{open.reference}</h3>
            <p className="text-[13px] text-white/65">{open.userName} · {open.method} · <b className="text-white">{money(open.amount)}</b> · fee {money(open.fee)} · net <b className="text-gold-200">{money(open.netAmount)}</b></p>
            <div className="rounded-xl bg-white/[0.03] p-3 font-mono text-[12px] text-white/80">{Object.entries(open.paymentDetails ?? {}).map(([k, v]) => <p key={k}>{k}: {String(v)}</p>)}</div>
            <Textarea label="Admin note (required for rejection)" value={note} onChange={(e) => setNote(e.target.value)} />
            {canDo(me, "finance.approve") && (next[open.status] ?? []).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {(next[open.status] ?? []).map((s) => <Button key={s} size="sm" variant={s === "completed" ? "gold" : "outline"} className={s === "rejected" ? "text-rose-300" : ""} onClick={() => setStatus(s)}>Mark {s}</Button>)}
              </div>
            )}
            <p className="text-[11.5px] text-white/40">Funds were held when the request was made. Rejecting refunds the player automatically.</p>
          </div>
        )}
      </Modal>
    </Card>
  );
}

export function TransactionsSection() {
  const [f, setF] = useState<Any>({ q: "", type: "", balanceType: "", status: "", from: "", to: "", page: 1 });
  const { data } = useApi<Any>(`/api/admin/transactions?${qsOf(f)}`);
  const set = (k: string) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value, page: 1 }));
  return (
    <Card title="Transaction ledger" action={<a href={`/api/admin/transactions?${qsOf({ ...f, format: "csv" })}`} className="flex items-center gap-1.5 text-[12px] text-gold-300 hover:text-gold-200"><Download className="h-4 w-4" /> Export CSV</a>}>
      <div className="mb-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <input className={`${inputCls} lg:col-span-2`} placeholder="Reference, description, email" value={f.q} onChange={set("q")} />
        <Select value={f.type} onChange={set("type")} options={[{ value: "", label: "All types" }, ...((data?.types as string[]) ?? []).map((t) => ({ value: t, label: t.replace(/_/g, " ") }))]} />
        <Select value={f.balanceType} onChange={set("balanceType")} options={[{ value: "", label: "Both wallets" }, { value: "main", label: "Main" }, { value: "bonus", label: "Bonus" }]} />
        <input type="date" className={inputCls} value={f.from} onChange={set("from")} aria-label="From" />
        <input type="date" className={inputCls} value={f.to} onChange={set("to")} aria-label="To" />
      </div>
      {!data ? <Spinner /> : (
        <Table head={["Date", "Reference", "User", "Type", "Wallet", "Amount", "Before", "After", "Status", "Description"]} empty={!data.items.length}>
          {data.items.map((t: Any) => (
            <tr key={t.id} className="text-white/80">
              <td className="whitespace-nowrap text-white/55">{fmtDate(t.createdAt)}</td><td className="font-mono text-[11px]">{t.reference}</td><td>{t.userEmail}</td><td className="capitalize">{t.type.replace(/_/g, " ")}</td><td>{t.balanceType}</td>
              <td className={`tabular-nums ${Number(t.amount) >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{money(t.amount)}</td><td className="tabular-nums text-white/50">{money(t.balanceBefore)}</td><td className="tabular-nums">{money(t.balanceAfter)}</td>
              <td><StatusBadge status={t.status} /></td><td className="max-w-[240px] truncate text-white/55">{t.description}</td>
            </tr>
          ))}
        </Table>
      )}
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(page) => setF((p) => ({ ...p, page }))} />}
    </Card>
  );
}

export function ReportsSection({ me }: { me: AdminMe }) {
  const [range, setRange] = useState({ from: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) });
  const { data } = useApi<Any>(`/api/admin/reports?from=${range.from}&to=${range.to}`);
  const [days, setDays] = useState("7");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <Card title="Financial report" action={<div className="flex gap-2"><input type="date" className={`${inputCls} h-9`} value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} /><input type="date" className={`${inputCls} h-9`} value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} /></div>}>
        {!data ? <Spinner /> : (
          <div className="grid gap-4 lg:grid-cols-2">
            <Table head={["Type", "Wallet", "Count", "Total"]} empty={!data.summary.length}>
              {data.summary.map((r: Any) => <tr key={`${r.type}-${r.balanceType}`} className="text-white/80"><td className="capitalize">{r.type.replace(/_/g, " ")}</td><td>{r.balanceType}</td><td>{r.n}</td><td className={`tabular-nums ${Number(r.total) >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{money(r.total)}</td></tr>)}
            </Table>
            <div className="space-y-4">
              <Table head={["Deposit method", "Count", "Volume"]} empty={!data.depositsByMethod.length}>
                {data.depositsByMethod.map((r: Any) => <tr key={r.method ?? "none"} className="text-white/80"><td>{r.method ?? "—"}</td><td>{r.n}</td><td className="tabular-nums">{money(r.total)}</td></tr>)}
              </Table>
              <p className="text-[13px] text-white/65">Fees collected: deposits <b className="text-white">{money(data.fees.deposits)}</b> · withdrawals <b className="text-white">{money(data.fees.withdrawals)}</b></p>
            </div>
          </div>
        )}
      </Card>
      {canDo(me, "finance.approve") && (
        <Card title="VIP cashback run">
          <p className="mb-3 text-[13px] text-white/60">Credits each player their VIP-level cashback % of net game losses for the period. Idempotent per period.</p>
          <div className="flex gap-2"><Input type="number" min={1} max={31} value={days} onChange={(e) => setDays(e.target.value)} className="w-28" /><Button onClick={async () => { try { const r = await api<Any>("/api/admin/cashback/run", { body: { days: Number(days) } }); setMsg(`Paid ${r.total} to ${r.users} player(s).`); } catch (e) { setMsg(errMsg(e)); } }}>Run cashback</Button></div>
          {msg && <p className="mt-2 text-[12.5px] text-white/70">{msg}</p>}
        </Card>
      )}
    </div>
  );
}

export function CommissionsSection({ me }: { me: AdminMe }) {
  const [status, setStatus] = useState("");
  const comms = useApi<Any>(`/api/admin/commissions?status=${status}`);
  const refs = useApi<Any>("/api/admin/referrals");
  const act = async (id: string, s: string) => {
    try { await api(`/api/admin/commissions/${id}/status`, { body: { status: s } }); comms.reload(); } catch (e) { alert(errMsg(e)); }
  };
  return (
    <div className="space-y-4">
      <Card title="Commissions" action={<Select className="h-9 w-40" value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: "", label: "All" }, ...["pending", "approved", "paid", "rejected"].map((v) => ({ value: v, label: v }))]} />}>
        {!comms.data ? <Spinner /> : (
          <Table head={["Date", "Referrer / Agent", "Base", "%", "Commission", "Status", ""]} empty={!comms.data.items.length}>
            {comms.data.items.map((c: Any) => (
              <tr key={c.id} className="text-white/80">
                <td className="text-white/55">{fmtDate(c.createdAt)}</td><td>{c.referrer ?? `Agent: ${c.agent}`}</td><td className="tabular-nums">{money(c.baseAmount)}</td><td>{c.percent}%</td><td className="font-semibold tabular-nums text-gold-200">{money(c.amount)}</td><td><StatusBadge status={c.status} /></td>
                <td className="whitespace-nowrap">{canDo(me, "affiliates.manage") && ["pending", "approved"].includes(c.status) && (<>{c.status === "pending" && <button onClick={() => act(c.id, "approved")} className="mr-2 text-[12px] text-sky-300">Approve</button>}<button onClick={() => act(c.id, "paid")} className="mr-2 text-[12px] text-emerald-300">Pay</button><button onClick={() => act(c.id, "rejected")} className="text-[12px] text-rose-300">Reject</button></>)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Card title="Referrals">
        {!refs.data ? <Spinner /> : (
          <Table head={["Date", "Referred player", "Referrer", "Agent", ""]} empty={!refs.data.items.length}>
            {refs.data.items.map((r: Any) => (
              <tr key={r.id} className="text-white/80"><td className="text-white/55">{fmtDate(r.created_at)}</td><td>{r.referred_name}<p className="text-[11px] text-white/45">{r.referred_email}</p></td><td>{r.referrer_email ?? "—"}</td><td>{r.agent_name ?? "—"}</td>
                <td>{r.referrer_id && canDo(me, "affiliates.manage") && <button onClick={async () => { await api(`/api/admin/users/${r.referrer_id}/referral`, { body: { disabled: !r.referral_disabled } }); refs.reload(); }} className="text-[12px] text-gold-300">{r.referral_disabled ? "Enable referrer" : "Disable referrer"}</button>}</td></tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
