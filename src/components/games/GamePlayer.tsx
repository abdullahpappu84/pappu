"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Maximize2, Minimize2, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { LogoMark } from "@/components/ui/Logo";
import { money } from "@/lib/api";

/** Full-screen in-site game player. The provider's game runs inside a secure iframe. */
export function GamePlayer() {
  const { activeGame, closeGame, user, settings, go } = useApp();
  const wrap = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!activeGame) return;
    setLoaded(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !document.fullscreenElement && closeGame();
    const onFs = () => setFull(Boolean(document.fullscreenElement));
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, [activeGame, closeGame]);

  const toggleFull = () => (document.fullscreenElement ? document.exitFullscreen() : wrap.current?.requestFullscreen?.());

  return (
    <AnimatePresence>
      {activeGame && (
        <motion.div
          ref={wrap}
          role="dialog"
          aria-label={activeGame.title}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] flex flex-col bg-ink-950"
        >
          <div className="flex h-12 shrink-0 items-center gap-3 border-b border-white/[0.07] bg-ink-900/95 px-3 md:h-14 md:px-5">
            <LogoMark className="h-7 w-7" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-semibold text-white md:text-[15px]">{activeGame.title}</p>
              <p className="text-[10.5px] uppercase tracking-[0.18em] text-gold-300/80">{activeGame.mode === "demo" ? "Demo mode · fun play" : "Real money"}</p>
            </div>
            {user && activeGame.mode === "real" && (
              <div className="hidden h-9 items-center overflow-hidden rounded-lg border border-white/10 bg-white/[0.03] sm:flex">
                <span className="px-3 text-[13px] font-semibold tabular-nums text-white">{money(user.balance + user.bonus, settings.locale.currencySymbol)}</span>
                <button onClick={() => { closeGame(); go("/account?tab=deposit"); }} aria-label="Deposit" className="grid h-full w-9 place-items-center bg-gold-gradient text-ink-950">
                  <Plus className="h-4 w-4" strokeWidth={3} />
                </button>
              </div>
            )}
            <button onClick={toggleFull} aria-label="Toggle fullscreen" className="hidden h-9 w-9 place-items-center rounded-lg border border-white/10 text-white/75 hover:text-gold-200 md:grid">
              {full ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            <button onClick={closeGame} aria-label="Close game" className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-white/75 hover:text-rose-300">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="relative flex-1">
            {!loaded && <div className="absolute inset-0 grid place-items-center"><div className="h-9 w-9 animate-spin rounded-full border-2 border-gold-300/30 border-t-gold-300" /></div>}
            <iframe
              key={activeGame.url}
              src={activeGame.url}
              title={activeGame.title}
              onLoad={() => setLoaded(true)}
              allow="autoplay; fullscreen; encrypted-media; clipboard-write"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              className="absolute inset-0 h-full w-full border-0"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
