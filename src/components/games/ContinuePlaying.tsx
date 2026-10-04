"use client";

import { History } from "lucide-react";
import { useMemo } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { GameCard } from "./GameCard";

/** The signed-in player's own recently played games, kept to one compact horizontal row. */
export function ContinuePlaying() {
  const { user, recent, games, go } = useApp();
  const list = useMemo(() => recent.map((slug) => games.find((g) => g.id === slug)).filter((g): g is NonNullable<typeof g> => Boolean(g)).slice(0, 6), [recent, games]);
  if (!user || !list.length) return null;
  return (
    <section aria-label="Continue playing">
      <SectionHeader
        icon={<History className="h-7 w-7 text-sky-300 md:h-8 md:w-8" strokeWidth={1.6} style={{ filter: "drop-shadow(0 0 10px rgba(56,189,248,0.5))" }} />}
        title="Continue Playing"
        subtitle="Pick up where you left off"
        actionLabel="History"
        onAction={() => go("/account?tab=games")}
      />
      <div className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-2 no-scrollbar md:gap-3">
        {list.map((g) => (
          <div key={g.id} className="w-[142px] shrink-0 snap-start xs:w-[160px] md:w-[176px]">
            <GameCard game={g} />
          </div>
        ))}
      </div>
    </section>
  );
}
