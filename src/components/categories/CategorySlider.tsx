"use client";

import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Trophy } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Category } from "@/data/types";
import { useApp } from "@/components/providers/AppProvider";

function CategoryTile({ cat, active, onSelect }: { cat: Category; active: boolean; onSelect: () => void }) {
  const Icon = cat.icon;
  return (
    <button
      onClick={onSelect}
      aria-pressed={active}
      className={`group relative flex shrink-0 snap-start flex-col items-center justify-center gap-1.5 rounded-xl border px-1 text-center transition-all duration-300
        h-[72px] basis-[calc((100%-24px)/4.3)] xs:basis-[calc((100%-40px)/5.4)] md:h-[78px] md:basis-[calc((100%-50px)/6)] md:gap-2 lg:basis-[calc((100%-70px)/8)] xl:h-[84px]
        ${
          active
            ? "border-gold-300/80 text-white shadow-[0_0_24px_-6px_rgba(240,185,63,0.55)]"
            : "border-white/[0.08] bg-gradient-to-b from-ink-700/80 to-ink-800/90 text-white/80 hover:-translate-y-0.5 hover:border-white/20 hover:text-white"
        }`}
    >
      {active && (
        <motion.span
          layoutId="category-active"
          className="absolute inset-0 rounded-xl bg-[radial-gradient(120%_100%_at_50%_0%,rgba(240,185,63,0.22),rgba(240,185,63,0.04)_60%,transparent)]"
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
        />
      )}
      {cat.badge && (
        <span
          className={`absolute -top-1.5 right-1.5 z-10 rounded-md px-1.5 py-[1px] text-[8.5px] font-extrabold tracking-wider text-white shadow ${
            cat.badge === "HOT" ? "bg-hot" : "bg-violet-500"
          }`}
        >
          {cat.badge}
        </span>
      )}
      <Icon
        className="relative h-6 w-6 transition-transform duration-300 group-hover:scale-110 md:h-7 md:w-7 xl:h-8 xl:w-8"
        style={{ color: active ? "#f9cf66" : cat.color, filter: `drop-shadow(0 0 10px ${active ? "rgba(240,185,63,0.5)" : cat.color + "55"})` }}
        strokeWidth={1.7}
      />
      <span className="relative w-full truncate px-0.5 text-[11px] font-medium md:text-[12.5px] xl:text-[13.5px]">
        <span className="md:hidden">{cat.shortLabel ?? cat.label}</span>
        <span className="hidden md:inline">{cat.label}</span>
      </span>
    </button>
  );
}

export function CategorySlider() {
  const { category, setCategory, scrollTo, categories } = useApp();
  const sportCategory: Category = { id: "sports", label: "Sports", shortLabel: "Sports", icon: Trophy, color: "#34d399" };
  const navCategories = categories.some((item) => item.id === "sports") ? categories : [...categories, sportCategory];
  const trackRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: true });

  const update = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [update]);

  const scroll = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.75, behavior: "smooth" });
  };

  const arrow = (dir: 1 | -1, visible: boolean) => (
    <button
      onClick={() => scroll(dir)}
      aria-label={dir === 1 ? "Next categories" : "Previous categories"}
      className={`absolute top-1/2 z-10 grid -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-ink-800/95 text-white/85 shadow-lg backdrop-blur transition-all duration-300 hover:border-gold-300/60 hover:text-gold-200
        h-8 w-8 md:h-9 md:w-9 ${dir === 1 ? "-right-2 lg:-right-[22px]" : "-left-2 lg:-left-[22px]"}
        ${visible ? "opacity-100" : "pointer-events-none opacity-0"}`}
    >
      {dir === 1 ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
    </button>
  );

  return (
    <section id="categories" aria-label="Game categories" className="relative scroll-mt-24">
      {arrow(-1, edges.left)}
      <div
        ref={trackRef}
        onScroll={update}
        className="flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-smooth pb-1 pt-2 no-scrollbar xs:gap-2.5"
      >
        {navCategories.map((cat) => (
          <CategoryTile
            key={cat.id}
            cat={cat}
            active={category === cat.id}
            onSelect={() => {
              if (cat.id === "promotions") return scrollTo("promotions");
              if (cat.id === "sports") {
                setCategory("sports");
                return scrollTo("sports");
              }
              setCategory(cat.id);
            }}
          />
        ))}
      </div>
      {arrow(1, edges.right)}
    </section>
  );
}
