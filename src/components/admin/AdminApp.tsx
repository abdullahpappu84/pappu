"use client";

import {
  BadgePercent, BarChart3, Bell, CreditCard, Crown, FileCheck2, FileText, Gamepad2, Gift, Image as ImageIcon, KeyRound, LayoutDashboard,
  ListChecks, LogOut, Plug, Menu, MessagesSquare, Receipt, ScrollText, Settings, Shield, ShieldCheck, Ticket, Trophy, UserCog, Users, Wallet, X, Handshake, Megaphone, ArrowDownToLine, ArrowUpFromLine,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { Card, Input, Spinner } from "@/components/ui/kit";
import { api, errMsg } from "@/lib/api";
import { RESOURCE_MAP } from "@/lib/admin/resources";
import { ResourceManager } from "./ResourceManager";
import { DashboardSection, KycSection, UsersSection } from "./SectionsPlayers";
import { CommissionsSection, DepositsSection, ReportsSection, TransactionsSection, WithdrawalsSection } from "./SectionsFinance";
import { AuditSection, NotificationsSection, SettingsSection, TicketsSection } from "./SectionsOps";
import { IntegrationsSection } from "./IntegrationsSection";
import { GameManagement } from "./GameManagement";
import { SportsApiManagement } from "./SportsApiManagement";

export type AdminMe = { admin: { id: string; name: string; email: string; twoFactorEnabled: boolean }; roles: { name: string }[]; permissions: string[]; needs2faSetup: boolean };
export const canDo = (me: AdminMe, perm: string) => me.permissions.includes("*") || me.permissions.includes(perm);

type NavItem = { id: string; label: string; icon: typeof Users; perm: string; render: (me: AdminMe) => ReactNode };
const res = (key: string) => {
  const ResourceSection = (me: AdminMe) => <ResourceManager resource={RESOURCE_MAP[key]} me={me} />;
  ResourceSection.displayName = `AdminResource_${key}`;
  return ResourceSection;
};

const NAV: { group: string; items: NavItem[] }[] = [
  { group: "Overview", items: [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, perm: "dashboard.view", render: () => <DashboardSection /> },
    { id: "reports", label: "Financial Reports", icon: BarChart3, perm: "reports.view", render: (me) => <ReportsSection me={me} /> },
  ] },
  { group: "Players", items: [
    { id: "users", label: "Users", icon: Users, perm: "users.view", render: (me) => <UsersSection me={me} /> },
    { id: "kyc", label: "KYC Review", icon: FileCheck2, perm: "kyc.view", render: (me) => <KycSection me={me} /> },
    { id: "notifications", label: "Send Notifications", icon: Bell, perm: "marketing.notifications", render: () => <NotificationsSection /> },
  ] },
  { group: "Finance", items: [
    { id: "deposits", label: "Deposits", icon: ArrowDownToLine, perm: "finance.view", render: (me) => <DepositsSection me={me} /> },
    { id: "withdrawals", label: "Withdrawals", icon: ArrowUpFromLine, perm: "finance.view", render: (me) => <WithdrawalsSection me={me} /> },
    { id: "transactions", label: "Ledger", icon: Receipt, perm: "finance.view", render: () => <TransactionsSection /> },
    { id: "payment-methods", label: "Payment Methods", icon: CreditCard, perm: "finance.view", render: res("payment-methods") },
    { id: "custom-gateways", label: "Custom Gateways", icon: Plug, perm: "finance.settings", render: () => <IntegrationsSection kind="payment" /> },
  ] },
  { group: "Games", items: [
    { id: "game-management", label: "Game Management", icon: Gamepad2, perm: "games.view", render: (me) => <GameManagement me={me} /> },
    { id: "sports-apis", label: "Sports API Management", icon: Trophy, perm: "games.edit", render: () => <SportsApiManagement /> },
  ] },
  { group: "Marketing", items: [
    { id: "bonuses", label: "Bonuses", icon: Gift, perm: "bonuses.view", render: res("bonuses") },
    { id: "promo-codes", label: "Promo Codes", icon: Ticket, perm: "bonuses.view", render: res("promo-codes") },
    { id: "vip-levels", label: "VIP Levels", icon: Crown, perm: "bonuses.view", render: res("vip-levels") },
    { id: "banners", label: "Banners", icon: ImageIcon, perm: "content.banners", render: res("banners") },
    { id: "promotions", label: "Promotions", icon: Megaphone, perm: "content.promotions", render: res("promotions") },
  ] },
  { group: "Affiliates", items: [
    { id: "agents", label: "Agents & Affiliates", icon: Handshake, perm: "affiliates.view", render: res("agents") },
    { id: "commissions", label: "Referrals & Commissions", icon: BadgePercent, perm: "affiliates.view", render: (me) => <CommissionsSection me={me} /> },
  ] },
  { group: "Support", items: [
    { id: "tickets", label: "Support Inbox", icon: MessagesSquare, perm: "support.view", render: (me) => <TicketsSection me={me} /> },
    { id: "canned-responses", label: "Canned Responses", icon: ListChecks, perm: "support.view", render: res("canned-responses") },
  ] },
  { group: "Content", items: [{ id: "pages", label: "CMS Pages", icon: FileText, perm: "content.pages", render: res("pages") }] },
  { group: "System", items: [
    { id: "roles", label: "Roles & Permissions", icon: Shield, perm: "roles.view", render: res("roles") },
    { id: "admins", label: "Admin Accounts", icon: UserCog, perm: "admins.manage", render: res("admins") },
    { id: "settings", label: "Site Settings & SEO", icon: Settings, perm: "settings.view", render: (me) => <SettingsSection me={me} /> },
    { id: "audit", label: "Audit Log", icon: ScrollText, perm: "audit.view", render: () => <AuditSection /> },
    { id: "security", label: "My Security", icon: KeyRound, perm: "", render: (me) => <MySecurity me={me} /> },
  ] },
];

export function MySecurity({ me, onDone }: { me: AdminMe; onDone?: () => void }) {
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      setMsg(`✔ ${ok}`);
      return true;
    } catch (e) {
      setMsg(`✖ ${errMsg(e)}`);
      return false;
    }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Two-factor authentication" icon={<ShieldCheck className="h-5 w-5" />}>
        {codes ? (
          <div>
            <p className="text-[13px] text-white/65">Store these recovery codes securely:</p>
            <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[13px] text-gold-100">{codes.map((c) => <span key={c} className="rounded bg-white/[0.04] px-2 py-1 text-center">{c}</span>)}</div>
            <Button className="mt-4" onClick={() => (onDone ? onDone() : window.location.reload())}>Continue</Button>
          </div>
        ) : me.admin.twoFactorEnabled ? (
          <div className="space-y-3">
            <p className="text-[13px] text-emerald-300">2FA is enabled on your admin account.</p>
            <Input label="Code (to disable)" value={code} onChange={(e) => setCode(e.target.value)} />
            <Button variant="outline" onClick={() => act(() => api("/api/admin/auth/2fa-disable", { body: { code } }), "2FA disabled").then((ok) => ok && window.location.reload())}>Disable 2FA</Button>
          </div>
        ) : setup ? (
          <div className="space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={setup.qr} alt="QR" className="h-40 w-40 rounded-xl bg-white p-2" />
            <p className="break-all font-mono text-[11.5px] text-white/50">{setup.secret}</p>
            <Input label="Verification code" value={code} onChange={(e) => setCode(e.target.value)} />
            <Button onClick={async () => { try { const r = await api<{ recoveryCodes: string[] }>("/api/admin/auth/2fa-enable", { body: { code } }); setCodes(r.recoveryCodes); } catch (e) { setMsg(`✖ ${errMsg(e)}`); } }}>Verify &amp; enable</Button>
          </div>
        ) : (
          <Button onClick={async () => setSetup(await api("/api/admin/auth/2fa-setup", { method: "POST" }))}>Set up 2FA</Button>
        )}
      </Card>
      <Card title="Change password" icon={<KeyRound className="h-5 w-5" />}>
        <div className="space-y-3">
          <Input label="Current password" type="password" value={pw.currentPassword} onChange={(e) => setPw((p) => ({ ...p, currentPassword: e.target.value }))} />
          <Input label="New password" type="password" value={pw.newPassword} onChange={(e) => setPw((p) => ({ ...p, newPassword: e.target.value }))} hint="10+ characters with letters and numbers" />
          <Button onClick={() => act(() => api("/api/admin/auth/password", { body: pw }), "Password updated")}>Update password</Button>
        </div>
      </Card>
      {msg && <p className="text-[13px] text-white/70 lg:col-span-2">{msg}</p>}
    </div>
  );
}

export function AdminApp() {
  const router = useRouter();
  const section = useSearchParams().get("s") ?? "dashboard";
  const [me, setMe] = useState<AdminMe | null>(null);
  const [navOpen, setNavOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setMe(await api<AdminMe>("/api/admin/auth/me"));
    } catch {
      router.replace("/admin/login");
    }
  }, [router]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  if (!me) return <Spinner />;
  const logout = async () => {
    await api("/api/admin/auth/logout", { method: "POST" }).catch(() => null);
    router.replace("/admin/login");
  };

  if (me.needs2faSetup)
    return (
      <main className="mx-auto max-w-3xl p-6">
        <Logo />
        <h1 className="mt-6 font-display text-[28px] font-semibold text-white">Two-factor authentication required</h1>
        <p className="mb-5 mt-1 text-[13.5px] text-white/60">Your organisation requires 2FA for all admin accounts. Set it up to continue.</p>
        <MySecurity me={me} onDone={load} />
      </main>
    );

  const items = NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.perm || canDo(me, i.perm)) })).filter((g) => g.items.length);
  const all = items.flatMap((g) => g.items);
  const current = all.find((i) => i.id === section || (i.id === "game-management" && ["games", "categories", "providers", "aggregator", "custom-game-apis", "game-api-management"].includes(section))) ?? all[0];

  const sidebar = (
    <nav className="space-y-5 p-4">
      {items.map((g) => (
        <div key={g.group}>
          <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/35">{g.group}</p>
          {g.items.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => { router.push(`/admin?s=${id}`); setNavOpen(false); }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition ${current?.id === id ? "bg-gold-400/15 text-gold-200" : "text-white/65 hover:bg-white/5 hover:text-white"}`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[250px_1fr]">
      <aside className="sticky top-0 hidden h-screen overflow-y-auto border-r border-white/[0.06] bg-ink-900/80 lg:block">
        <div className="border-b border-white/[0.06] p-4"><Logo size="sm" /><p className="mt-1 text-[10px] uppercase tracking-[0.25em] text-gold-300/70">Admin Console</p></div>
        {sidebar}
      </aside>
      {navOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setNavOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 overflow-y-auto bg-ink-900">
            <div className="flex items-center justify-between border-b border-white/[0.06] p-4"><Logo size="sm" /><button onClick={() => setNavOpen(false)} aria-label="Close"><X className="h-5 w-5 text-white/70" /></button></div>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-[60px] items-center gap-3 border-b border-white/[0.06] bg-ink-950/85 px-4 backdrop-blur-xl md:px-6">
          <button className="lg:hidden" onClick={() => setNavOpen(true)} aria-label="Menu"><Menu className="h-5 w-5 text-white/80" /></button>
          <h1 className="font-display text-[20px] font-semibold uppercase tracking-wide text-white">{current?.label}</h1>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right leading-tight sm:block">
              <p className="text-[12.5px] text-white">{me.admin.name}</p>
              <p className="text-[10.5px] text-gold-300/80">{me.roles.map((r) => r.name).join(", ") || "No role"}</p>
            </div>
            <a href="/" target="_blank" className="hidden text-[12px] text-white/50 hover:text-gold-200 md:block">View site ↗</a>
            <button onClick={logout} className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-white/70 hover:text-rose-300" aria-label="Sign out"><LogOut className="h-4 w-4" /></button>
          </div>
        </header>
        <main className="p-4 md:p-6">{current ? current.render(me) : <p className="text-white/60">No sections available for your role.</p>}</main>
      </div>
    </div>
  );
}

export { Wallet };
