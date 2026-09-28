"use client";

import { motion } from "framer-motion";
import { Cherry, House, Menu, Spade, UserRound } from "lucide-react";
import { useState } from "react";
import type { CategoryId } from "@/data/types";
import { useApp } from "@/components/providers/AppProvider";
import { useNavAction } from "@/components/header/useNavAction";

const ITEMS: { id: string; label: string; icon: typeof House; target?: string; category?: CategoryId }[] = [
  { id: "home", label: "Home", icon: House, target: "top" },
  { id: "casino", label: "Casino", icon: Spade, target: "games", category: "all" },
  { id: "slots", label: "Slots", icon: Cherry, target: "games", category: "slots" },
  { id: "live", label: "Live Casino", icon: UserRound, target: "live-casino" },
  { id: "menu", label: "Menu", icon: Menu },
];

export function MobileBottomNav() {
  const { setMenuOpen, menuOpen } = useApp();
  const navigate = useNavAction();
  const [active, setActive] = useState("home");
  const current = menuOpen ? "menu" : active;

  return (
    <nav aria-label="Mobile" className="fixed inset-x-0 bottom-0 z-50 lg:hidden">
      <div className="relative bg-ink-900/90 shadow-[0_-10px_30px_rgba(0,0,0,0.6)] backdrop-blur-xl safe-bottom">
        {/* gold arc accent */}
        <svg className="pointer-events-none absolute -top-[10px] left-0 h-[12px] w-full" viewBox="0 0 400 12" preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id="navArc" x1="0" x2="1">
              <stop offset="0" stopColor="#f0b93f" stopOpacity="0" />
              <stop offset="0.5" stopColor="#f9cf66" stopOpacity="0.95" />
              <stop offset="1" stopColor="#f0b93f" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M0 11 Q200 -6 400 11" fill="none" stroke="url(#navArc)" strokeWidth="1.4" />
        </svg>
        <div className="absolute inset-x-0 top-0 h-px bg-white/[0.06]" />
        <ul className="mx-auto grid h-[62px] max-w-xl grid-cols-5">
          {ITEMS.map(({ id, label, icon: Icon, target, category }) => {
            const isActive = current === id;
            return (
              <li key={id}>
                <button
                  onClick={() => {
                    if (id === "menu") return setMenuOpen(true);
                    setActive(id);
                    navigate({ target, category });
                  }}
                  aria-current={isActive ? "page" : undefined}
                  className="relative flex h-full w-full flex-col items-center justify-center gap-1 active:scale-95 transition-transform"
                >
                  {isActive && (
                    <motion.span
                      layoutId="bottom-nav-active"
                      className="absolute top-0 h-[3px] w-8 rounded-b-full bg-gold-gradient shadow-[0_0_12px_rgba(240,185,63,0.9)]"
                      transition={{ type: "spring", stiffness: 480, damping: 36 }}
                    />
                  )}
                  <Icon
                    className={`h-[22px] w-[22px] transition-colors ${isActive ? "text-gold-300" : "text-white/70"}`}
                    style={isActive ? { filter: "drop-shadow(0 0 8px rgba(240,185,63,0.6))" } : undefined}
                    strokeWidth={isActive ? 2.1 : 1.7}
                    fill={isActive && id === "home" ? "rgba(249,207,102,0.25)" : "none"}
                  />
                  <span className={`text-[10.5px] font-medium ${isActive ? "text-gold-200" : "text-white/65"}`}>{label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
