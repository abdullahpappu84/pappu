"use client";

import { ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { useCallback, useEffect, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { api, errMsg } from "@/lib/api";

/** Shared form/data primitives built on the existing design tokens (panel, gold, ink). */
export const inputCls =
  "h-11 w-full rounded-xl border border-white/10 bg-ink-950/60 px-3.5 text-[13.5px] text-white placeholder:text-white/35 outline-none transition focus:border-gold-300/60 focus:shadow-[0_0_0_4px_rgba(240,185,63,0.08)] disabled:opacity-60";

export function Card({ title, icon, action, children, className = "" }: { title?: ReactNode; icon?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel rounded-2xl p-4 md:p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 font-display text-[19px] font-semibold tracking-wide text-white md:text-[21px]">
            {icon && <span className="text-gold-300">{icon}</span>}
            {title}
          </h3>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Label({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11.5px] font-medium uppercase tracking-wider text-white/50">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-white/40">{hint}</span>}
    </label>
  );
}

export function Input({ label, hint, className = "", ...p }: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: ReactNode }) {
  const el = <input className={`${inputCls} ${className}`} {...p} />;
  return label ? <Label label={label} hint={hint}>{el}</Label> : el;
}

export function Textarea({ label, className = "", ...p }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  const el = <textarea className={`${inputCls} h-auto min-h-[96px] py-2.5 ${className}`} {...p} />;
  return label ? <Label label={label}>{el}</Label> : el;
}

export function Select({ label, options, className = "", ...p }: SelectHTMLAttributes<HTMLSelectElement> & { label?: string; options: { value: string | number; label: string }[] }) {
  const el = (
    <select className={`${inputCls} appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 fill=%22none%22 stroke=%22%23ffffff80%22 stroke-width=%222%22><path d=%22M2 4l4 4 4-4%22/></svg>')] bg-[length:12px] bg-[right_14px_center] bg-no-repeat pr-9 ${className}`} {...p}>
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-ink-800">
          {o.label}
        </option>
      ))}
    </select>
  );
  return label ? <Label label={label}>{el}</Label> : el;
}

const STATUS: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30",
  approved: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30",
  completed: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30",
  paid: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30",
  resolved: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30",
  pending: "bg-amber-500/15 text-amber-200 ring-amber-400/30",
  open: "bg-sky-500/15 text-sky-200 ring-sky-400/30",
  processing: "bg-sky-500/15 text-sky-200 ring-sky-400/30",
  in_progress: "bg-sky-500/15 text-sky-200 ring-sky-400/30",
  under_review: "bg-sky-500/15 text-sky-200 ring-sky-400/30",
  maintenance: "bg-amber-500/15 text-amber-200 ring-amber-400/30",
  resubmission: "bg-orange-500/15 text-orange-200 ring-orange-400/30",
  rejected: "bg-rose-500/15 text-rose-300 ring-rose-400/30",
  banned: "bg-rose-500/15 text-rose-300 ring-rose-400/30",
  failed: "bg-rose-500/15 text-rose-300 ring-rose-400/30",
  suspended: "bg-orange-500/15 text-orange-200 ring-orange-400/30",
  cancelled: "bg-white/10 text-white/55 ring-white/15",
  reversed: "bg-white/10 text-white/55 ring-white/15",
  expired: "bg-white/10 text-white/55 ring-white/15",
  forfeited: "bg-white/10 text-white/55 ring-white/15",
  closed: "bg-white/10 text-white/55 ring-white/15",
  inactive: "bg-white/10 text-white/55 ring-white/15",
  none: "bg-white/10 text-white/55 ring-white/15",
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const s = status ?? "none";
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-semibold capitalize ring-1 ${STATUS[s] ?? "bg-gold-400/10 text-gold-200 ring-gold-300/30"}`}>{s.replace(/_/g, " ")}</span>;
}

export function Progress({ value, className = "" }: { value: number; className?: string }) {
  return (
    <div className={`h-2 overflow-hidden rounded-full bg-white/10 ${className}`}>
      <div className="h-full rounded-full bg-gold-gradient transition-all duration-700" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Stat({ label, value, sub, icon, accent = "text-white" }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; accent?: string }) {
  return (
    <div className="panel rounded-2xl p-4">
      <div className="flex items-center justify-between text-[11.5px] uppercase tracking-wider text-white/50">
        {label}
        {icon && <span className="text-gold-300">{icon}</span>}
      </div>
      <p className={`mt-1.5 font-display text-[26px] font-semibold tabular-nums leading-none ${accent}`}>{value}</p>
      {sub && <p className="mt-1.5 text-[11.5px] text-white/45">{sub}</p>}
    </div>
  );
}

export function Empty({ text = "Nothing here yet." }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-[13px] text-white/45">
      <Inbox className="h-7 w-7 text-white/25" />
      {text}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return (
    <div className="mt-4 flex items-center justify-between text-[12px] text-white/50">
      <span>
        {(page - 1) * pageSize + 1}–{Math.min(total, page * pageSize)} of {total}
      </span>
      <div className="flex gap-1.5">
        <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 disabled:opacity-40 hover:border-gold-300/50" aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="grid h-8 min-w-8 place-items-center px-2 text-white/80">
          {page}/{pages}
        </span>
        <button disabled={page >= pages} onClick={() => onPage(page + 1)} className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 disabled:opacity-40 hover:border-gold-300/50" aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="-mx-4 overflow-x-auto md:-mx-5">
      <table className="w-full min-w-[640px] text-left text-[12.5px]">
        <thead>
          <tr className="border-b border-white/[0.06] text-[10.5px] uppercase tracking-wider text-white/40">
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-4 py-2.5 font-medium first:pl-4 md:first:pl-5">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04] [&_td]:px-4 [&_td]:py-3 [&_td:first-child]:md:pl-5">{children}</tbody>
      </table>
      {empty && <Empty />}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useApi<T = any>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    try {
      setData(await api<T>(url));
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [url]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, loading, error, reload, setData };
}

export function Spinner() {
  return <div className="mx-auto my-10 h-7 w-7 animate-spin rounded-full border-2 border-gold-300/30 border-t-gold-300" />;
}
