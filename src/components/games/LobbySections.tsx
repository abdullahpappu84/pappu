"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Activity, ChevronLeft, ChevronRight, Crown, Gift, Sparkles, Trophy } from "lucide-react";
import { useApp } from "@/components/providers/AppProvider";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { GameCard } from "./GameCard";
import { ContinuePlaying } from "./ContinuePlaying";
import { GameSection } from "./GameSection";

function GameRail({ title, subtitle, icon, games, compact = false }: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  games: ReturnType<typeof useApp>["games"];
  compact?: boolean;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: true });
  const update = () => {
    const el = track.current;
    if (el) setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
    else setEdges({ left: false, right: false });
  };
  useEffect(() => {
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [games.length]);
  return <section className="relative min-w-0" aria-label={title}>
    <SectionHeader icon={icon} title={title} subtitle={subtitle} />
    <button aria-label={`Previous ${title}`} onClick={() => track.current?.scrollBy({ left: -track.current.clientWidth * 0.8, behavior: "smooth" })} className={`absolute right-11 top-1 z-10 hidden h-8 w-8 place-items-center rounded-full border border-white/15 bg-ink-800/95 text-white/85 transition hover:border-gold-300/60 hover:text-gold-200 md:grid ${edges.left ? "opacity-100" : "pointer-events-none opacity-0"}`}><ChevronLeft className="h-4 w-4" /></button>
    <button aria-label={`Next ${title}`} onClick={() => track.current?.scrollBy({ left: track.current.clientWidth * 0.8, behavior: "smooth" })} className={`absolute right-1 top-1 z-10 hidden h-8 w-8 place-items-center rounded-full border border-white/15 bg-ink-800/95 text-white/85 transition hover:border-gold-300/60 hover:text-gold-200 md:grid ${edges.right ? "opacity-100" : "pointer-events-none opacity-0"}`}><ChevronRight className="h-4 w-4" /></button>
    {games.length ? <div ref={track} onScroll={update} className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-2 no-scrollbar md:gap-3">
      {games.map((game) => <div key={game.id} className={`shrink-0 snap-start ${compact ? "w-[132px] xs:w-[148px] md:w-[164px]" : "w-[150px] xs:w-[170px] md:w-[190px]"}`}><GameCard game={game} /></div>)}
    </div> : <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-[12px] text-white/45">No recent winning activity yet.</p>}
  </section>;
}

export function LobbySections() {
  const { games } = useApp();
  const standard = useMemo(() => games.filter((g) => g.displayType === "standard" && g.status === "active"), [games]);
  const winning = useMemo(() => {
    return standard.filter((g) => g.winningActivity).sort((a, b) => b.popularity - a.popularity).slice(0, 12);
  }, [standard]);
  const popular = useMemo(() => {
    const played = standard.filter((g) => g.popularity > 0).sort((a, b) => b.popularity - a.popularity);
    return (played.length ? played : [...standard].sort((a, b) => Number(b.featured) - Number(a.featured))).slice(0, 12);
  }, [standard]);
  const newest = useMemo(() => standard.filter((g) => g.categories.includes("new") || g.badge === "NEW").sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 12), [standard]);
  const bonus = useMemo(() => standard.filter((g) => g.categories.some((c) => ["bonus-wagering", "bonus", "wagering"].includes(c))), [standard]);

  return <>
    <GameRail title="Winning Now" subtitle="Recent wins across the lobby" icon={<Activity className="h-7 w-7 text-emerald-300 md:h-8 md:w-8" />} games={winning} compact />
    <ContinuePlaying />
    <GameSection />
    <GameRail title="Most Popular" subtitle="Ranked by real game activity" icon={<Crown className="h-7 w-7 text-gold-300 md:h-8 md:w-8" />} games={popular} />
    <GameRail title="New Games" subtitle="Recently added to the lobby" icon={<Sparkles className="h-7 w-7 text-violet-300 md:h-8 md:w-8" />} games={newest} />
    <GameRail title="Bonus & Wagering" subtitle="Games eligible for bonus play" icon={<Gift className="h-7 w-7 text-orange-300 md:h-8 md:w-8" />} games={bonus} />
    <section id="sports" className="panel flex min-h-28 items-center justify-between gap-4 rounded-2xl p-5 md:p-6" aria-label="Sports">
      <div className="flex items-center gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gold-400/10 text-gold-300"><Trophy className="h-5 w-5" /></span><div><h2 className="font-display text-xl font-semibold text-white">Sports</h2><p className="mt-1 text-[13px] text-white/50">Sportsbook access is available when a provider is configured.</p></div></div>
    </section>
  </>;
}
