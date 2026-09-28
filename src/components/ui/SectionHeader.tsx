"use client";

import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

interface SectionHeaderProps {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  subtitleClassName?: string;
  actionLabel?: string;
  onAction?: () => void;
  right?: ReactNode;
}

export function SectionHeader({
  icon,
  title,
  subtitle,
  subtitleClassName = "text-white/55",
  actionLabel = "View All",
  onAction,
  right,
}: SectionHeaderProps) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4 md:mb-4">
      <div className="flex items-center gap-2.5 md:gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center md:h-10 md:w-10">{icon}</span>
        <div className="min-w-0">
          <h2 className="font-display text-[21px] font-semibold leading-none tracking-[0.01em] text-white md:text-[26px]">
            {title}
          </h2>
          {subtitle && (
            <p className={`mt-1 hidden text-[12px] xs:block md:text-[13px] ${subtitleClassName}`}>{subtitle}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {right}
        {onAction && (
          <button
            onClick={onAction}
            className="group inline-flex items-center gap-1.5 text-[12px] font-medium text-sky-300/90 transition-colors hover:text-gold-200 md:text-[13px]"
          >
            {actionLabel}
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </button>
        )}
      </div>
    </div>
  );
}
