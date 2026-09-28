"use client";

import { BadgeCheck, Crown, HeartHandshake, Headphones, ShieldCheck, Zap } from "lucide-react";
import { useApp } from "@/components/providers/AppProvider";
import { Button } from "@/components/ui/Button";

const TRUST_ITEMS = [
  { icon: ShieldCheck, title: "Secure Platform", text: "256-bit SSL & 2FA protection" },
  { icon: Zap, title: "Fast Payouts", text: "Most withdrawals in minutes" },
  { icon: Headphones, title: "24/7 Support", text: "Multilingual live chat" },
  { icon: BadgeCheck, title: "Licensed & Regulated", text: "Licence No. XXXX/0000 (placeholder)" },
  { icon: HeartHandshake, title: "Responsible Gaming", text: "Limits, cool-off & self-exclusion" },
];

const TIERS = ["Silver", "Gold", "Platinum", "Obsidian"];

export function TrustSection() {
  const { user, go, openAuth } = useApp();
  return (
    <section id="trust" aria-label="Why Aurum Royale" className="scroll-mt-24 space-y-3 md:space-y-4">
      {/* VIP teaser */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[linear-gradient(100deg,#141827_0%,#0c0f19_55%,#1a1408_100%)] p-4 md:p-5">
        <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-gold-400/10 blur-3xl" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3.5">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gold-gradient text-ink-950 shadow-gold">
              <Crown className="h-6 w-6" />
            </span>
            <div>
              <p className="font-display text-[20px] font-semibold leading-none text-white md:text-[24px]">
                Aurum <span className="text-gold-gradient">VIP Club</span>
              </p>
              <p className="mt-1 text-[12.5px] text-white/60 md:text-[13px]">
                Personal account manager, priority withdrawals and invitations to exclusive events.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {TIERS.map((t, i) => (
              <span
                key={t}
                className={`rounded-full border px-3 py-1 text-[11px] font-semibold tracking-wide ${
                  i === 1 ? "border-gold-300/60 bg-gold-400/10 text-gold-200" : "border-white/10 text-white/60"
                }`}
              >
                {t}
              </span>
            ))}
            <Button
              variant="outline"
              size="sm"
              pill
              className="ml-auto md:ml-2"
              onClick={() => (user ? go("/account?tab=vip") : openAuth("register"))}
            >
              Discover VIP
            </Button>
          </div>
        </div>
      </div>

      {/* Trust indicators */}
      <ul className="panel grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/[0.04] md:grid-cols-3 lg:grid-cols-5">
        {TRUST_ITEMS.map(({ icon: Icon, title, text }, i) => (
          <li
            key={title}
            className={`flex items-center gap-3 bg-ink-850 px-3.5 py-3.5 md:px-4 md:py-4 ${
              i === TRUST_ITEMS.length - 1 ? "col-span-2 lg:col-span-1" : ""
            }`}
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-gold-300/30 bg-gold-400/[0.08] text-gold-300">
              <Icon className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0">
              <span className="block text-[12.5px] font-semibold text-white md:text-[13.5px]">{title}</span>
              <span className="block text-[11px] leading-snug text-white/50 md:text-[12px]">{text}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
