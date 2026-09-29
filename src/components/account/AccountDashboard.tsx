"use client";

import { Bell, Crown, FileCheck2, Gift, Heart, Headset, LayoutDashboard, LogOut, Receipt, ShieldCheck, User, Users, Wallet, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { Avatar } from "@/components/header/HeaderMenus";
import { Button } from "@/components/ui/Button";
import { Card, Progress, Spinner, Stat, StatusBadge, useApi } from "@/components/ui/kit";
import { fmtDate, money } from "@/lib/api";
import { DepositTab, TransactionsTab, WalletOverview, WithdrawTab } from "./WalletTabs";
import { ProfileTab, SecurityTab } from "./ProfileTabs";
import { BonusesTab, GamesTab, ReferralsTab, VipTab } from "./RewardsTabs";
import { KycTab, NotificationsTab, SupportTab } from "./SupportTabs";

const TABS: { id: string; label: string; icon: typeof User; render: () => ReactNode }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, render: () => <Overview /> },
  { id: "wallet", label: "Wallet", icon: Wallet, render: () => <WalletOverview /> },
  { id: "deposit", label: "Deposit", icon: ArrowDownToLine, render: () => <DepositTab /> },
  { id: "withdraw", label: "Withdraw", icon: ArrowUpFromLine, render: () => <WithdrawTab /> },
  { id: "transactions", label: "Transactions", icon: Receipt, render: () => <TransactionsTab /> },
  { id: "bonuses", label: "Bonuses", icon: Gift, render: () => <BonusesTab /> },
  { id: "vip", label: "VIP", icon: Crown, render: () => <VipTab /> },
  { id: "referrals", label: "Referrals", icon: Users, render: () => <ReferralsTab /> },
  { id: "games", label: "My Games", icon: Heart, render: () => <GamesTab /> },
  { id: "profile", label: "Profile", icon: User, render: () => <ProfileTab /> },
  { id: "security", label: "Security", icon: ShieldCheck, render: () => <SecurityTab /> },
  { id: "kyc", label: "Verification", icon: FileCheck2, render: () => <KycTab /> },
  { id: "notifications", label: "Notifications", icon: Bell, render: () => <NotificationsTab /> },
  { id: "support", label: "Support", icon: Headset, render: () => <SupportTab /> },
];

function Overview() {
  const { settings, go } = useApp();
  const { data } = useApi<{ user: { balance: number; bonus: number; vipLevel: string; vipProgress: number; vipPoints: number; referralCode: string; status: string; emailVerified: boolean; kycStatus: string }; recentTransactions: { id: string; reference: string; type: string; amount: string; createdAt: string; status: string }[]; activeBonuses: unknown[]; referrals: number; memberSince: string }>("/api/me/dashboard");
  const sym = settings.locale.currencySymbol;
  if (!data) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Main balance" value={money(data.user.balance, sym)} icon={<Wallet className="h-4 w-4" />} />
        <Stat label="Bonus balance" value={money(data.user.bonus, sym)} accent="text-gold-200" icon={<Gift className="h-4 w-4" />} sub={`${data.activeBonuses.length} active bonus(es)`} />
        <Stat label="VIP level" value={data.user.vipLevel} accent="text-gold-gradient" icon={<Crown className="h-4 w-4" />} sub={<Progress value={data.user.vipProgress} className="mt-1" />} />
        <Stat label="Referrals" value={data.referrals} icon={<Users className="h-4 w-4" />} sub={`Code ${data.user.referralCode}`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Recent activity" icon={<Receipt className="h-5 w-5" />} action={<button onClick={() => go("/account?tab=transactions")} className="text-[12px] text-sky-300 hover:text-gold-200">View all</button>}>
          {!data.recentTransactions.length ? <p className="py-6 text-center text-[13px] text-white/45">No activity yet — make your first deposit!</p> : (
            <ul className="divide-y divide-white/[0.05]">
              {data.recentTransactions.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-[12.5px]">
                  <span>
                    <span className="block capitalize text-white">{t.type.replace(/_/g, " ")}</span>
                    <span className="text-white/40">{fmtDate(t.createdAt)} · {t.reference}</span>
                  </span>
                  <span className={`font-semibold tabular-nums ${Number(t.amount) >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{money(t.amount, sym)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Account status" icon={<ShieldCheck className="h-5 w-5" />}>
          <ul className="space-y-3 text-[13px]">
            <li className="flex justify-between"><span className="text-white/55">Account</span><StatusBadge status={data.user.status} /></li>
            <li className="flex justify-between"><span className="text-white/55">Email</span><StatusBadge status={data.user.emailVerified ? "approved" : "pending"} /></li>
            <li className="flex justify-between"><span className="text-white/55">Identity (KYC)</span><StatusBadge status={data.user.kycStatus} /></li>
            <li className="flex justify-between"><span className="text-white/55">VIP points</span><span className="text-white">{data.user.vipPoints.toLocaleString()}</span></li>
            <li className="flex justify-between"><span className="text-white/55">Member since</span><span className="text-white">{fmtDate(data.memberSince, false)}</span></li>
          </ul>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button size="sm" onClick={() => go("/account?tab=deposit")}>Deposit</Button>
            <Button size="sm" variant="outline" onClick={() => go("/account?tab=withdraw")}>Withdraw</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

export function AccountDashboard() {
  const { user, openAuth, logout } = useApp();
  const router = useRouter();
  const tab = useSearchParams().get("tab") ?? "overview";
  const current = TABS.find((t) => t.id === tab) ?? TABS[0];

  if (!user)
    return (
      <main className="container-x grid min-h-[60vh] place-items-center py-12">
        <div className="panel max-w-md rounded-3xl p-8 text-center">
          <h1 className="font-display text-[30px] font-semibold text-white">Sign in to your account</h1>
          <p className="mt-2 text-[13.5px] text-white/60">Access your wallet, bonuses, VIP progress and more.</p>
          <div className="mt-6 flex justify-center gap-2">
            <Button variant="outline" onClick={() => openAuth("login")}>Login</Button>
            <Button onClick={() => openAuth("register")}>Register</Button>
          </div>
        </div>
      </main>
    );

  return (
    <main className="container-x py-5 lg:py-8">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[260px_minmax(0,1fr)] xl:gap-7">
        <aside className="min-w-0 lg:sticky lg:top-[88px] lg:self-start">
          <div className="panel hidden rounded-2xl p-4 lg:block">
            <div className="flex items-center gap-3">
              <Avatar name={user.name} url={user.avatarUrl} className="h-11 w-11 text-[14px]" />
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold text-white">{user.name}</p>
                <p className="flex items-center gap-1 text-[11.5px] text-gold-300"><Crown className="h-3 w-3" /> {user.vipLevel}</p>
              </div>
            </div>
          </div>
          <nav aria-label="Account" className="-mx-4 mt-0 flex gap-1.5 overflow-x-auto px-4 pb-1 no-scrollbar lg:mx-0 lg:mt-3 lg:flex-col lg:overflow-visible lg:px-0">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => router.push(`/account?tab=${id}`, { scroll: false })}
                className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-[13px] font-medium transition lg:w-full ${
                  current.id === id ? "bg-gold-400/15 text-gold-200 ring-1 ring-gold-300/40" : "text-white/70 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
            <button onClick={logout} className="hidden items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-[13px] text-rose-300/90 hover:bg-rose-500/10 lg:flex">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </nav>
        </aside>
        <section className="min-w-0">
          <h1 className="mb-4 font-display text-[28px] font-semibold uppercase tracking-wide text-white md:text-[32px]">{current.label}</h1>
          {current.render()}
        </section>
      </div>
    </main>
  );
}
