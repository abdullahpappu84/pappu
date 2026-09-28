"use client";

import { Camera, KeyRound, Laptop, MailCheck, Phone, ShieldCheck, User } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { Avatar } from "@/components/header/HeaderMenus";
import { Button } from "@/components/ui/Button";
import { Card, Input, Select, Spinner, StatusBadge, useApi } from "@/components/ui/kit";
import { api, errMsg, fmtDate } from "@/lib/api";
import type { SessionUser } from "@/lib/types";

type Profile = { dateOfBirth: string | null; country: string | null; city: string | null; address: string | null; postalCode: string | null; language: string | null; marketingOptIn: boolean };

export function ProfileTab() {
  const { user, setUser, notify } = useApp();
  const { data } = useApi<{ profile: Profile | null }>("/api/me/dashboard");
  const [form, setForm] = useState({ name: user?.name ?? "", phone: user?.phone ?? "", dateOfBirth: "", country: "", city: "", address: "", postalCode: "", language: "EN", marketingOptIn: true });
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (data?.profile) {
      const p = data.profile;
      setForm((f) => ({ ...f, dateOfBirth: p.dateOfBirth ?? "", country: p.country ?? "", city: p.city ?? "", address: p.address ?? "", postalCode: p.postalCode ?? "", language: p.language ?? "EN", marketingOptIn: p.marketingOptIn }));
    }
  }, [data]);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ user: SessionUser }>("/api/me/profile", { method: "PATCH", body: form });
      setUser(r.user);
      notify({ title: "Profile updated", tone: "success" });
    } catch (err) {
      notify({ title: "Update failed", description: errMsg(err), tone: "info" });
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File) => {
    const fd = new FormData();
    fd.set("file", file);
    try {
      const r = await api<{ user: SessionUser }>("/api/me/avatar", { form: fd });
      setUser(r.user);
      notify({ title: "Profile picture updated", tone: "success" });
    } catch (err) {
      notify({ title: "Upload failed", description: errMsg(err), tone: "info" });
    }
  };

  if (!user) return null;
  return (
    <Card title="Personal details" icon={<User className="h-5 w-5" />}>
      <div className="mb-5 flex items-center gap-4">
        <div className="relative">
          <Avatar name={user.name} url={user.avatarUrl} className="h-20 w-20 text-[22px]" />
          <button onClick={() => fileRef.current?.click()} aria-label="Change profile picture" className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-ink-800 text-gold-300 hover:text-gold-100">
            <Camera className="h-4 w-4" />
          </button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </div>
        <div>
          <p className="text-[16px] font-semibold text-white">{user.name}</p>
          <p className="text-[12.5px] text-white/55">{user.email}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <StatusBadge status={user.status} />
            <span className="rounded-full bg-gold-400/10 px-2 py-0.5 text-[10.5px] font-semibold text-gold-200 ring-1 ring-gold-300/30">{user.vipLevel}</span>
          </div>
        </div>
      </div>
      <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
        <Input label="Full name" value={form.name} onChange={set("name")} required minLength={2} />
        <Input label="Email" value={user.email} disabled hint="Contact support to change your email." />
        <Input label="Phone" value={form.phone} onChange={set("phone")} placeholder="+44…" hint={user.phoneVerified ? "Verified ✔" : "Not verified — verify under Security."} />
        <Input label="Date of birth" type="date" value={form.dateOfBirth} onChange={set("dateOfBirth")} />
        <Input label="Country" value={form.country} onChange={set("country")} />
        <Input label="City" value={form.city} onChange={set("city")} />
        <Input label="Address" value={form.address} onChange={set("address")} />
        <Input label="Postal code" value={form.postalCode} onChange={set("postalCode")} />
        <Select label="Language" value={form.language} onChange={set("language")} options={["EN", "DE", "ES", "FR", "PT", "TR", "JA"].map((v) => ({ value: v, label: v }))} />
        <label className="flex items-center gap-2.5 self-end pb-3 text-[13px] text-white/70">
          <input type="checkbox" checked={form.marketingOptIn} onChange={(e) => setForm((f) => ({ ...f, marketingOptIn: e.target.checked }))} className="h-4 w-4 accent-[#f0b93f]" />
          Receive promotional offers
        </label>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function SecurityTab() {
  const { user, refreshUser, notify, logout } = useApp();
  const sessions = useApi<{ items: { id: string; ip: string; userAgent: string; lastSeenAt: string; current: boolean }[] }>("/api/me/sessions");
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "" });
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [disablePw, setDisablePw] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [phoneCode, setPhoneCode] = useState("");
  const [phoneSent, setPhoneSent] = useState(false);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      notify({ title: ok, tone: "success" });
      refreshUser();
      return true;
    } catch (e) {
      notify({ title: "Action failed", description: errMsg(e), tone: "info" });
      return false;
    }
  };

  if (!user) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Change password" icon={<KeyRound className="h-5 w-5" />}>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run(() => api("/api/me/password", { body: pw }), "Password changed — other sessions signed out")) setPw({ currentPassword: "", newPassword: "" });
          }}
        >
          <Input label="Current password" type="password" value={pw.currentPassword} onChange={(e) => setPw((p) => ({ ...p, currentPassword: e.target.value }))} autoComplete="current-password" />
          <Input label="New password" type="password" value={pw.newPassword} onChange={(e) => setPw((p) => ({ ...p, newPassword: e.target.value }))} required minLength={8} autoComplete="new-password" hint="8+ characters with a letter and a number" />
          <Button type="submit">Update password</Button>
        </form>
      </Card>

      <Card title="Two-factor authentication" icon={<ShieldCheck className="h-5 w-5" />} action={<StatusBadge status={user.twoFactorEnabled ? "active" : "inactive"} />}>
        {codes ? (
          <div>
            <p className="text-[13px] text-white/70">Save these recovery codes somewhere safe. Each can be used once.</p>
            <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[13px] text-gold-100">
              {codes.map((c) => (
                <span key={c} className="rounded-lg bg-white/[0.04] px-3 py-1.5 text-center">
                  {c}
                </span>
              ))}
            </div>
            <Button className="mt-4" variant="outline" onClick={() => setCodes(null)}>
              I&apos;ve saved them
            </Button>
          </div>
        ) : user.twoFactorEnabled ? (
          <div className="space-y-3">
            <p className="text-[13px] text-white/65">Your account is protected with an authenticator app.</p>
            <Input label="Authenticator code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" />
            <Input label="Password (to disable)" type="password" value={disablePw} onChange={(e) => setDisablePw(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={async () => { try { const r = await api<{ recoveryCodes: string[] }>("/api/me/2fa/recovery", { body: { code } }); setCodes(r.recoveryCodes); setCode(""); } catch (e) { notify({ title: "Failed", description: errMsg(e), tone: "info" }); } }}>
                New recovery codes
              </Button>
              <Button variant="ghost" className="text-rose-300" onClick={() => run(() => api("/api/me/2fa/disable", { body: { code, password: disablePw } }), "2FA disabled").then((ok) => ok && setCode(""))}>
                Disable 2FA
              </Button>
            </div>
          </div>
        ) : setup ? (
          <div className="space-y-3">
            <p className="text-[13px] text-white/65">Scan with Google Authenticator, Authy or 1Password, then enter the 6-digit code.</p>
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={setup.qr} alt="2FA QR code" className="h-36 w-36 rounded-xl bg-white p-2" />
              <p className="break-all font-mono text-[11.5px] text-white/55">{setup.secret}</p>
            </div>
            <Input label="Verification code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" />
            <Button onClick={async () => { try { const r = await api<{ recoveryCodes: string[] }>("/api/me/2fa/enable", { body: { code } }); setCodes(r.recoveryCodes); setSetup(null); setCode(""); refreshUser(); } catch (e) { notify({ title: "Invalid code", description: errMsg(e), tone: "info" }); } }}>
              Verify &amp; enable
            </Button>
          </div>
        ) : (
          <div>
            <p className="text-[13px] text-white/65">Add a second layer of protection using a time-based code from your phone.</p>
            <Button className="mt-4" onClick={async () => { try { setSetup(await api("/api/me/2fa/setup", { method: "POST" })); } catch (e) { notify({ title: "Failed", description: errMsg(e), tone: "info" }); } }}>
              Enable 2FA
            </Button>
          </div>
        )}
      </Card>

      <Card title="Verification" icon={<MailCheck className="h-5 w-5" />}>
        <div className="space-y-4 text-[13px]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-white">Email</p>
              <p className="text-white/50">{user.email}</p>
            </div>
            {user.emailVerified ? (
              <StatusBadge status="approved" />
            ) : (
              <Button size="sm" variant="outline" onClick={async () => { try { const r = await api<{ devLink?: string }>("/api/auth/resend-verification", { method: "POST" }); notify({ title: "Verification email sent", description: r.devLink ? `Dev link: ${r.devLink}` : "Check your inbox.", tone: "info" }); if (r.devLink) console.info(r.devLink); } catch (e) { notify({ title: "Failed", description: errMsg(e), tone: "info" }); } }}>
                Resend link
              </Button>
            )}
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-white"><Phone className="h-3.5 w-3.5" /> Phone</p>
              <p className="text-white/50">{user.phone ?? "Not set — add it in Profile"}</p>
            </div>
            {user.phoneVerified ? (
              <StatusBadge status="approved" />
            ) : user.phone ? (
              <Button size="sm" variant="outline" onClick={async () => { try { const r = await api<{ devCode?: string }>("/api/auth/phone-send", { body: {} }); setPhoneSent(true); notify({ title: "Code sent", description: r.devCode ? `Dev code: ${r.devCode}` : "Check your SMS.", tone: "info" }); } catch (e) { notify({ title: "Failed", description: errMsg(e), tone: "info" }); } }}>
                Send code
              </Button>
            ) : null}
          </div>
          {phoneSent && !user.phoneVerified && (
            <div className="flex gap-2">
              <Input value={phoneCode} onChange={(e) => setPhoneCode(e.target.value)} placeholder="6-digit code" />
              <Button onClick={() => run(() => api("/api/auth/phone-verify", { body: { code: phoneCode } }), "Phone verified").then((ok) => ok && setPhoneSent(false))}>Verify</Button>
            </div>
          )}
        </div>
      </Card>

      <Card
        title="Active sessions"
        icon={<Laptop className="h-5 w-5" />}
        action={
          <button onClick={() => run(() => api("/api/me/sessions/revoke-others", { method: "POST" }), "Other sessions signed out").then(() => sessions.reload())} className="text-[12px] text-gold-300 hover:text-gold-200">
            Sign out others
          </button>
        }
      >
        {!sessions.data ? (
          <Spinner />
        ) : (
          <ul className="space-y-2">
            {sessions.data.items.map((s) => (
              <li key={s.id} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-[12.5px]">
                <Laptop className="h-4 w-4 shrink-0 text-white/40" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-white/85">{s.userAgent?.replace(/\(.*?\)/, "").slice(0, 60) || "Unknown device"}</p>
                  <p className="text-white/40">{s.ip} · {fmtDate(s.lastSeenAt)}</p>
                </div>
                {s.current ? (
                  <button onClick={logout} className="text-[11.5px] text-emerald-300">This device · Sign out</button>
                ) : (
                  <button onClick={() => run(() => api(`/api/me/sessions/${s.id}`, { method: "DELETE" }), "Session ended").then(() => sessions.reload())} className="text-[11.5px] text-rose-300 hover:underline">
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
