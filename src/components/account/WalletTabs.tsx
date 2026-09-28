"use client";

import { ArrowDownToLine, ArrowUpFromLine, FileUp, Receipt, Search, Wallet } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { Button } from "@/components/ui/Button";
import { Card, Empty, Input, Label, Pagination, Select, Spinner, StatusBadge, Table, Textarea, useApi, inputCls } from "@/components/ui/kit";
import { api, errMsg, fmtDate, money, newIdempotencyKey } from "@/lib/api";

type PM = { id: number; name: string; code: string; online?: boolean; logoUrl: string | null; instructions: string | null; accountDetails: string | null; minAmount: string; maxAmount: string; feePercent: string; feeFixed: string; processingTime: string | null; requiresProof: boolean; fields: { name: string; label: string; placeholder?: string }[] | null };
type PMResponse = { items: PM[]; limits: Record<string, number>; bonuses: { id: number; name: string; description: string | null; minDeposit: string; percentage: string; maxBonus: string; wageringMultiplier: string }[] };
type Row = Record<string, string & never> & { id: string };

export function WalletOverview() {
  const { settings, go } = useApp();
  const { data } = useApi<{ mainBalance: string; bonusBalance: string; pendingWithdrawals: string }>("/api/me/wallet");
  const sym = settings.locale.currencySymbol;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { l: "Main balance", v: data?.mainBalance, c: "text-white", s: "Withdrawable cash" },
          { l: "Bonus balance", v: data?.bonusBalance, c: "text-gold-gradient", s: "Kept separate · subject to wagering" },
          { l: "Pending withdrawals", v: data?.pendingWithdrawals, c: "text-white/80", s: "Held until processed" },
        ].map((x) => (
          <div key={x.l} className="panel rounded-2xl p-4">
            <p className="text-[11.5px] uppercase tracking-wider text-white/50">{x.l}</p>
            <p className={`mt-1.5 font-display text-[30px] font-semibold tabular-nums leading-none ${x.c}`}>{data ? money(x.v, sym) : "—"}</p>
            <p className="mt-1.5 text-[11.5px] text-white/40">{x.s}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Button size="lg" iconLeft={<ArrowDownToLine className="relative h-4 w-4" />} onClick={() => go("/account?tab=deposit")}>
          Deposit
        </Button>
        <Button size="lg" variant="outline" iconLeft={<ArrowUpFromLine className="h-4 w-4" />} onClick={() => go("/account?tab=withdraw")}>
          Withdraw
        </Button>
      </div>
      <TransactionsTab compact />
    </div>
  );
}

const PAYMENT_MSG: Record<string, { title: string; text: string; cls: string }> = {
  success: { title: "Payment successful.", text: "Your deposit has been credited to your balance.", cls: "border-emerald-400/25 bg-emerald-500/10 text-emerald-100" },
  pending: { title: "Payment is being confirmed.", text: "Your balance updates automatically as soon as the gateway confirms it.", cls: "border-sky-400/25 bg-sky-500/10 text-sky-100" },
  review: { title: "Payment received.", text: "It is under a quick manual review by our finance team.", cls: "border-amber-400/25 bg-amber-500/10 text-amber-100" },
  failed: { title: "Payment failed.", text: "No money was taken. Please try again or choose another method.", cls: "border-rose-400/25 bg-rose-500/10 text-rose-100" },
  cancelled: { title: "Payment cancelled.", text: "You can start a new deposit at any time.", cls: "border-white/15 bg-white/[0.04] text-white/75" },
  error: { title: "We could not confirm the payment yet.", text: "If you were charged, it will be credited automatically once confirmed — or contact support.", cls: "border-amber-400/25 bg-amber-500/10 text-amber-100" },
};

export function DepositTab() {
  const { settings, refreshUser, notify } = useApp();
  const sp = useSearchParams();
  const { data } = useApi<PMResponse>("/api/me/payment-methods?direction=deposit");
  const history = useApi<{ items: Row[]; total: number; page: number; pageSize: number }>("/api/me/deposits");
  const [pmId, setPmId] = useState<number | null>(null);
  const [amount, setAmount] = useState("50");
  const [promo, setPromo] = useState("");
  const [bonusId, setBonusId] = useState(sp.get("bonus") ?? "");
  const [proof, setProof] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [promoInfo, setPromoInfo] = useState<string | null>(null);
  const [result, setResult] = useState<{ reference: string; instructions?: string | null } | null>(null);
  const [idem, setIdem] = useState(newIdempotencyKey);
  const pm = data?.items.find((m) => m.id === pmId) ?? data?.items[0];
  const sym = settings.locale.currencySymbol;
  const payment = sp.get("payment");
  const payRef = sp.get("ref");
  useEffect(() => {
    if (payment) refreshUser();
  }, [payment, refreshUser]);

  const checkPromo = async () => {
    if (!promo.trim()) return;
    try {
      const r = await api<{ description: string; estimatedBonus: string | null; requiresDeposit: boolean }>("/api/me/promo/validate", { body: { code: promo, amount: Number(amount) || undefined } });
      setPromoInfo(`✔ ${r.description ?? "Valid code"}${r.estimatedBonus ? ` — estimated bonus ${money(r.estimatedBonus, sym)}` : ""}`);
    } catch (e) {
      setPromoInfo(`✖ ${errMsg(e)}`);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pm) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("paymentMethodId", String(pm.id));
      fd.set("amount", amount);
      if (promo) fd.set("promoCode", promo);
      if (bonusId && !promo) fd.set("bonusId", bonusId);
      fd.set("idempotencyKey", idem);
      if (proof) fd.set("proof", proof);
      const r = await api<{ deposit: { reference: string }; instructions?: string | null; redirectUrl?: string }>("/api/me/deposits", { form: fd });
      if (r.redirectUrl) window.location.href = r.redirectUrl;
      setResult({ reference: r.deposit.reference, instructions: r.instructions });
      setIdem(newIdempotencyKey());
      setProof(null);
      notify({ title: "Deposit submitted", description: `Reference ${r.deposit.reference}`, tone: "success" });
      history.reload();
      refreshUser();
    } catch (err) {
      notify({ title: "Deposit failed", description: errMsg(err), tone: "info" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {payment && PAYMENT_MSG[payment] && (
        <div className={`rounded-2xl border px-4 py-3 text-[13px] ${PAYMENT_MSG[payment].cls}`}>
          <b>{PAYMENT_MSG[payment].title}</b> {PAYMENT_MSG[payment].text} {payRef && <span className="font-mono text-[12px] opacity-70">({payRef})</span>}
        </div>
      )}
      <Card title="Make a deposit" icon={<ArrowDownToLine className="h-5 w-5" />}>
        {!data ? (
          <Spinner />
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {data.items.map((m) => (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => setPmId(m.id)}
                  className={`rounded-xl border px-3 py-3 text-left transition ${pm?.id === m.id ? "border-gold-300/70 bg-gold-400/10 shadow-[0_0_20px_-8px_rgba(240,185,63,0.6)]" : "border-white/10 bg-white/[0.02] hover:border-white/25"}`}
                >
                  <p className="text-[13px] font-semibold text-white">{m.name}</p>
                  <p className="mt-0.5 text-[11px] text-white/45">{m.processingTime}</p>
                </button>
              ))}
            </div>
            {pm && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input label="Amount" type="number" min={1} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required hint={`Min ${money(Math.max(Number(pm.minAmount), data.limits.min ?? 0), sym)} · Max ${money(Math.min(Number(pm.maxAmount), data.limits.max ?? 1e9), sym)}${Number(pm.feePercent) || Number(pm.feeFixed) ? ` · Fee ${pm.feePercent}% + ${money(pm.feeFixed, sym)}` : ""}`} />
                  <Select label="Bonus" value={promo ? "" : bonusId} onChange={(e) => setBonusId(e.target.value)} disabled={!!promo} options={[{ value: "", label: "No bonus" }, ...data.bonuses.map((b) => ({ value: b.id, label: `${b.name} (min ${money(b.minDeposit, sym)})` }))]} />
                </div>
                <div className="flex flex-wrap gap-2">
                  {[20, 50, 100, 250, 500].map((v) => (
                    <button type="button" key={v} onClick={() => setAmount(String(v))} className={`h-8 rounded-full border px-3 text-[12px] ${amount === String(v) ? "border-gold-300/70 text-gold-200" : "border-white/10 text-white/70 hover:border-white/25"}`}>
                      {money(v, sym)}
                    </button>
                  ))}
                </div>
                <Label label="Promo code (optional)" hint={promoInfo}>
                  <div className="flex gap-2">
                    <input className={`${inputCls} uppercase`} value={promo} onChange={(e) => { setPromo(e.target.value); setPromoInfo(null); }} placeholder="e.g. WELCOME50" />
                    <Button type="button" variant="outline" onClick={checkPromo}>
                      Check
                    </Button>
                  </div>
                </Label>
                {(pm.instructions || pm.accountDetails) && (
                  <div className="rounded-xl border border-gold-300/20 bg-gold-400/[0.05] p-3.5 text-[12.5px] text-white/75">
                    {pm.instructions && <p>{pm.instructions}</p>}
                    {pm.accountDetails && <pre className="mt-2 whitespace-pre-wrap font-mono text-[12px] text-gold-100">{pm.accountDetails}</pre>}
                  </div>
                )}
                {pm.requiresProof && (
                  <Label label="Payment proof (required)" hint="JPG, PNG, WEBP or PDF · max 5MB">
                    <label className={`${inputCls} flex cursor-pointer items-center gap-2 text-white/60`}>
                      <FileUp className="h-4 w-4 text-gold-300" />
                      <span className="truncate">{proof?.name ?? "Choose file…"}</span>
                      <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(e) => setProof(e.target.files?.[0] ?? null)} />
                    </label>
                  </Label>
                )}
                <Button type="submit" size="lg" className="w-full" disabled={busy}>
                  {busy ? (pm.online ? "Redirecting to secure payment…" : "Submitting…") : pm.online ? `Pay ${money(Number(amount) || 0, sym)} securely` : `Deposit ${money(Number(amount) || 0, sym)}`}
                </Button>
              </>
            )}
            {result && (
              <p className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-[12.5px] text-emerald-100">
                Deposit <b>{result.reference}</b> is pending review. Include this reference in your payment description. You&apos;ll be notified once it&apos;s credited.
              </p>
            )}
          </form>
        )}
      </Card>
      <RequestHistory title="Deposit history" kind="deposits" state={history} />
    </div>
  );
}

export function WithdrawTab() {
  const { settings, user, refreshUser, notify } = useApp();
  const { data } = useApi<PMResponse>("/api/me/payment-methods?direction=withdrawal");
  const history = useApi<{ items: Row[]; total: number; page: number; pageSize: number }>("/api/me/withdrawals");
  const [pmId, setPmId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [details, setDetails] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [idem, setIdem] = useState(newIdempotencyKey);
  const pm = data?.items.find((m) => m.id === pmId) ?? data?.items[0];
  const sym = settings.locale.currencySymbol;
  const fee = useMemo(() => {
    if (!pm || !data) return 0;
    const a = Number(amount) || 0;
    return (a * (Number(pm.feePercent) + (data.limits.feePercent ?? 0))) / 100 + Number(pm.feeFixed) + (data.limits.feeFixed ?? 0);
  }, [pm, data, amount]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pm) return;
    setBusy(true);
    try {
      const r = await api<{ reference: string }>("/api/me/withdrawals", { body: { paymentMethodId: pm.id, amount: Number(amount), details, idempotencyKey: idem } });
      notify({ title: "Withdrawal requested", description: `Reference ${r.reference}`, tone: "success" });
      setAmount("");
      setIdem(newIdempotencyKey());
      history.reload();
      refreshUser();
    } catch (err) {
      notify({ title: "Withdrawal failed", description: errMsg(err), tone: "info" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card title="Request a withdrawal" icon={<ArrowUpFromLine className="h-5 w-5" />} action={<span className="text-[12px] text-white/50">Available: <b className="text-white">{money(user?.balance, sym)}</b></span>}>
        {!data ? (
          <Spinner />
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {data.items.map((m) => (
                <button type="button" key={m.id} onClick={() => { setPmId(m.id); setDetails({}); }} className={`rounded-xl border px-3 py-3 text-left transition ${pm?.id === m.id ? "border-gold-300/70 bg-gold-400/10" : "border-white/10 bg-white/[0.02] hover:border-white/25"}`}>
                  <p className="text-[13px] font-semibold text-white">{m.name}</p>
                  <p className="mt-0.5 text-[11px] text-white/45">{m.processingTime}</p>
                </button>
              ))}
            </div>
            {pm && (
              <>
                <Input label="Amount" type="number" min={1} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required hint={`Min ${money(Math.max(Number(pm.minAmount), data.limits.min ?? 0), sym)} · Max ${money(Math.min(Number(pm.maxAmount), data.limits.max ?? 1e9), sym)} · Daily limit ${money(data.limits.dailyLimitAmount, sym)} / ${data.limits.dailyLimitCount} requests`} />
                <div className="grid gap-3 sm:grid-cols-2">
                  {(pm.fields ?? []).map((f) => (
                    <Input key={f.name} label={f.label} placeholder={f.placeholder} value={details[f.name] ?? ""} onChange={(e) => setDetails((d) => ({ ...d, [f.name]: e.target.value }))} required />
                  ))}
                </div>
                <div className="flex justify-between rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-[12.5px]">
                  <span className="text-white/55">Fee {money(fee, sym)}</span>
                  <span className="text-white">You receive <b className="text-gold-200">{money(Math.max(0, (Number(amount) || 0) - fee), sym)}</b></span>
                </div>
                <Button type="submit" size="lg" className="w-full" disabled={busy || !amount}>
                  {busy ? "Submitting…" : "Request withdrawal"}
                </Button>
                <p className="text-[11.5px] text-white/40">Funds are held from your main balance immediately and returned if the request is rejected or cancelled. Bonus funds cannot be withdrawn.</p>
              </>
            )}
          </form>
        )}
      </Card>
      <RequestHistory title="Withdrawal history" kind="withdrawals" state={history} />
    </div>
  );
}

function RequestHistory({ title, kind, state }: { title: string; kind: "deposits" | "withdrawals"; state: ReturnType<typeof useApi<{ items: Row[]; total: number; page: number; pageSize: number }>> }) {
  const { settings, notify, refreshUser } = useApp();
  const cancel = async (id: string) => {
    try {
      await api(`/api/me/${kind}/${id}/cancel`, { method: "POST" });
      notify({ title: "Request cancelled", tone: "info" });
      state.reload();
      refreshUser();
    } catch (e) {
      notify({ title: "Unable to cancel", description: errMsg(e), tone: "info" });
    }
  };
  const items = state.data?.items ?? [];
  return (
    <Card title={title} icon={<Receipt className="h-5 w-5" />}>
      {state.loading && !state.data ? (
        <Spinner />
      ) : (
        <Table head={["Date", "Reference", "Method", "Amount", kind === "withdrawals" ? "Net" : "Fee", "Status", "Note", ""]} empty={!items.length}>
          {items.map((r) => (
            <tr key={r.id} className="text-white/80">
              <td className="whitespace-nowrap text-white/55">{fmtDate(r.createdAt)}</td>
              <td className="font-mono text-[11.5px]">{r.reference}</td>
              <td>{r.method}</td>
              <td className="font-semibold tabular-nums text-white">{money(r.amount, settings.locale.currencySymbol)}</td>
              <td className="tabular-nums">{money(kind === "withdrawals" ? r.netAmount : r.fee, settings.locale.currencySymbol)}</td>
              <td>
                <StatusBadge status={r.status} />
              </td>
              <td className="max-w-[200px] truncate text-white/50">{r.adminNote}</td>
              <td>
                {r.status === "pending" && (
                  <button onClick={() => cancel(r.id)} className="text-[12px] text-rose-300 hover:underline">
                    Cancel
                  </button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}

const TX_FILTERS = [
  { value: "", label: "All types" },
  { value: "deposit", label: "Deposits" },
  { value: "withdrawal", label: "Withdrawals" },
  { value: "bonus", label: "Bonuses" },
  { value: "cashback", label: "Cashback" },
  { value: "refund", label: "Refunds" },
  { value: "adjustment", label: "Adjustments" },
  { value: "commission", label: "Commissions" },
  { value: "game", label: "Game rounds" },
];

export function TransactionsTab({ compact = false }: { compact?: boolean }) {
  const { settings } = useApp();
  const [f, setF] = useState({ q: "", type: "", status: "", from: "", to: "", page: 1 });
  const qs = new URLSearchParams(Object.entries({ ...f, page: String(f.page), pageSize: compact ? "6" : "15" }).filter(([, v]) => v)).toString();
  const { data, loading } = useApi<{ items: Row[]; total: number; page: number; pageSize: number }>(`/api/me/transactions?${qs}`);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value, page: 1 }));
  return (
    <Card title={compact ? "Recent activity" : "Transaction history"} icon={<Wallet className="h-5 w-5" />}>
      {!compact && (
        <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <label className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <input className={`${inputCls} pl-10`} placeholder="Search ID or description" value={f.q} onChange={set("q")} />
          </label>
          <Select value={f.type} onChange={set("type")} options={TX_FILTERS} />
          <input type="date" className={inputCls} value={f.from} onChange={set("from")} aria-label="From date" />
          <input type="date" className={inputCls} value={f.to} onChange={set("to")} aria-label="To date" />
        </div>
      )}
      {loading && !data ? (
        <Spinner />
      ) : !data?.items.length ? (
        <Empty text="No transactions found." />
      ) : (
        <Table head={["Date", "Transaction ID", "Type", "Wallet", "Amount", "Balance", "Status", "Description"]}>
          {data.items.map((t) => (
            <tr key={t.id} className="text-white/80">
              <td className="whitespace-nowrap text-white/55">{fmtDate(t.createdAt)}</td>
              <td className="font-mono text-[11.5px]">{t.reference}</td>
              <td className="capitalize">{String(t.type).replace(/_/g, " ")}</td>
              <td className="capitalize text-white/55">{t.balanceType}</td>
              <td className={`whitespace-nowrap font-semibold tabular-nums ${Number(t.amount) >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                {Number(t.amount) >= 0 ? "+" : ""}
                {money(t.amount, settings.locale.currencySymbol)}
              </td>
              <td className="tabular-nums text-white/60">{money(t.balanceAfter, settings.locale.currencySymbol)}</td>
              <td>
                <StatusBadge status={t.status} />
              </td>
              <td className="max-w-[240px] truncate text-white/55">{t.description}</td>
            </tr>
          ))}
        </Table>
      )}
      {data && !compact && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(page) => setF((p) => ({ ...p, page }))} />}
      {compact && <Textarea className="hidden" readOnly />}
    </Card>
  );
}
