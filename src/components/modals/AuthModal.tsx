"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { ArrowLeft, Check, Eye, EyeOff, Gift, KeyRound, Lock, Mail, Phone, ShieldCheck, Ticket, User } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/providers/AppProvider";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { LogoMark } from "@/components/ui/Logo";
import { api, ApiClientError, errMsg } from "@/lib/api";
import type { SessionUser } from "@/lib/types";

function Field({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <label className="relative block">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40">{icon}</span>
      {children}
    </label>
  );
}

const inputCls =
  "h-12 w-full rounded-xl border border-white/10 bg-ink-950/60 pl-11 pr-4 text-[14px] text-white placeholder:text-white/35 outline-none transition focus:border-gold-300/60 focus:shadow-[0_0_0_4px_rgba(240,185,63,0.08)]";

type AuthResponse = { user?: SessionUser; requires2fa?: boolean; ticket?: string; devLink?: string };

export function AuthModal() {
  const { authMode, closeAuth, openAuth, setUser, notify, settings } = useApp();
  const router = useRouter();
  const [showPw, setShowPw] = useState(false);
  const [agree, setAgree] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", referralCode: "", code: "" });
  const mode = authMode ?? "login";

  useEffect(() => {
    if (!authMode) return;
    setError(null);
    setTicket(null);
    setDevLink(null);
    const ref = typeof window !== "undefined" ? localStorage.getItem("ar_ref") : null;
    if (ref) setForm((f) => ({ ...f, referralCode: f.referralCode || ref }));
  }, [authMode]);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const done = (r: AuthResponse, title: string) => {
    if (r.user) setUser(r.user);
    closeAuth();
    notify({ title, description: r.devLink ? "Check your inbox to verify your email." : undefined, tone: "success" });
    router.refresh();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (ticket) {
        const r = await api<AuthResponse>("/api/auth/login-2fa", { body: { ticket, code: form.code } });
        return done(r, `Welcome back, ${r.user?.name.split(" ")[0] ?? ""}`);
      }
      if (mode === "forgot") {
        const r = await api<{ message: string; devLink?: string }>("/api/auth/forgot-password", { body: { email: form.email } });
        setDevLink(r.devLink ?? null);
        notify({ title: "Check your email", description: r.message, tone: "info" });
        return;
      }
      if (mode === "login") {
        const r = await api<AuthResponse>("/api/auth/login", { body: { email: form.email, password: form.password } });
        if (r.requires2fa && r.ticket) return setTicket(r.ticket);
        return done(r, `Welcome back, ${r.user?.name.split(" ")[0] ?? ""}`);
      }
      const r = await api<AuthResponse>("/api/auth/register", {
        body: { name: form.name, email: form.email, phone: form.phone, password: form.password, referralCode: form.referralCode || undefined, acceptTerms: agree },
      });
      localStorage.removeItem("ar_ref");
      if (r.devLink) console.info("Email verification link (dev):", r.devLink);
      done(r, "Account created — welcome!");
    } catch (err) {
      const details = err instanceof ApiClientError ? (err.details as { devLink?: string } | undefined) : undefined;
      if (details?.devLink) setDevLink(details.devLink);
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const title = ticket ? "Two-step verification" : mode === "login" ? "Welcome back" : mode === "register" ? "Create account" : "Reset password";
  const subtitle = ticket
    ? "Enter the 6-digit code from your authenticator app, or a recovery code."
    : mode === "login"
      ? "Sign in with your email or phone number."
      : mode === "register"
        ? "Join in under a minute and claim your welcome bonus."
        : "We'll email you a secure link to set a new password.";

  return (
    <Modal open={authMode !== null} onClose={closeAuth} label={title} maxWidth="md:max-w-[860px]">
      <div className="grid md:grid-cols-[1fr_1.1fr]">
        {/* Visual side */}
        <div className="relative hidden min-h-[560px] overflow-hidden md:block">
          <Image src="/images/hero-main.jpg" alt="" fill sizes="430px" className="object-cover object-[62%_center]" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/40 to-ink-950/20" />
          <div className="absolute inset-x-0 bottom-0 p-7">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-400/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-gold-200 ring-1 ring-gold-300/30">
              <Gift className="h-3.5 w-3.5" /> Welcome package
            </span>
            <p className="mt-3 font-display text-[40px] font-bold uppercase leading-[0.95] text-white">
              Up to <span className="text-gold-gradient">200%</span>
              <br />+ 150 Free Spins
            </p>
            <ul className="mt-4 space-y-1.5 text-[12.5px] text-white/70">
              {["Instant registration", "Fast & secure withdrawals", "24/7 VIP support"].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-gold-300" /> {t}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Form side */}
        <div className="p-6 pt-8 md:p-8">
          <div className="flex items-center gap-2.5">
            {(ticket || mode === "forgot") && (
              <button onClick={() => (ticket ? setTicket(null) : openAuth("login"))} aria-label="Back" className="grid h-8 w-8 place-items-center rounded-lg text-white/60 hover:bg-white/5 hover:text-white">
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <LogoMark className="h-8 w-8" />
            <p className="font-display text-[26px] font-semibold leading-none text-white">{title}</p>
          </div>
          <p className="mt-2 text-[13px] text-white/50">{subtitle}</p>

          {!ticket && mode !== "forgot" && (
            <div className="relative mt-5 grid grid-cols-2 rounded-xl border border-white/10 bg-ink-950/60 p-1">
              {(["login", "register"] as const).map((m) => (
                <button key={m} onClick={() => openAuth(m)} className={`relative z-10 h-10 rounded-lg text-[13px] font-semibold capitalize transition-colors ${mode === m ? "text-ink-950" : "text-white/65 hover:text-white"}`}>
                  {mode === m && <motion.span layoutId="auth-tab" className="absolute inset-0 -z-10 rounded-lg bg-gold-gradient" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                  {m}
                </button>
              ))}
            </div>
          )}

          <form className="mt-5 space-y-3" onSubmit={submit}>
            {ticket ? (
              <Field icon={<KeyRound className="h-4 w-4" />}>
                <input className={`${inputCls} tracking-[0.3em]`} value={form.code} onChange={set("code")} placeholder="123456" autoComplete="one-time-code" autoFocus required />
              </Field>
            ) : (
              <>
                {mode === "register" && (
                  <Field icon={<User className="h-4 w-4" />}>
                    <input className={inputCls} value={form.name} onChange={set("name")} placeholder="Full name" autoComplete="name" required minLength={2} />
                  </Field>
                )}
                <Field icon={<Mail className="h-4 w-4" />}>
                  <input className={inputCls} type={mode === "login" ? "text" : "email"} value={form.email} onChange={set("email")} placeholder={mode === "login" ? "Email or phone" : "Email address"} autoComplete="email" required />
                </Field>
                {mode === "register" && (
                  <Field icon={<Phone className="h-4 w-4" />}>
                    <input className={inputCls} type="tel" value={form.phone} onChange={set("phone")} placeholder={`Phone${settings.registration.requirePhone ? "" : " (optional)"}`} autoComplete="tel" required={settings.registration.requirePhone} />
                  </Field>
                )}
                {mode !== "forgot" && (
                  <Field icon={<Lock className="h-4 w-4" />}>
                    <input className={`${inputCls} pr-12`} type={showPw ? "text" : "password"} value={form.password} onChange={set("password")} placeholder="Password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "register" ? 8 : 1} />
                    <button type="button" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-white/45 hover:text-white">
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </Field>
                )}
                {mode === "register" && (
                  <>
                    <Field icon={<Ticket className="h-4 w-4" />}>
                      <input className={`${inputCls} uppercase`} value={form.referralCode} onChange={set("referralCode")} placeholder="Referral code (optional)" />
                    </Field>
                    <p className="text-[11px] text-white/40">Password: 8+ characters with at least one letter and one number.</p>
                    <button type="button" onClick={() => setAgree((a) => !a)} className="flex items-start gap-2.5 text-left text-[12px] text-white/55">
                      <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border ${agree ? "border-gold-300 bg-gold-400 text-ink-950" : "border-white/25"}`}>{agree && <Check className="h-3 w-3" strokeWidth={3} />}</span>
                      I confirm I am 18+ and accept the Terms &amp; Conditions and Privacy Policy.
                    </button>
                  </>
                )}
                {mode === "login" && (
                  <div className="flex justify-end">
                    <button type="button" onClick={() => openAuth("forgot")} className="text-[12px] text-gold-300 hover:text-gold-200">
                      Forgot password?
                    </button>
                  </div>
                )}
              </>
            )}

            {error && <p className="rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-[12.5px] text-rose-200">{error}</p>}
            {devLink && (
              <p className="break-all rounded-lg border border-sky-400/20 bg-sky-500/10 px-3 py-2 text-[11.5px] text-sky-100">
                Email delivery isn&apos;t configured — use this secure link:{" "}
                <a href={devLink} className="underline">
                  {devLink}
                </a>
              </p>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={busy || (mode === "register" && !agree && !ticket)}>
              {busy ? "Please wait…" : ticket ? "Verify" : mode === "login" ? "Login" : mode === "register" ? "Create Account" : "Send reset link"}
            </Button>
          </form>

          {!ticket && mode !== "forgot" && (settings.oauth.google || settings.oauth.facebook) && (
            <div className="mt-4">
              <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider text-white/35">
                <span className="h-px flex-1 bg-white/10" /> or continue with <span className="h-px flex-1 bg-white/10" />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {settings.oauth.google && (
                  // eslint-disable-next-line @next/next/no-html-link-for-pages
                  <a href="/api/oauth/google" className="flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-[13px] text-white/85 hover:border-gold-300/40">
                    Google
                  </a>
                )}
                {settings.oauth.facebook && (
                  // eslint-disable-next-line @next/next/no-html-link-for-pages
                  <a href="/api/oauth/facebook" className="flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-[13px] text-white/85 hover:border-gold-300/40">
                    Facebook
                  </a>
                )}
              </div>
            </div>
          )}

          <p className="mt-4 flex items-center justify-center gap-1.5 text-[11.5px] text-white/40">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400/80" />
            Secured with encrypted sessions · 18+ · Play responsibly
          </p>
        </div>
      </div>
    </Modal>
  );
}
