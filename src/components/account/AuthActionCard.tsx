"use client";

import { CheckCircle2, Lock } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { Button } from "@/components/ui/Button";
import { LogoMark } from "@/components/ui/Logo";
import { api, errMsg } from "@/lib/api";

/** Handles /auth/reset-password and /auth/verify-email links. */
export function AuthActionCard({ kind }: { kind: "reset" | "verify" }) {
  const token = useSearchParams().get("token") ?? "";
  const { openAuth, refreshUser, go } = useApp();
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">(kind === "verify" ? "busy" : "idle");
  const [msg, setMsg] = useState("");
  const [pw, setPw] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    if (kind !== "verify" || ran.current) return;
    ran.current = true;
    api("/api/auth/verify-email", { body: { token } })
      .then(() => {
        setState("done");
        refreshUser();
      })
      .catch((e) => {
        setState("error");
        setMsg(errMsg(e));
      });
  }, [kind, token, refreshUser]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setState("busy");
    try {
      await api("/api/auth/reset-password", { body: { token, password: pw } });
      setState("done");
    } catch (err) {
      setState("error");
      setMsg(errMsg(err));
    }
  };

  return (
    <main className="container-x grid min-h-[60vh] place-items-center py-12">
      <div className="panel w-full max-w-md rounded-3xl p-8 text-center">
        <LogoMark className="mx-auto h-12 w-12" />
        {state === "done" ? (
          <>
            <CheckCircle2 className="mx-auto mt-5 h-10 w-10 text-emerald-400" />
            <h1 className="mt-3 font-display text-[28px] font-semibold text-white">{kind === "reset" ? "Password updated" : "Email verified"}</h1>
            <p className="mt-2 text-[13.5px] text-white/60">{kind === "reset" ? "You can now sign in with your new password." : "Thank you — your email address is confirmed."}</p>
            <Button className="mt-6" pill onClick={() => (kind === "reset" ? openAuth("login") : go("/account"))}>
              {kind === "reset" ? "Login" : "Go to my account"}
            </Button>
          </>
        ) : kind === "verify" ? (
          <>
            <h1 className="mt-5 font-display text-[28px] font-semibold text-white">Verifying…</h1>
            {state === "error" && <p className="mt-3 text-[13.5px] text-rose-300">{msg}</p>}
          </>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-4 text-left">
            <h1 className="text-center font-display text-[28px] font-semibold text-white">Set a new password</h1>
            <label className="relative block">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
              <input
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                minLength={8}
                required
                placeholder="New password (8+ chars, letter & number)"
                className="h-12 w-full rounded-xl border border-white/10 bg-ink-950/60 pl-11 pr-4 text-[14px] text-white outline-none focus:border-gold-300/60"
              />
            </label>
            {state === "error" && <p className="text-[12.5px] text-rose-300">{msg}</p>}
            <Button type="submit" size="lg" className="w-full" disabled={state === "busy" || !token}>
              {state === "busy" ? "Saving…" : "Update password"}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
