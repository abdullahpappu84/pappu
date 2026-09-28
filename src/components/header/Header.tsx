"use client";

import { motion } from "framer-motion";
import { Menu, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { NAV_ITEMS } from "@/data/casino";
import { useApp } from "@/components/providers/AppProvider";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { LanguageSelector } from "./LanguageSelector";
import { AccountMenu, BalanceChip, NotificationsMenu } from "./HeaderMenus";
import { useNavAction } from "./useNavAction";

export function Header() {
  const { user, openAuth, setMenuOpen, scrollTo } = useApp();
  const navigate = useNavAction();
  const [active, setActive] = useState("home");
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const focusSearch = () => {
    scrollTo("search");
    window.setTimeout(() => document.getElementById("game-search")?.focus({ preventScroll: true }), 450);
  };

  return (
    <header
      className={`sticky top-0 z-50 border-b transition-colors duration-300 ${
        scrolled ? "border-white/[0.07] bg-ink-950/85 backdrop-blur-xl" : "border-white/[0.04] bg-ink-950/60 backdrop-blur-md"
      }`}
    >
      <div className="container-x">
        {/* ---------- Mobile / tablet header ---------- */}
        <div className="grid h-[60px] grid-cols-[1fr_auto_1fr] items-center lg:hidden">
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className="-ml-2 grid h-11 w-11 place-items-center rounded-lg text-white/90 active:bg-white/5"
          >
            <Menu className="h-6 w-6" />
          </button>
          <button onClick={() => scrollTo("top")} aria-label="Home" className="justify-self-center">
            <Logo size="sm" />
          </button>
          <div className="-mr-1.5 flex items-center justify-self-end">
            <NotificationsMenu compact />
            <AccountMenu compact />
          </div>
        </div>

        {/* ---------- Desktop header ---------- */}
        <div className="hidden h-[68px] items-center gap-5 lg:flex xl:gap-8">
          <button onClick={() => navigate({ target: "top" })} aria-label="Aurum Royale home" className="shrink-0">
            <Logo size="md" />
          </button>

          <nav aria-label="Main" className="flex h-full items-stretch">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = active === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActive(item.id);
                    navigate(item);
                  }}
                  className={`group relative items-center gap-2 px-2 text-[13px] font-medium transition-colors xl:px-3 xl:text-[13.5px] ${
                    item.id === "table" ? "hidden xl:flex" : "flex"
                  } ${isActive ? "text-gold-300" : "text-white/75 hover:text-white"}`}
                >
                  <Icon
                    className={`hidden h-[17px] w-[17px] min-[1440px]:block ${isActive ? "text-gold-300" : "text-white/60 group-hover:text-white"}`}
                  />
                  {item.label}
                  {item.id === "vip" && (
                    <span className="hidden rounded bg-gold-400/15 px-1 py-px text-[9px] font-bold tracking-wider text-gold-300 xl:inline">
                      CLUB
                    </span>
                  )}
                  {isActive && (
                    <motion.span
                      layoutId="nav-underline"
                      className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-gold-gradient shadow-[0_0_12px_rgba(240,185,63,0.8)]"
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    />
                  )}
                </button>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2.5">
            <button
              onClick={focusSearch}
              aria-label="Search games"
              className="grid h-9 w-9 place-items-center rounded-lg text-white/80 transition hover:bg-white/5 hover:text-white"
            >
              <Search className="h-[18px] w-[18px]" />
            </button>
            <LanguageSelector />
            {user ? (
              <>
                <NotificationsMenu />
                <BalanceChip />
                <AccountMenu />
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => openAuth("login")} className="px-5">
                  Login
                </Button>
                <Button variant="gold" size="sm" onClick={() => openAuth("register")} className="px-5 normal-case">
                  Register
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
