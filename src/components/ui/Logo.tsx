"use client";

import { useId } from "react";
import { BRAND } from "@/data/casino";
import { useOptionalApp } from "@/components/providers/AppProvider";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showTagline?: boolean;
  className?: string;
}

export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  const raw = useId();
  const id = `lg${raw.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg viewBox="0 0 48 46" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff3cc" />
          <stop offset="0.45" stopColor="#f6c64f" />
          <stop offset="1" stopColor="#b47810" />
        </linearGradient>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffe9a8" />
          <stop offset="1" stopColor="#c68a17" />
        </linearGradient>
      </defs>
      {/* crown body */}
      <path d="M5 15 L14.5 25 L24 8 L33.5 25 L43 15 L39.5 35 H8.5 Z" fill={`url(#${id})`} />
      {/* inner facet */}
      <path d="M24 16 L29 25.5 L24 32 L19 25.5 Z" fill="#0b0d16" />
      <path d="M24 19.5 L26.6 25.5 L24 29 L21.4 25.5 Z" fill={`url(#${id}b)`} />
      {/* base band */}
      <rect x="8" y="37.5" width="32" height="4.5" rx="2" fill={`url(#${id})`} />
      {/* jewels */}
      <circle cx="24" cy="5.5" r="3.2" fill={`url(#${id}b)`} />
      <circle cx="4.5" cy="13.5" r="2.6" fill={`url(#${id}b)`} />
      <circle cx="43.5" cy="13.5" r="2.6" fill={`url(#${id}b)`} />
    </svg>
  );
}

const sizes = {
  sm: { mark: "h-7 w-7", word: "text-[20px]", tag: "text-[7px] tracking-[0.28em]" },
  md: { mark: "h-9 w-9", word: "text-[25px]", tag: "text-[8px] tracking-[0.32em]" },
  lg: { mark: "h-11 w-11", word: "text-[30px]", tag: "text-[9px] tracking-[0.34em]" },
};

export function Logo({ size = "md", showTagline = true, className = "" }: LogoProps) {
  const s = sizes[size];
  const logoUrl = useOptionalApp()?.settings.site.logoUrl;
  if (logoUrl)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl} alt={BRAND.name} className={`${size === "sm" ? "h-8" : size === "md" ? "h-10" : "h-12"} w-auto ${className}`} />
    );
  return (
    <span className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      <LogoMark className={`${s.mark} drop-shadow-[0_2px_10px_rgba(240,185,63,0.35)]`} />
      <span className="flex flex-col leading-none">
        <span className={`font-display font-bold ${s.word} tracking-[0.01em]`}>
          <span className="text-white">{BRAND.first}</span>
          <span className="text-gold-gradient">{BRAND.second}</span>
        </span>
        {showTagline && (
          <span className={`mt-1 font-medium uppercase text-white/55 ${s.tag}`}>{BRAND.tagline}</span>
        )}
      </span>
    </span>
  );
}
