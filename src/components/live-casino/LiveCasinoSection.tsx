"use client";

import { Play } from "lucide-react";
import { useApp } from "@/components/providers/AppProvider";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { LiveCasinoCard } from "./LiveCasinoCard";

export function LiveCasinoSection() {
  const { setCategory, scrollTo, liveTables } = useApp();
  const online = liveTables.reduce((sum, t) => sum + t.players, 0);

  return (
    <section id="live-casino" aria-label="Live Casino" className="scroll-mt-24">
      <SectionHeader
        icon={
          <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-500/15 ring-2 ring-emerald-400/80 shadow-[0_0_18px_-2px_rgba(52,211,153,0.6)] md:h-8 md:w-8">
            <Play className="ml-0.5 h-3.5 w-3.5 fill-emerald-300 text-emerald-300 md:h-4 md:w-4" />
          </span>
        }
        title="Live Casino"
        subtitle="Real Dealers. Real Action. Live!"
        subtitleClassName="text-emerald-300/90"
        right={
          <span className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11.5px] text-white/70 md:inline-flex">
            <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-emerald-400" />
            {online.toLocaleString("en-US")} playing now
          </span>
        }
        onAction={() => {
          setCategory("live");
          scrollTo("games");
        }}
      />
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 no-scrollbar xs:-mx-5 xs:px-5 md:-mx-6 md:px-6 lg:mx-0 lg:grid lg:grid-cols-6 lg:overflow-visible lg:px-0 xl:gap-4">
        {liveTables.map((t) => (
          <div
            key={t.id}
            className="w-[calc((100%-12px)/2.1)] shrink-0 snap-start xs:w-[calc((100%-24px)/2.6)] md:w-[calc((100%-24px)/3.3)] lg:w-auto"
          >
            <LiveCasinoCard table={t} />
          </div>
        ))}
      </div>
    </section>
  );
}
