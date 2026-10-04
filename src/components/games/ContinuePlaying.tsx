"use client";

import { History } from "lucide-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { GameCard } from "./GameCard";

/** The signed-in player's own recently played games, kept to one compact horizontal row. */
export function ContinuePlaying() {
  const { user, recent, games, go } = useApp();
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const list = useMemo(() => recent.map((slug) => games.find((g) => g.id === slug)).filter((g): g is NonNullable<typeof g> => Boolean(g)).slice(0, 6), [recent, games]);
  useEffect(() => {
    const update = () => {
      const el = track.current;
      setEdges(el ? { left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 } : { left: false, right: false });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [list.length]);
  if (!user || !list.length) return null;
  return (
    <section aria-label="Continue playing" className="relative min-w-0">
      <SectionHeader
        icon={<History className="h-7 w-7 text-sky-300 md:h-8 md:w-8" strokeWidth={1.6} style={{ filter: "drop-shadow(0 0 10px rgba(56,189,248,0.5))" }} />}
        title="Continue Playing"
        subtitle="Pick up where you left off"
        actionLabel="History"
        onAction={() => go("/account?tab=games")}
      />
      <button aria-label="Previous recently played games" onClick={() => track.current?.scrollBy({ left: -track.current.clientWidth * 0.8, behavior: "smooth" })} className={`absolute right-11 top-1 z-10 hidden h-8 w-8 place-items-center rounded-full border border-white/15 bg-ink-800/95 text-white/85 transition hover:border-gold-300/60 hover:text-gold-200 md:grid ${edges.left ? "opacity-100" : "pointer-events-none opacity-0"}`}><ChevronLeft className="h-4 w-4" /></button>
      <button aria-label="Next recently played games" onClick={() => track.current?.scrollBy({ left: track.current.clientWidth * 0.8, behavior: "smooth" })} className={`absolute right-1 top-1 z-10 hidden h-8 w-8 place-items-center rounded-full border border-white/15 bg-ink-800/95 text-white/85 transition hover:border-gold-300/60 hover:text-gold-200 md:grid ${edges.right ? "opacity-100" : "pointer-events-none opacity-0"}`}><ChevronRight className="h-4 w-4" /></button>
      <div ref={track} onScroll={() => { const el = track.current; if (el) setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 }); }} className="flex max-w-[1040px] snap-x snap-mandatory gap-2 overflow-x-auto pb-2 no-scrollbar md:gap-2.5">
        {list.map((g) => (
          <div key={g.id} className="w-[calc((100%-24px)/4)] min-w-[68px] max-w-[150px] shrink-0 snap-start md:w-[calc((100%-50px)/6)]">
            <GameCard game={g} compact />
          </div>
        ))}
      </div>
    </section>
  );
}
