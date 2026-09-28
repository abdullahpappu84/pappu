"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bell, ChevronDown, Crown, Gift, Heart, LayoutDashboard, LogOut, Plus, Receipt, Settings, ShieldCheck, User, Wallet } from "lucide-react";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { useClickOutside } from "@/components/ui/useClickOutside";
import { fmtDate, money } from "@/lib/api";

function Dropdown({
  trigger,
  children,
  width = "w-72",
  onOpen,
}: {
  trigger: (open: boolean, toggle: () => void) => ReactNode;
  children: (close: () => void) => ReactNode;
  width?: string;
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close, open);
  return (
    <div ref={ref} className="relative">
      {trigger(open, () =>
        setOpen((o) => {
          if (!o) onOpen?.();
          return !o;
        }),
      )}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.16 }}
            className={`absolute right-0 top-full z-50 mt-2.5 ${width} max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-white/10 bg-ink-800/98 shadow-2xl backdrop-blur-xl`}
          >
            {children(close)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Avatar({ name, url, className = "h-8 w-8 text-[12px]" }: { name: string; url?: string | null; className?: string }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span className={`grid shrink-0 place-items-center overflow-hidden rounded-full bg-gold-gradient font-bold text-ink-950 ring-2 ring-gold-300/30 ${className}`}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        initials
      )}
    </span>
  );
}

export function NotificationsMenu({ compact = false }: { compact?: boolean }) {
  const { user, notifications, unread, markAllRead, loadNotifications, openAuth, go } = useApp();
  if (!user && !compact) return null;
  return (
    <Dropdown
      onOpen={loadNotifications}
      trigger={(open, toggle) => (
        <button
          onClick={() => (user ? toggle() : openAuth("login"))}
          aria-label="Notifications"
          className={`relative grid place-items-center rounded-lg text-white/85 transition hover:bg-white/5 hover:text-white ${
            compact ? "h-10 w-10" : "h-9 w-9 border border-white/10"
          } ${open ? "text-gold-200" : ""}`}
        >
          <Bell className="h-[21px] w-[21px] lg:h-[18px] lg:w-[18px]" />
          {unread > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-hot ring-2 ring-ink-950" />}
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
            <p className="text-[13px] font-semibold text-white">Notifications {unread > 0 && <span className="ml-1 rounded bg-hot px-1.5 text-[10px]">{unread}</span>}</p>
            <button onClick={markAllRead} className="text-[11.5px] text-gold-300 hover:text-gold-200">
              Mark all read
            </button>
          </div>
          <ul className="max-h-[360px] overflow-y-auto p-1.5">
            {notifications.length === 0 && <li className="px-3 py-6 text-center text-[12.5px] text-white/45">You&apos;re all caught up.</li>}
            {notifications.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => {
                    close();
                    if (n.link) go(n.link);
                  }}
                  className="flex w-full gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-white/[0.04]"
                >
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gold-400/10 text-gold-300">
                    <Gift className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] leading-snug text-white/90">{n.title}</span>
                    {n.body && <span className="mt-0.5 block truncate text-[11.5px] text-white/50">{n.body}</span>}
                    <span className="mt-0.5 block text-[11px] text-white/40">{fmtDate(n.createdAt)}</span>
                  </span>
                  {!n.readAt && <span className="mt-2 h-1.5 w-1.5 rounded-full bg-gold-300" />}
                </button>
              </li>
            ))}
          </ul>
          <button
            onClick={() => {
              close();
              go("/account?tab=notifications");
            }}
            className="w-full border-t border-white/5 py-2.5 text-[12px] text-white/60 hover:text-gold-200"
          >
            View all notifications
          </button>
        </div>
      )}
    </Dropdown>
  );
}

export function AccountMenu({ compact = false }: { compact?: boolean }) {
  const { user, logout, openAuth, go, settings } = useApp();

  if (!user) {
    return compact ? (
      <button onClick={() => openAuth("login")} aria-label="Account" className="grid h-10 w-10 place-items-center rounded-lg text-white/85 transition hover:bg-white/5 hover:text-white">
        <User className="h-[21px] w-[21px]" />
      </button>
    ) : null;
  }

  const items = [
    { icon: LayoutDashboard, label: "Dashboard", tab: "overview" },
    { icon: Wallet, label: "Wallet", tab: "wallet" },
    { icon: User, label: "My Profile", tab: "profile" },
    { icon: Crown, label: "VIP Club", tab: "vip" },
    { icon: Gift, label: "My Bonuses", tab: "bonuses" },
    { icon: Heart, label: "Favourites", tab: "games" },
    { icon: Receipt, label: "Transactions", tab: "transactions" },
    { icon: ShieldCheck, label: "Verification", tab: "kyc" },
    { icon: Settings, label: "Security", tab: "security" },
  ];

  return (
    <Dropdown
      width="w-72"
      trigger={(open, toggle) => (
        <button onClick={toggle} aria-label="Account menu" className={`flex items-center gap-2 rounded-lg transition ${compact ? "h-10 px-1" : "h-9 pl-1 pr-2 hover:bg-white/5"}`}>
          <Avatar name={user.name} url={user.avatarUrl} />
          {!compact && <ChevronDown className={`h-3.5 w-3.5 text-white/50 transition ${open ? "rotate-180" : ""}`} />}
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="border-b border-white/5 p-4">
            <div className="flex items-center gap-3">
              <Avatar name={user.name} url={user.avatarUrl} className="h-10 w-10 text-[13px]" />
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-semibold text-white">{user.name}</p>
                <p className="flex items-center gap-1 text-[11.5px] text-gold-300">
                  <Crown className="h-3 w-3" /> {user.vipLevel} Member
                </p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-lg bg-white/[0.03] px-2.5 py-1.5">
                <p className="text-white/45">Main</p>
                <p className="font-semibold tabular-nums text-white">{money(user.balance, settings.locale.currencySymbol)}</p>
              </div>
              <div className="rounded-lg bg-white/[0.03] px-2.5 py-1.5">
                <p className="text-white/45">Bonus</p>
                <p className="font-semibold tabular-nums text-gold-200">{money(user.bonus, settings.locale.currencySymbol)}</p>
              </div>
            </div>
            <div className="mt-3">
              <div className="flex justify-between text-[11px] text-white/50">
                <span>VIP progress</span>
                <span>{user.vipProgress}%</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gold-gradient" style={{ width: `${user.vipProgress}%` }} />
              </div>
            </div>
          </div>
          <ul className="max-h-[50vh] overflow-y-auto p-1.5">
            {items.map(({ icon: Icon, label, tab }) => (
              <li key={label}>
                <button
                  onClick={() => {
                    close();
                    go(`/account?tab=${tab}`);
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] text-white/80 hover:bg-white/5 hover:text-white"
                >
                  <Icon className="h-4 w-4 text-white/50" />
                  {label}
                </button>
              </li>
            ))}
            <li className="mt-1 border-t border-white/5 pt-1">
              <button
                onClick={() => {
                  close();
                  logout();
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] text-rose-300/90 hover:bg-rose-500/10"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </li>
          </ul>
        </div>
      )}
    </Dropdown>
  );
}

export function BalanceChip() {
  const { user, go, settings } = useApp();
  if (!user) return null;
  return (
    <div className="flex h-9 items-center overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
      <button onClick={() => go("/account?tab=wallet")} className="px-3 text-left leading-none">
        <p className="text-[9.5px] uppercase tracking-wider text-white/45">Balance</p>
        <p className="mt-0.5 text-[13px] font-semibold tabular-nums text-white">{money(user.balance, settings.locale.currencySymbol)}</p>
      </button>
      <button onClick={() => go("/account?tab=deposit")} aria-label="Deposit" className="grid h-full w-9 place-items-center bg-gold-gradient text-ink-950 transition hover:brightness-110">
        <Plus className="h-4 w-4" strokeWidth={3} />
      </button>
    </div>
  );
}
