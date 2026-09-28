"use client";

import { KeyRound, Lock, Mail, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { inputCls } from "@/components/ui/kit";
import { api, errMsg } from "@/lib/api";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [ticket, setTicket] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (ticket) await api("/api/admin/auth/login-2fa", { body: { ticket, code } });
      else {
        const r = await api<{ requires2fa?: boolean; ticket?: string }>("/api/admin/auth/login", { body: { email, password } });
        if (r.requires2fa && r.ticket) {
          setTicket(r.ticket);
          return;
        }
      }
      router.replace("/admin");
      router.refresh();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <form onSubmit={submit} className="panel w-full max-w-sm space-y-4 rounded-3xl p-7">
        <div className="text-center">
          <Logo className="justify-center" />
          <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.25em] text-gold-300/80"><ShieldCheck className="h-3.5 w-3.5" /> Secure Admin Access</p>
        </div>
        {ticket ? (
          <label className="relative block">
            <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <input className={`${inputCls} h-12 pl-10 tracking-[0.3em]`} value={code} onChange={(e) => setCode(e.target.value)} placeholder="2FA code" autoFocus required />
          </label>
        ) : (
          <>
            <label className="relative block">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
              <input className={`${inputCls} h-12 pl-10`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Admin email" autoComplete="username" required />
            </label>
            <label className="relative block">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
              <input className={`${inputCls} h-12 pl-10`} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" autoComplete="current-password" required />
            </label>
          </>
        )}
        {error && <p className="rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-[12.5px] text-rose-200">{error}</p>}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? "Verifying…" : ticket ? "Verify code" : "Sign in"}</Button>
        <p className="text-center text-[11px] text-white/35">All admin activity is logged. Unauthorised access is prohibited.</p>
      </form>
    </main>
  );
}
