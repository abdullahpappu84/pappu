"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Flame, SearchX } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useApp } from "@/components/providers/AppProvider";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Button } from "@/components/ui/Button";
import { GameCard } from "./GameCard";

export function GameSection() {
  const { category, provider, search, resetFilters, games: allGames, categories: CATEGORIES, favorites } = useApp();
  const [expandedFor, setExpandedFor] = useState("");
  const [initialLimit, setInitialLimit] = useState(9);
  const filterKey = `${category}|${provider}|${search.trim()}`;
  const expanded = expandedFor === filterKey;

  useEffect(() => {
    const update = () => setInitialLimit(window.innerWidth >= 1280 ? 24 : window.innerWidth >= 1024 ? 18 : window.innerWidth >= 768 ? 12 : 9);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const isDefault = category === "all" && provider === "All Providers" && search.trim() === "";

  const games = useMemo(() => {
    const standard = allGames.filter((g) => g.displayType === "standard");
    const q = search.trim().toLowerCase();
    const filtered = allGames.filter(
      (g) =>
        (category === "all" || (category === "favorites" ? favorites.has(g.id) : g.categories.includes(category))) &&
        (provider === "All Providers" || g.provider === provider) &&
        (!q || g.title.toLowerCase().includes(q) || g.provider.toLowerCase().includes(q) || (g.description ?? "").toLowerCase().includes(q)),
    );
    return expanded ? filtered : filtered.slice(0, initialLimit);
  }, [expanded, initialLimit, category, provider, search, allGames, favorites]);

  const cat = CATEGORIES.find((c) => c.id === category);
  const title = isDefault ? "All Games" : search.trim() ? "Search Results" : category === "all" ? provider : cat?.label ?? "Games";
  const subtitle = isDefault
    ? `${allGames.filter((g) => g.displayType === "standard").length.toLocaleString()} games available`
    : `${games.length} game${games.length === 1 ? "" : "s"} found${provider !== "All Providers" && category !== "all" ? ` · ${provider}` : ""}`;
  const totalMatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allGames.filter((g) =>
      (category === "all" || (category === "favorites" ? favorites.has(g.id) : g.categories.includes(category))) &&
      (provider === "All Providers" || g.provider === provider) &&
      (!q || g.title.toLowerCase().includes(q) || g.provider.toLowerCase().includes(q) || (g.description ?? "").toLowerCase().includes(q)),
    ).length;
  }, [category, provider, search, allGames, favorites]);

  return (
    <section id="games" aria-label={title} className="scroll-mt-24">
      <SectionHeader
        icon={
          <Flame
            className="h-7 w-7 text-orange-400 md:h-8 md:w-8"
            fill="url(#flameFill)"
            strokeWidth={1.6}
            style={{ filter: "drop-shadow(0 0 10px rgba(251,146,60,0.55))" }}
          />
        }
        title={title}
        subtitle={subtitle}
        actionLabel={totalMatches > initialLimit ? (expanded ? "Show Less" : "View All") : isDefault ? undefined : "Clear Filters"}
        onAction={() => (totalMatches > initialLimit ? setExpandedFor(expanded ? "" : filterKey) : resetFilters())}
      />
      <svg width="0" height="0" className="absolute" aria-hidden>
        <defs>
          <linearGradient id="flameFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fde68a" />
            <stop offset="1" stopColor="#f97316" />
          </linearGradient>
        </defs>
      </svg>

      {games.length === 0 ? (
        <div className="panel flex flex-col items-center justify-center gap-3 rounded-2xl px-6 py-12 text-center">
          <SearchX className="h-9 w-9 text-white/30" />
          <p className="text-[15px] font-semibold text-white">No games match your filters</p>
          <p className="max-w-sm text-[13px] text-white/50">Try a different keyword, provider or category.</p>
          <Button variant="outline" size="sm" pill onClick={resetFilters} className="mt-1">
            Reset filters
          </Button>
        </div>
      ) : (
        <motion.div layout className="grid max-w-[1320px] grid-cols-3 gap-2 md:grid-cols-4 md:gap-2.5 lg:grid-cols-6 xl:grid-cols-8">
          <AnimatePresence mode="popLayout" initial={false}>
            {games.map((game, i) => (
              <motion.div
                key={game.id}
                layout
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.94 }}
                transition={{ duration: 0.28, delay: Math.min(i, 8) * 0.02 }}
              >
                <GameCard game={game} priority={i < 2} />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </section>
  );
}
