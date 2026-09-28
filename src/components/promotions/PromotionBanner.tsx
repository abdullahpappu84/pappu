"use client";

import Image from "next/image";
import { ArrowRight, CalendarClock, Coins, RefreshCcw, Trophy, Zap } from "lucide-react";
import { useApp } from "@/components/providers/AppProvider";
import { iconFor } from "@/lib/icons";
import { Button } from "@/components/ui/Button";

const COINS = [
  { symbol: "₿", label: "Bitcoin", bg: "linear-gradient(180deg,#fbbf24,#ea8a0c)" },
  { symbol: "Ξ", label: "Ethereum", bg: "linear-gradient(180deg,#8b9cf6,#4f5fd6)" },
  { symbol: "₮", label: "Tether", bg: "linear-gradient(180deg,#34d399,#0f9f6e)" },
  { symbol: "Ł", label: "Litecoin", bg: "linear-gradient(180deg,#94a3b8,#475569)" },
  { symbol: "◎", label: "Solana", bg: "linear-gradient(180deg,#c084fc,#14b8a6)" },
];

export function PromotionBanner() {
  const { openAuth, user, notify, promotions, go } = useApp();
  const offers = promotions.map((p) => ({ ...p, icon: iconFor(p.icon) }));
  const claim = () => (user ? go("/account?tab=deposit") : openAuth("register"));
  const openOffer = (title: string, description: string, bonusId: number | null) => {
    if (bonusId && user) return go(`/account?tab=deposit&bonus=${bonusId}`);
    if (bonusId) return openAuth("register");
    notify({ title, description: description || "Check back soon for details.", tone: "gold" });
  };
  void RefreshCcw;
  void Trophy;

  return (
    <section id="promotions" aria-label="Promotions" className="scroll-mt-24 space-y-3 md:space-y-4">
      {/* ---------- Welcome bonus banner ---------- */}
      <div className="relative overflow-hidden rounded-2xl border-gold-gradient shadow-[0_20px_50px_-24px_rgba(240,185,63,0.45)]">
        {/* decorative light */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_140%_at_12%_50%,rgba(240,185,63,0.2),transparent_60%)]" />
        <div className="pointer-events-none absolute -left-10 top-0 h-full w-[140%] bg-[linear-gradient(115deg,transparent_38%,rgba(249,207,102,0.13)_45%,transparent_52%,transparent_60%,rgba(249,207,102,0.08)_64%,transparent_70%)]" />
        <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:radial-gradient(rgba(249,207,102,0.5)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(90deg,transparent,black_60%,transparent)]" />

        <div className="relative grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-3 p-3.5 md:grid-cols-[auto_1fr_auto] md:gap-x-6 md:p-4 lg:grid-cols-[auto_1fr_auto_auto] lg:gap-x-8 lg:px-6 lg:py-3">
          <div className="relative -my-2 h-[92px] w-[92px] md:h-[118px] md:w-[130px] lg:h-[128px] lg:w-[170px]">
            <Image src="/images/promo-gift.png" alt="" fill sizes="170px" className="object-contain mix-blend-lighten" />
          </div>

          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-white/85 md:text-[12px]">Welcome Bonus</p>
            <p className="font-display text-[30px] font-bold uppercase leading-none text-gold-gradient xs:text-[34px] md:text-[40px] xl:text-[46px]">
              Up to 200%
            </p>
            <p className="mt-1 text-[12px] text-white/75 md:text-[14px]">
              <span className="font-semibold text-white">+150 Free Spins</span> · Your first deposit, bigger rewards!
            </p>
          </div>

          <div className="col-span-2 flex flex-col items-stretch gap-1.5 md:col-span-1 md:items-center">
            <Button variant="gold" pill onClick={claim} iconRight={<ArrowRight className="relative h-4 w-4" />} className="h-11 px-8">
              Claim Bonus
            </Button>
            <span className="text-center text-[10px] text-white/40">T&amp;Cs apply · 18+ · Play responsibly</span>
          </div>

          <div className="col-span-2 hidden items-center gap-6 border-l border-white/10 pl-8 lg:col-span-1 lg:flex">
            <ul className="space-y-2 text-[12px]">
              <li className="flex items-center gap-2 text-white/85">
                <Zap className="h-4 w-4 text-gold-300" /> Fast Payouts
              </li>
              <li className="flex items-center gap-2 text-white/85">
                <Coins className="h-4 w-4 text-gold-300" /> Multiple Currencies
              </li>
            </ul>
            <div className="hidden items-center gap-1.5 xl:flex">
              {COINS.map((c) => (
                <span
                  key={c.label}
                  title={c.label}
                  className="grid h-8 w-8 place-items-center rounded-full text-[14px] font-bold text-white ring-2 ring-gold-300/60 shadow-[0_0_12px_-2px_rgba(240,185,63,0.5)]"
                  style={{ background: c.bg }}
                >
                  {c.symbol}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ---------- Secondary offers ---------- */}
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 no-scrollbar xs:-mx-5 xs:px-5 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 xl:gap-4">
        {offers.map(({ icon: Icon, title, value, note, description, bonusId }) => (
          <button
            key={title}
            onClick={() => openOffer(title, description, bonusId)}
            className="group flex w-[78%] shrink-0 snap-start items-center gap-3.5 rounded-xl panel px-4 py-3.5 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-gold-300/35 xs:w-[60%] md:w-auto"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-gold-300/25 bg-gradient-to-b from-gold-300/15 to-transparent text-gold-300 transition group-hover:shadow-gold">
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11.5px] uppercase tracking-wider text-white/50">{title}</span>
              <span className="block truncate text-[14.5px] font-semibold text-white">{value}</span>
              <span className="mt-0.5 flex items-center gap-1 text-[11px] text-gold-200/70">
                <CalendarClock className="h-3 w-3" /> {note}
              </span>
            </span>
            <ArrowRight className="h-4 w-4 text-white/30 transition group-hover:translate-x-0.5 group-hover:text-gold-300" />
          </button>
        ))}
      </div>
    </section>
  );
}
