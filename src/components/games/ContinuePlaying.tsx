"use client";

import { History } from "lucide-react";
import { useMemo } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { GameCard } from "./GameCard";

/** "Continue Playing" row — the user's recently played games, same card style as Popular Games. */
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
      <div className="grid grid-cols-2 gap-2.5 xs:grid-cols-3 md:gap-3 lg:grid-cols-6 xl:gap-4">
        {list.map((g) => (
          <GameCard key={g.id} game={g} />
        ))}
      </div>
    </section>
  );
}
