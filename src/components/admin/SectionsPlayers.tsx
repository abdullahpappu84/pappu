"use client";

import { ArrowDownToLine, ArrowUpFromLine, Gamepad2, Gift, Headset, Search, TrendingUp, Users, FileCheck2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Card, Empty, Input, Pagination, Select, Spinner, Stat, StatusBadge, Table, Textarea, useApi, inputCls } from "@/components/ui/kit";
import { api, errMsg, fmtDate, money } from "@/lib/api";
import { canDo, type AdminMe } from "./AdminApp";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = Record<string, any>;

export function DashboardSection() {
  const { data } = useApi<Any>("/api/admin/dashboard");
  if (!data) return <Spinner />;
  const max = Math.max(1, ...data.series.map((s: Any) => Math.max(Number(s.deposits), Number(s.withdrawals))));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total users" value={data.users.total} icon={<Users className="h-4 w-4" />} sub={`+${data.users.newToday} today · +${data.users.newWeek} this week`} />
        <Stat label="Active (7d)" value={data.users.active} icon={<TrendingUp className="h-4 w-4" />} />
        <Stat label="Total deposits" value={money(data.deposits.total)} accent="text-emerald-300" icon={<ArrowDownToLine className="h-4 w-4" />} sub={`${data.deposits.count} approved`} />
        <Stat label="Total withdrawals" value={money(data.withdrawals.total)} accent="text-rose-300" icon={<ArrowUpFromLine className="h-4 w-4" />} sub={`${data.withdrawals.count} paid`} />
        <Stat label="Pending deposits" value={data.deposits.pending} accent="text-amber-200" sub={money(data.deposits.pendingAmount)} />
        <Stat label="Pending withdrawals" value={data.withdrawals.pending} accent="text-amber-200" sub={money(data.withdrawals.pendingAmount)} />
        <Stat label="GGR" value={money(data.revenue.ggr)} accent="text-gold-gradient" sub={`NGR ${money(data.revenue.ngr)} · Hold ${data.revenue.holdPct}%`} />
        <Stat label="Net deposits" value={money(data.revenue.netDeposits)} sub="Deposits − withdrawals" />
        <Stat label="Active bonuses" value={data.bonuses.active} icon={<Gift className="h-4 w-4" />} sub={`${money(data.bonuses.granted)} granted · ${data.bonuses.completed} completed`} />
        <Stat label="Game plays" value={data.games.plays} icon={<Gamepad2 className="h-4 w-4" />} sub={`${data.games.active} active games`} />
        <Stat label="Open tickets" value={data.tickets.open} icon={<Headset className="h-4 w-4" />} sub={`${data.tickets.unassigned} unassigned`} />
        <Stat label="KYC pending" value={data.kycPending} icon={<FileCheck2 className="h-4 w-4" />} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card title="Deposits vs withdrawals (14 days)">
          <div className="flex h-44 items-end gap-1.5">
            {data.series.map((s: Any) => (
              <div key={s.day} className="group flex flex-1 flex-col items-center gap-1" title={`${s.day}: +${s.deposits} / -${s.withdrawals}`}>
                <div className="flex h-36 w-full items-end gap-0.5">
                  <div className="flex-1 rounded-t bg-gold-gradient" style={{ height: `${(Number(s.deposits) / max) * 100}%` }} />
                  <div className="flex-1 rounded-t bg-rose-400/60" style={{ height: `${(Number(s.withdrawals) / max) * 100}%` }} />
                </div>
                <span className="text-[9px] text-white/35">{s.day.slice(8)}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Top games">
          <ul className="space-y-2">{data.topGames.map((g: Any) => <li key={g.name} className="flex justify-between text-[13px]"><span className="text-white/80">{g.name}</span><span className="tabular-nums text-gold-200">{g.plays}</span></li>)}</ul>
        </Card>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Recent transactions" className="xl:col-span-2">
          <Table head={["Date", "User", "Type", "Amount", "Status"]}>
            {data.recentTransactions.map((t: Any) => (
              <tr key={t.id} className="text-white/80"><td className="text-white/55">{fmtDate(t.createdAt)}</td><td>{t.userName}</td><td className="capitalize">{t.type.replace(/_/g, " ")}</td><td className={`tabular-nums ${Number(t.amount) >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{money(t.amount)}</td><td><StatusBadge status={t.status} /></td></tr>
            ))}
          </Table>
        </Card>
        <div className="space-y-4">
          <Card title="Recent users"><ul className="space-y-2">{data.recentUsers.map((u: Any) => <li key={u.id} className="flex justify-between text-[12.5px]"><span className="truncate text-white/80">{u.name}<span className="block text-white/40">{u.email}</span></span><StatusBadge status={u.status} /></li>)}</ul></Card>
          <Card title="Support tickets"><ul className="space-y-2">{data.recentTickets.map((t: Any) => <li key={t.id} className="flex justify-between gap-2 text-[12.5px]"><span className="truncate text-white/80">{t.subject}</span><StatusBadge status={t.status} /></li>)}</ul></Card>
        </div>
      </div>
    </div>
  );
}

function UserDetail({ id, me, onClose }: { id: string; me: AdminMe; onClose: () => void }) {
  const [tab, setTab] = useState("overview");
  const d = useApi<Any>(`/api/admin/users/${id}`);
  const tx = useApi<Any>(tab === "transactions" ? `/api/admin/users/${id}/transactions` : null);
  const bon = useApi<Any>(tab === "bonuses" ? `/api/admin/users/${id}/bonuses` : null);
  const games = useApi<Any>(tab === "games" ? `/api/admin/users/${id}/games` : null);
  const refs = useApi<Any>(tab === "referrals" ? `/api/admin/users/${id}/referrals` : null);
  const [adj, setAdj] = useState({ balanceType: "main", type: "adjustment", amount: "", reason: "", confirm: "" });
  const [note, setNote] = useState("");
  const [edit, setEdit] = useState<Any | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); setMsg(`✔ ${ok}`); d.reload(); } catch (e) { setMsg(`✖ ${errMsg(e)}`); }
  };
  const setStatus = (status: string) => {
    const reason = prompt(`Reason for setting status to "${status}":`);
    if (reason) act(() => api(`/api/admin/users/${id}/status`, { body: { status, reason } }), `Status → ${status}`);
  };
  if (!d.data) return <Spinner />;
  const { user, wallet, vip, stats, notes, profile, kyc, referrer, activeSessions } = d.data;
  return (
    <div className="p-5 md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-[26px] font-semibold text-white">{user.name}</h2>
          <p className="text-[12.5px] text-white/55">{user.email} · {user.phone ?? "no phone"} · joined {fmtDate(user.createdAt, false)}</p>
          <div className="mt-2 flex flex-wrap gap-1.5"><StatusBadge status={user.status} /><StatusBadge status={`kyc ${user.kycStatus}`} />{user.twoFactorEnabled && <StatusBadge status="2fa on" />}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canDo(me, "users.suspend") && (user.status === "active" ? (<><Button size="xs" variant="outline" onClick={() => setStatus("suspended")}>Suspend</Button><Button size="xs" variant="outline" className="text-rose-300" onClick={() => setStatus("banned")}>Ban</Button></>) : <Button size="xs" onClick={() => setStatus("active")}>{user.status === "banned" ? "Unban" : "Activate"}</Button>)}
          {canDo(me, "users.edit") && <Button size="xs" variant="outline" onClick={() => setEdit({ name: user.name, email: user.email, phone: user.phone ?? "" })}>Edit</Button>}
        </div>
      </div>
      <div className="mt-4 flex gap-1.5 overflow-x-auto no-scrollbar">
        {["overview", "transactions", "bonuses", "games", "referrals", "notes"].map((t) => <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-1.5 text-[12.5px] capitalize ${tab === t ? "bg-gold-400/15 text-gold-200" : "text-white/60 hover:bg-white/5"}`}>{t}</button>)}
      </div>
      {msg && <p className="mt-3 text-[12.5px] text-white/70">{msg}</p>}
      <div className="mt-4">
        {tab === "overview" && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid grid-cols-2 gap-2 text-[12.5px]">
              {[["Main balance", money(wallet?.mainBalance)], ["Bonus balance", money(wallet?.bonusBalance)], ["Deposits", money(stats.deposits)], ["Withdrawals", money(stats.withdrawals)], ["Wagered", money(stats.bets)], ["Won", money(stats.wins)], ["VIP", `${vip?.level ?? "—"} (${vip?.points ?? 0} pts)`], ["Sessions", activeSessions], ["Referred by", referrer?.name ?? "—"], ["Country", profile?.country ?? "—"], ["Email verified", user.emailVerifiedAt ? "Yes" : "No"], ["Phone verified", user.phoneVerifiedAt ? "Yes" : "No"]].map(([k, v]) => (
                <div key={k as string} className="rounded-xl bg-white/[0.03] px-3 py-2"><p className="text-white/45">{k}</p><p className="font-semibold text-white">{v}</p></div>
              ))}
              {kyc && <div className="col-span-2 rounded-xl bg-white/[0.03] px-3 py-2"><p className="text-white/45">Latest KYC</p><p className="text-white">{kyc.documentType} · {kyc.documentNumber} · <StatusBadge status={kyc.status} /></p></div>}
            </div>
            <div className="space-y-3">
              {canDo(me, "users.balance") && (
                <div className="rounded-2xl border border-gold-300/25 p-4">
                  <p className="mb-3 text-[13px] font-semibold text-white">Manual balance adjustment</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={adj.balanceType} onChange={(e) => setAdj((a) => ({ ...a, balanceType: e.target.value }))} options={[{ value: "main", label: "Main balance" }, { value: "bonus", label: "Bonus balance" }]} />
                    <Select value={adj.type} onChange={(e) => setAdj((a) => ({ ...a, type: e.target.value }))} options={["adjustment", "cashback", "bonus", "refund"].map((v) => ({ value: v, label: v }))} />
                    <Input placeholder="Amount (negative to debit)" type="number" step="0.01" value={adj.amount} onChange={(e) => setAdj((a) => ({ ...a, amount: e.target.value }))} />
                    <Input placeholder='Type "CONFIRM"' value={adj.confirm} onChange={(e) => setAdj((a) => ({ ...a, confirm: e.target.value }))} />
                    <div className="col-span-2"><Input placeholder="Reason (required, audited)" value={adj.reason} onChange={(e) => setAdj((a) => ({ ...a, reason: e.target.value }))} /></div>
                  </div>
                  <Button size="sm" className="mt-3" onClick={() => act(() => api(`/api/admin/users/${id}/adjust`, { body: { ...adj, amount: Number(adj.amount) } }), "Balance adjusted").then(() => setAdj({ balanceType: "main", type: "adjustment", amount: "", reason: "", confirm: "" }))}>Apply adjustment</Button>
                  <p className="mt-2 text-[11px] text-white/40">Recorded in the ledger and audit log under {me.admin.email}.</p>
                </div>
              )}
              {canDo(me, "users.edit") && (
                <div className="flex flex-wrap gap-2">
                  <Button size="xs" variant="outline" onClick={() => act(() => api(`/api/admin/users/${id}/verify`, { body: { email: !user.emailVerifiedAt } }), "Email verification updated")}>{user.emailVerifiedAt ? "Unverify email" : "Verify email"}</Button>
                  <Button size="xs" variant="outline" onClick={() => act(() => api(`/api/admin/users/${id}/verify`, { body: { phone: !user.phoneVerifiedAt } }), "Phone verification updated")}>{user.phoneVerifiedAt ? "Unverify phone" : "Verify phone"}</Button>
                  <Button size="xs" variant="outline" onClick={() => act(() => api(`/api/admin/users/${id}/security`, { body: { action: "reset-2fa" } }), "2FA reset")}>Reset 2FA</Button>
                  <Button size="xs" variant="outline" onClick={() => act(() => api(`/api/admin/users/${id}/security`, { body: { action: "logout-all" } }), "Sessions revoked")}>Sign out everywhere</Button>
                </div>
              )}
              {canDo(me, "affiliates.manage") && <Button size="xs" variant="outline" onClick={() => act(() => api(`/api/admin/users/${id}/referral`, { body: { disabled: !user.referralDisabled } }), "Referral status updated")}>{user.referralDisabled ? "Enable referrals" : "Disable referral account"}</Button>}
            </div>
          </div>
        )}
        {tab === "transactions" && (tx.data ? <><Table head={["Date", "Ref", "Type", "Wallet", "Amount", "After", "Status"]} empty={!tx.data.items.length}>{tx.data.items.map((t: Any) => <tr key={t.id} className="text-white/80"><td className="text-white/55">{fmtDate(t.createdAt)}</td><td className="font-mono text-[11px]">{t.reference}</td><td className="capitalize">{t.type}</td><td>{t.balanceType}</td><td className={Number(t.amount) >= 0 ? "text-emerald-300" : "text-rose-300"}>{money(t.amount)}</td><td>{money(t.balanceAfter)}</td><td><StatusBadge status={t.status} /></td></tr>)}</Table></> : <Spinner />)}
        {tab === "bonuses" && (bon.data ? <Table head={["Date", "Bonus", "Amount", "Wagering", "Status"]} empty={!bon.data.items.length}>{bon.data.items.map((b: Any) => <tr key={b.id} className="text-white/80"><td className="text-white/55">{fmtDate(b.createdAt)}</td><td>{b.name}</td><td>{money(b.amount)}</td><td>{money(b.wageringCompleted)} / {money(b.wageringRequired)}</td><td><StatusBadge status={b.status} /></td></tr>)}</Table> : <Spinner />)}
        {tab === "games" && (games.data ? <Table head={["Game", "Plays", "Last played"]} empty={!games.data.recent.length}>{games.data.recent.map((g: Any) => <tr key={g.slug} className="text-white/80"><td>{g.name}</td><td>{g.playCount}</td><td className="text-white/55">{fmtDate(g.lastPlayedAt)}</td></tr>)}</Table> : <Spinner />)}
        {tab === "referrals" && (refs.data ? <Table head={["Referred user", "Email", "Joined"]} empty={!refs.data.referred.length}>{refs.data.referred.map((r: Any) => <tr key={r.id} className="text-white/80"><td>{r.name}</td><td>{r.email}</td><td className="text-white/55">{fmtDate(r.createdAt, false)}</td></tr>)}</Table> : <Spinner />)}
        {tab === "notes" && (
          <div className="space-y-3">
            {canDo(me, "users.notes") && <div className="flex gap-2"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add an internal note (not visible to the player)" /><Button onClick={() => act(() => api(`/api/admin/users/${id}/notes`, { body: { note } }), "Note added").then(() => setNote(""))}>Add</Button></div>}
            {!notes.length ? <Empty text="No notes." /> : notes.map((n: Any) => <div key={n.id} className="rounded-xl bg-white/[0.03] p-3 text-[12.5px]"><p className="text-white/85">{n.note}</p><p className="mt-1 text-white/40">{n.adminName} · {fmtDate(n.createdAt)}</p></div>)}
          </div>
        )}
      </div>
      <div className="mt-6 flex justify-end"><Button variant="outline" onClick={onClose}>Close</Button></div>
      <Modal open={!!edit} onClose={() => setEdit(null)} label="Edit user">
        {edit && <div className="space-y-3 p-6"><h3 className="font-display text-[22px] text-white">Edit user</h3><Input label="Name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /><Input label="Email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /><Input label="Phone" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /><Button onClick={() => act(() => api(`/api/admin/users/${id}`, { method: "PATCH", body: { ...edit, phone: edit.phone || null } }), "User updated").then(() => setEdit(null))}>Save</Button></div>}
      </Modal>
    </div>
  );
}

export function UsersSection({ me }: { me: AdminMe }) {
  const [f, setF] = useState({ q: "", status: "", kyc: "", verified: "", page: 1 });
  const qs = new URLSearchParams(Object.entries({ ...f, page: String(f.page) }).filter(([, v]) => v)).toString();
  const { data } = useApi<Any>(`/api/admin/users?${qs}`);
  const [open, setOpen] = useState<string | null>(null);
  const set = (k: string) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value, page: 1 }));
  return (
    <Card title="Players">
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" /><input className={`${inputCls} pl-9`} placeholder="Name, email, phone, referral code" value={f.q} onChange={set("q")} /></label>
        <Select value={f.status} onChange={set("status")} options={[{ value: "", label: "All statuses" }, ...["active", "suspended", "banned", "pending"].map((v) => ({ value: v, label: v }))]} />
        <Select value={f.kyc} onChange={set("kyc")} options={[{ value: "", label: "Any KYC" }, ...["none", "pending", "under_review", "approved", "rejected", "resubmission"].map((v) => ({ value: v, label: v }))]} />
        <Select value={f.verified} onChange={set("verified")} options={[{ value: "", label: "Email: any" }, { value: "yes", label: "Verified" }, { value: "no", label: "Unverified" }]} />
      </div>
      {!data ? <Spinner /> : (
        <Table head={["User", "Phone", "Balance", "Bonus", "Status", "KYC", "Joined", "Last login"]} empty={!data.items.length}>
          {data.items.map((u: Any) => (
            <tr key={u.id} onClick={() => setOpen(u.id)} className="cursor-pointer text-white/80 hover:bg-white/[0.02]">
              <td><p className="text-white">{u.name}</p><p className="text-[11.5px] text-white/45">{u.email}</p></td>
              <td>{u.phone ?? "—"}</td><td className="tabular-nums">{money(u.mainBalance)}</td><td className="tabular-nums text-gold-200">{money(u.bonusBalance)}</td>
              <td><StatusBadge status={u.status} /></td><td><StatusBadge status={u.kycStatus} /></td><td className="text-white/55">{fmtDate(u.createdAt, false)}</td><td className="text-white/55">{fmtDate(u.lastLoginAt)}</td>
            </tr>
          ))}
        </Table>
      )}
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(page) => setF((p) => ({ ...p, page }))} />}
      <Modal open={!!open} onClose={() => setOpen(null)} label="User" maxWidth="md:max-w-[1000px]">{open && <UserDetail id={open} me={me} onClose={() => setOpen(null)} />}</Modal>
    </Card>
  );
}

export function KycSection({ me }: { me: AdminMe }) {
  const [status, setStatus] = useState("pending");
  const [page, setPage] = useState(1);
  const { data, reload } = useApi<Any>(`/api/admin/kyc?status=${status}&page=${page}`);
  const [open, setOpen] = useState<Any | null>(null);
  const [note, setNote] = useState("");
  const review = async (s: string) => {
    try { await api(`/api/admin/kyc/${open!.id}/review`, { body: { status: s, note } }); setOpen(null); setNote(""); reload(); } catch (e) { alert(errMsg(e)); }
  };
  return (
    <Card title="KYC submissions" action={<Select className="h-9 w-48" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} options={[{ value: "", label: "All" }, ...["pending", "under_review", "approved", "rejected", "resubmission"].map((v) => ({ value: v, label: v.replace("_", " ") }))]} />}>
      {!data ? <Spinner /> : (
        <Table head={["Submitted", "User", "Name", "Document", "Country", "Status", ""]} empty={!data.items.length}>
          {data.items.map((k: Any) => (
            <tr key={k.id} className="text-white/80"><td className="text-white/55">{fmtDate(k.createdAt)}</td><td>{k.userEmail}</td><td>{k.fullName}</td><td className="capitalize">{k.documentType.replace("_", " ")} · {k.documentNumber}</td><td>{k.country}</td><td><StatusBadge status={k.status} /></td><td><button onClick={() => { setOpen(k); setNote(k.adminNote ?? ""); }} className="text-[12px] text-gold-300 hover:underline">Review</button></td></tr>
          ))}
        </Table>
      )}
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
      <Modal open={!!open} onClose={() => setOpen(null)} label="KYC review" maxWidth="md:max-w-[760px]">
        {open && (
          <div className="p-6">
            <h3 className="font-display text-[24px] text-white">{open.fullName}</h3>
            <p className="text-[12.5px] text-white/55">{open.userEmail} · DOB {open.dateOfBirth} · {open.country} · {open.address}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {[["Front", open.frontUrl], ["Back", open.backUrl], ["Selfie", open.selfieUrl]].map(([l, u]) => (
                <a key={l} href={u ?? undefined} target="_blank" rel="noreferrer" className={`grid aspect-[4/3] place-items-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] text-[12px] ${u ? "text-gold-300 hover:border-gold-300/50" : "pointer-events-none text-white/30"}`}>
                  {u && !String(u).endsWith(".pdf") ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={u} alt={l} className="h-full w-full object-cover" /> : u ? `Open ${l} (PDF)` : `No ${l}`}
                </a>
              ))}
            </div>
            <div className="mt-4"><Textarea label="Note to player / reviewer" value={note} onChange={(e) => setNote(e.target.value)} /></div>
            {canDo(me, "kyc.review") && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => review("under_review")}>Mark under review</Button>
                <Button size="sm" onClick={() => review("approved")}>Approve</Button>
                <Button size="sm" variant="outline" onClick={() => review("resubmission")}>Request resubmission</Button>
                <Button size="sm" variant="outline" className="text-rose-300" onClick={() => review("rejected")}>Reject</Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </Card>
  );
}
