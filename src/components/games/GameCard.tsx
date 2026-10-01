"use client";

import { motion } from "framer-motion";
import { Heart, Play } from "lucide-react";
import { memo } from "react";
import type { Game } from "@/data/types";
import { useApp } from "@/components/providers/AppProvider";
import { GameThumbnail } from "./GameThumbnail";

const badgeStyles: Record<NonNullable<Game["badge"]>, string> = {
  HOT: "bg-gradient-to-b from-[#ff5a67] to-[#d61f35]",
  NEW: "bg-gradient-to-b from-violet-400 to-violet-600",
  JACKPOT: "bg-gold-gradient !text-ink-950",
};

export const GameCard = memo(function GameCard({ game, priority = false }: { game: Game; priority?: boolean }) {
  const { favorites, toggleFavorite, setPreviewGame } = useApp();
  const isFav = favorites.has(game.id);

  return (
    <article className="group relative">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setPreviewGame(game)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setPreviewGame(game))}
        aria-label={`Open ${game.title} by ${game.provider}`}
        className="relative cursor-pointer overflow-hidden rounded-xl border border-white/[0.08] bg-gradient-to-b from-ink-700 to-ink-800 shadow-card transition-all duration-300 will-change-transform hover:-translate-y-1 hover:border-gold-300/45 hover:shadow-[0_18px_40px_-16px_rgba(0,0,0,0.9),0_0_0_1px_rgba(240,185,63,0.25),0_0_30px_-10px_rgba(240,185,63,0.35)]"
      >
        {/* Thumbnail */}
        <div className="relative aspect-[16/10] overflow-hidden">
          <div className="absolute inset-0 transition-transform duration-500 ease-out group-hover:scale-[1.07]">
            <GameThumbnail
              src={game.image}
              title={game.title}
              art={game.art}
              priority={priority}
              sizes="(min-width:1280px) 16vw, (min-width:1024px) 17vw, (min-width:480px) 33vw, 50vw"
            />
          </div>

          {/* hover overlay + play */}
          <div className="absolute inset-0 hidden items-center justify-center bg-ink-950/55 opacity-0 backdrop-blur-[1.5px] transition-opacity duration-300 group-hover:opacity-100 md:flex">
            <span className="flex translate-y-2 flex-col items-center gap-2 transition-transform duration-300 group-hover:translate-y-0">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-gold-gradient text-ink-950 shadow-gold-lg ring-4 ring-gold-300/20 xl:h-14 xl:w-14">
                <Play className="ml-0.5 h-5 w-5 fill-current xl:h-6 xl:w-6" />
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/90">Play</span>
            </span>
          </div>

          {game.badge && (
            <span
              className={`absolute right-1.5 top-1.5 rounded-md px-1.5 py-[2px] text-[9px] font-extrabold tracking-wider text-white shadow-md md:right-2 md:top-2 md:text-[10px] ${badgeStyles[game.badge]}`}
            >
              {game.badge}
            </span>
          )}
        </div>

        {/* Info */}
        <div className="px-2 py-2 text-center md:py-2.5">
          <h3 className="truncate text-[12.5px] font-semibold text-white md:text-[13.5px]">{game.title}</h3>
          <p className="mt-0.5 truncate text-[10.5px] text-white/50 md:text-[11.5px]">{game.provider}</p>
        </div>
      </div>

      {/* Favourite */}
      <motion.button
        whileTap={{ scale: 0.8 }}
        onClick={() => toggleFavorite(game.id, game.title)}
        aria-label={isFav ? `Remove ${game.title} from favourites` : `Add ${game.title} to favourites`}
        aria-pressed={isFav}
        className={`absolute left-1.5 top-1.5 z-10 grid h-7 w-7 place-items-center rounded-full border backdrop-blur-md transition-all duration-300 md:left-2 md:top-2 md:h-8 md:w-8 ${
          isFav
            ? "border-rose-400/40 bg-rose-500/20 text-rose-400 opacity-100"
            : "border-white/15 bg-ink-950/50 text-white/85 hover:text-white md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
        }`}
      >
        <motion.span key={String(isFav)} initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 15 }}>
          <Heart className={`h-3.5 w-3.5 md:h-4 md:w-4 ${isFav ? "fill-current" : ""}`} />
        </motion.span>
      </motion.button>
    </article>
  );
});
