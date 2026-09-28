"use client";

import Image from "next/image";
import { Users } from "lucide-react";
import { memo } from "react";
import type { LiveTable } from "@/data/types";
import { useApp } from "@/components/providers/AppProvider";

export function LiveBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-ink-950/70 px-2 py-[3px] text-[9.5px] font-bold tracking-[0.14em] text-white ring-1 ring-white/10 backdrop-blur-md ${className}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inset-0 animate-ping rounded-full bg-hot opacity-75" />
        <span className="relative h-1.5 w-1.5 rounded-full bg-hot" />
      </span>
      LIVE
    </span>
  );
}

export const LiveCasinoCard = memo(function LiveCasinoCard({ table }: { table: LiveTable }) {
  const { setPreviewTable } = useApp();
  const Icon = table.icon;

  return (
    <button
      onClick={() => setPreviewTable(table)}
      aria-label={`Join ${table.name} by ${table.provider}`}
      className="group relative block w-full overflow-hidden rounded-xl border border-white/[0.08] bg-ink-800 text-left shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-emerald-400/40 hover:shadow-[0_18px_40px_-16px_rgba(0,0,0,0.9),0_0_28px_-10px_rgba(52,211,153,0.35)]"
    >
      <div className="relative aspect-[2/1] overflow-hidden lg:aspect-[21/11]">
        <Image
          src={table.image}
          alt={`${table.name} live dealer table`}
          fill
          sizes="(min-width:1024px) 16vw, (min-width:768px) 31vw, 46vw"
          className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.08]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-900/90 via-ink-900/10 to-ink-950/30" />
        <LiveBadge className="absolute left-2 top-2" />
        <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-ink-950/70 px-2 py-[3px] text-[10px] font-medium text-white/85 ring-1 ring-white/10 backdrop-blur-md">
          <Users className="h-3 w-3 text-emerald-300" />
          {table.players.toLocaleString("en-US")}
        </span>
        {table.tag && (
          <span className="absolute bottom-2 left-2 rounded-md bg-gold-gradient px-1.5 py-[2px] text-[9px] font-extrabold uppercase tracking-wider text-ink-950">
            {table.tag}
          </span>
        )}
        <span className="absolute bottom-2 right-2 hidden translate-y-2 rounded-full border border-emerald-300/40 bg-emerald-500/20 px-3 py-1 text-[10.5px] font-semibold text-emerald-100 opacity-0 backdrop-blur-md transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 md:block">
          Join Table
        </span>
      </div>

      {/* accent line differentiates live tables */}
      <div className="h-px bg-gradient-to-r from-transparent via-emerald-400/50 to-transparent" />

      <div className="flex items-center gap-2.5 px-2.5 py-2.5 md:px-3">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full ring-1 md:h-9 md:w-9"
          style={{ background: `${table.accent}1f`, color: table.accent, boxShadow: `0 0 16px -4px ${table.accent}80`, borderColor: table.accent }}
        >
          <Icon className="h-4 w-4 md:h-[18px] md:w-[18px]" />
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[12.5px] font-semibold text-white md:text-[13.5px]">{table.name}</span>
          <span className="mt-0.5 block truncate text-[10.5px] text-sky-300/90 md:text-[11.5px]">{table.provider}</span>
        </span>
        <span className="hidden text-right text-[10px] leading-tight text-white/45 2xl:block">
          <span className="block text-white/80">{table.minBet}</span>
          <span className="block">– {table.maxBet}</span>
        </span>
      </div>
    </button>
  );
});
