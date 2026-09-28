"use client";

import { ChevronDown, Landmark, Mail, MessageCircle, Smartphone, Wallet } from "lucide-react";
import type { CategoryId } from "@/data/types";
import { useApp } from "@/components/providers/AppProvider";
import { useNavAction } from "@/components/header/useNavAction";
import { Logo } from "@/components/ui/Logo";
import { SOCIALS } from "@/components/ui/SocialIcons";
import { LanguageSelector } from "@/components/header/LanguageSelector";

type FooterLink = { label: string; target?: string; category?: CategoryId; href?: string };

const LINK_GROUPS: { title: string; links: FooterLink[] }[] = [
  {
    title: "Casino",
    links: [
      { label: "Casino", target: "games", category: "all" },
      { label: "Live Casino", target: "live-casino" },
      { label: "Slots", target: "games", category: "slots" },
      { label: "Table Games", target: "games", category: "table" },
      { label: "Jackpots", target: "games", category: "jackpot" },
      { label: "Promotions", target: "promotions" },
    ],
  },
  {
    title: "About",
    links: [{ label: "About Us", href: "/p/about" }, { label: "VIP Club", target: "trust" }, { label: "Affiliates", href: "/p/contact" }, { label: "FAQ", href: "/p/faq" }, { label: "Contact", href: "/p/contact" }],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms & Conditions", href: "/p/terms" },
      { label: "Privacy Policy", href: "/p/privacy" },
      { label: "Responsible Gaming", href: "/p/responsible-gaming" },
      { label: "KYC & AML Policy", href: "/account?tab=kyc" },
      { label: "Cookie Policy", href: "/p/privacy" },
    ],
  },
];

const PAYMENTS = [
  { label: "VISA", node: <span className="font-display text-[15px] font-extrabold italic tracking-wide text-white">VISA</span> },
  {
    label: "Mastercard",
    node: (
      <span className="flex items-center">
        <span className="h-4 w-4 rounded-full bg-[#eb001b]" />
        <span className="-ml-1.5 h-4 w-4 rounded-full bg-[#f79e1b] mix-blend-screen" />
      </span>
    ),
  },
  { label: "Bank", node: <Landmark className="h-4 w-4 text-white/80" /> },
  { label: "E-Wallet", node: <Wallet className="h-4 w-4 text-white/80" /> },
  { label: "Mobile Pay", node: <Smartphone className="h-4 w-4 text-white/80" /> },
  { label: "Bitcoin", node: <span className="text-[14px] font-bold text-[#f7a21b]">₿</span> },
  { label: "Ethereum", node: <span className="text-[14px] font-bold text-[#8b9cf6]">Ξ</span> },
  { label: "Tether", node: <span className="text-[14px] font-bold text-emerald-400">₮</span> },
];

export function Footer() {
  const { notify, go, setChatOpen, settings } = useApp();
  const navigate = useNavAction();

  const onLink = (l: FooterLink) =>
    l.href ? go(l.href) : l.target ? navigate(l) : notify({ title: l.label, description: "This page will be added in a later phase.", tone: "info" });

  return (
    <footer className="relative mt-10 border-t border-white/[0.06] bg-ink-900/80 pb-24 lg:mt-14 lg:pb-0">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-400/40 to-transparent" />
      <div className="container-x py-8 lg:py-12">
        <div className="grid gap-8 lg:grid-cols-[1.35fr_2.2fr_1.5fr] lg:gap-10 xl:gap-14">
          {/* Brand */}
          <div className="space-y-4">
            <Logo size="md" />
            <p className="max-w-sm text-[13px] leading-relaxed text-white/55">
              {settings.site.name} is a premium international gaming destination offering world-class slots, live dealer tables and
              exclusive VIP experiences.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setChatOpen(true)}
                className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 text-[12.5px] text-white/80 transition hover:border-gold-300/40 hover:text-gold-100"
              >
                <MessageCircle className="h-4 w-4 text-gold-300" /> Live Chat 24/7
              </button>
              <a
                href={`mailto:${settings.site.contactEmail}`}
                className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 text-[12.5px] text-white/80 transition hover:border-gold-300/40 hover:text-gold-100"
              >
                <Mail className="h-4 w-4 text-gold-300" /> {settings.site.contactEmail}
              </a>
            </div>
            <LanguageSelector variant="wide" direction="up" className="max-w-[240px]" />
          </div>

          {/* Link groups: columns on desktop, accordions on mobile */}
          <div className="grid gap-0 border-y border-white/[0.06] md:grid-cols-3 md:gap-6 md:border-0 lg:gap-8">
            {LINK_GROUPS.map((group) => (
              <details key={group.title} className="group border-b border-white/[0.06] last:border-0 md:border-0 md:[&>summary]:pointer-events-none" open>
                <summary className="flex cursor-pointer list-none items-center justify-between py-3.5 text-[13px] font-semibold uppercase tracking-[0.14em] text-white md:cursor-default md:py-0 md:pb-4 [&::-webkit-details-marker]:hidden">
                  {group.title}
                  <ChevronDown className="h-4 w-4 text-white/40 transition-transform group-open:rotate-180 md:hidden" />
                </summary>
                <ul className="grid grid-cols-2 gap-x-4 gap-y-2.5 pb-4 md:grid-cols-1 md:pb-0">
                  {group.links.map((l) => (
                    <li key={l.label}>
                      <button onClick={() => onLink(l)} className="text-left text-[13px] text-white/55 transition-colors hover:text-gold-200">
                        {l.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>

          {/* Payments + community */}
          <div className="space-y-6">
            <div>
              <p className="mb-3 text-[13px] font-semibold uppercase tracking-[0.14em] text-white">Payment Methods</p>
              <ul className="grid grid-cols-4 gap-2">
                {PAYMENTS.map((p) => (
                  <li
                    key={p.label}
                    title={p.label}
                    className="grid h-10 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.03] transition hover:border-white/20"
                  >
                    {p.node}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-3 text-[13px] font-semibold uppercase tracking-[0.14em] text-white">Join Our Community</p>
              <div className="flex gap-2">
                {SOCIALS.map(({ label, icon: Icon }) => (
                  <button
                    key={label}
                    aria-label={label}
                    onClick={() => { const url = settings.site.socials[label.toLowerCase()]; if (url) window.open(url, "_blank", "noopener"); else notify({ title: label, description: "Channel coming soon.", tone: "info" }); }}
                    className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-white/75 transition hover:-translate-y-0.5 hover:border-gold-300/50 hover:text-gold-200"
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-8 flex flex-col gap-4 border-t border-white/[0.06] pt-6 md:flex-row md:items-center md:justify-between lg:mt-10">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 border-white/70 text-[12px] font-bold text-white">
              18+
            </span>
            <p className="text-[11.5px] leading-snug text-white/50">
              <span className="block text-white/75">Play Responsibly · Licensed &amp; Regulated</span>
              Gambling can be addictive. Please play responsibly. Licence details are placeholders for this prototype.
            </p>
          </div>
          <p className="text-[12px] text-white/45">
            © {new Date().getFullYear()} {settings.site.name}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
