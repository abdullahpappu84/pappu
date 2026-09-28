"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, Crown, HeartHandshake, Headset, LogOut, X } from "lucide-react";
import { useEffect } from "react";
import { NAV_ITEMS } from "@/data/casino";
import { useApp } from "@/components/providers/AppProvider";
import { useNavAction } from "@/components/header/useNavAction";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { LanguageSelector } from "@/components/header/LanguageSelector";
import { SearchInput } from "@/components/search/GameSearchBar";

export function MobileMenu() {
  const { menuOpen, setMenuOpen, user, openAuth, logout, setCategory, scrollTo, categories: CATEGORIES, go, setChatOpen } = useApp();
  const closeAnd = (fn: () => void) => () => {
    setMenuOpen(false);
    fn();
  };
  const navigate = useNavAction();

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, setMenuOpen]);

  return (
    <AnimatePresence>
      {menuOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label="Main menu">
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMenuOpen(false)}
          />
          <motion.aside
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0.4, right: 0 }}
            onDragEnd={(_, info) => info.offset.x < -80 && setMenuOpen(false)}
            className="absolute inset-y-0 left-0 flex w-[86%] max-w-[360px] flex-col border-r border-white/10 bg-ink-900 shadow-2xl"
          >
            <div className="flex h-[60px] items-center justify-between border-b border-white/[0.06] px-4">
              <Logo size="sm" />
              <button
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className="grid h-10 w-10 place-items-center rounded-lg text-white/80 active:bg-white/5"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
              {/* Account card */}
              {user ? (
                <div className="rounded-2xl border border-gold-300/25 bg-gradient-to-br from-gold-400/10 to-transparent p-4">
                  <button onClick={closeAnd(() => go("/account"))} className="flex w-full items-center gap-3 text-left">
                    <span className="grid h-11 w-11 place-items-center overflow-hidden rounded-full bg-gold-gradient text-[13px] font-bold text-ink-950">
                      {user.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        user.name.split(" ").map((p) => p[0]).join("").slice(0, 2)
                      )}
                    </span>
                    <div className="flex-1">
                      <p className="text-[14px] font-semibold text-white">{user.name}</p>
                      <p className="flex items-center gap-1 text-[11.5px] text-gold-300">
                        <Crown className="h-3 w-3" /> {user.vipLevel} Member
                      </p>
                    </div>
                  </button>
                  <div className="mt-3 flex items-end justify-between">
                    <div>
                      <p className="text-[10.5px] uppercase tracking-wider text-white/45">Balance</p>
                      <p className="text-[20px] font-semibold tabular-nums text-white">
                        €{user.balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      pill
                      onClick={closeAnd(() => go("/account?tab=deposit"))}
                    >
                      Deposit
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="relative overflow-hidden rounded-2xl border border-gold-300/25 bg-[linear-gradient(135deg,rgba(240,185,63,0.16),rgba(12,14,22,0.6))] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-200">Welcome Offer</p>
                  <p className="mt-1 font-display text-[26px] font-bold uppercase leading-none text-white">
                    Up to <span className="text-gold-gradient">200%</span>
                  </p>
                  <p className="mt-1 text-[12px] text-white/60">+150 free spins on your first deposit</p>
                  <div className="mt-3.5 grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" onClick={() => openAuth("login")}>
                      Login
                    </Button>
                    <Button size="sm" onClick={() => openAuth("register")}>
                      Register
                    </Button>
                  </div>
                </div>
              )}

              <SearchInput
                id="drawer-search"
                onSubmit={() => {
                  setMenuOpen(false);
                  window.setTimeout(() => scrollTo("games"), 80);
                }}
              />

              <nav aria-label="Drawer">
                <p className="mb-2 px-1 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-white/40">Explore</p>
                <ul className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                  {NAV_ITEMS.map(({ id, label, icon: Icon, target, category }) => (
                    <li key={id} className="border-b border-white/[0.05] last:border-0">
                      <button
                        onClick={() => navigate({ target, category })}
                        className="flex h-[52px] w-full items-center gap-3.5 px-4 text-[14px] text-white/85 active:bg-white/[0.04]"
                      >
                        <Icon className="h-[19px] w-[19px] text-gold-300" />
                        <span className="flex-1 text-left">{label}</span>
                        <ChevronRight className="h-4 w-4 text-white/30" />
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>

              <div>
                <p className="mb-2 px-1 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-white/40">Categories</p>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.filter((c) => !["all", "promotions"].includes(c.id)).map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setCategory(c.id);
                        navigate({ target: "games" });
                      }}
                      className="flex h-9 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 text-[12px] text-white/80 active:bg-white/10"
                    >
                      <c.icon className="h-3.5 w-3.5" style={{ color: c.color }} />
                      {c.shortLabel ?? c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <button
                  onClick={closeAnd(() => setChatOpen(true))}
                  className="flex h-11 w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 text-[13px] text-white/85"
                >
                  <Headset className="h-4 w-4 text-sky-300" /> 24/7 Live Support
                </button>
                <button
                  onClick={closeAnd(() => go("/p/responsible-gaming"))}
                  className="flex h-11 w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 text-[13px] text-white/85"
                >
                  <HeartHandshake className="h-4 w-4 text-emerald-300" /> Responsible Gaming
                </button>
                <LanguageSelector variant="wide" direction="up" />
              </div>
            </div>

            {user && (
              <div className="border-t border-white/[0.06] p-4 safe-bottom">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    logout();
                  }}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-rose-400/20 text-[13px] text-rose-300"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            )}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
