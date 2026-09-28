"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { QUICK_FILTERS } from "@/data/casino";
import { useApp } from "@/components/providers/AppProvider";
import { useClickOutside } from "@/components/ui/useClickOutside";

export function ProviderSelect({ className = "" }: { className?: string }) {
  const { provider, setProvider, providers } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close, open);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex h-11 w-full items-center gap-2.5 rounded-xl border bg-ink-950/60 px-4 text-left text-[13px] transition ${
          open ? "border-gold-300/60" : "border-white/10 hover:border-white/20"
        }`}
      >
        <SlidersHorizontal className="h-4 w-4 text-white/45" />
        <span className={`flex-1 truncate ${provider === "All Providers" ? "text-white/80" : "text-gold-200"}`}>{provider}</span>
        <ChevronDown className={`h-4 w-4 text-white/50 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 right-0 top-full z-40 mt-2 max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-ink-800/98 p-1 shadow-2xl backdrop-blur-xl"
          >
            {providers.map((p) => (
              <li key={p}>
                <button
                  onClick={() => {
                    setProvider(p);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] transition ${
                    p === provider ? "bg-gold-400/10 text-gold-200" : "text-white/80 hover:bg-white/5"
                  }`}
                >
                  {p}
                  {p === provider && <Check className="h-3.5 w-3.5" />}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

export function SearchInput({ id = "game-search", onSubmit }: { id?: string; onSubmit?: () => void }) {
  const { search, setSearch, scrollTo } = useApp();
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (onSubmit) onSubmit();
        else scrollTo("games");
      }}
      className="relative flex-1"
    >
      <Search className="pointer-events-none absolute left-4 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-white/45" />
      <input
        id={id}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search your favourite game..."
        autoComplete="off"
        className="h-11 w-full rounded-xl border border-white/10 bg-ink-950/60 pl-11 pr-10 text-[13.5px] text-white placeholder:text-white/40 outline-none transition focus:border-gold-300/60 focus:bg-ink-950/80 focus:shadow-[0_0_0_4px_rgba(240,185,63,0.08)]"
      />
      {search && (
        <button
          type="button"
          onClick={() => setSearch("")}
          aria-label="Clear search"
          className="absolute right-3 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white/70 hover:bg-white/20"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </form>
  );
}

export function GameSearchBar() {
  const { category, setCategory } = useApp();
  return (
    <section id="search" aria-label="Search games" className="relative z-20 hidden scroll-mt-24 md:block lg:-mt-10">
      <div className="panel flex flex-wrap items-center gap-2 rounded-2xl p-2 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.9)] backdrop-blur-xl lg:flex-nowrap">
        <div className="flex w-full items-center gap-2 lg:w-auto lg:flex-1">
          <SearchInput />
          <ProviderSelect className="w-56 shrink-0 xl:w-72" />
        </div>
        <div className="flex w-full items-center gap-1 overflow-x-auto rounded-xl border border-white/[0.06] bg-ink-950/40 p-1 no-scrollbar lg:w-auto">
          {QUICK_FILTERS.map(({ id, label, icon: Icon }) => {
            const active = category === id;
            return (
              <button
                key={id}
                onClick={() => setCategory(active ? "all" : id)}
                aria-pressed={active}
                className={`flex h-9 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-[12.5px] font-medium transition lg:flex-none ${
                  active ? "bg-gold-400/15 text-gold-200 ring-1 ring-gold-300/40" : "text-white/75 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? "text-gold-300" : "text-gold-300/80"}`} />
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
