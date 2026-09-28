"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type Variant = "gold" | "outline" | "ghost" | "glass";
type Size = "xs" | "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  iconRight?: ReactNode;
  iconLeft?: ReactNode;
  pill?: boolean;
}

const base =
  "relative inline-flex items-center justify-center gap-2 overflow-hidden font-semibold whitespace-nowrap transition-all duration-300 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.97]";

const variants: Record<Variant, string> = {
  gold: "bg-gold-gradient text-ink-950 shadow-gold hover:shadow-gold-lg hover:brightness-110 uppercase tracking-wide font-bold",
  outline:
    "border border-white/20 bg-white/[0.02] text-white hover:border-gold-300/70 hover:text-gold-200 hover:bg-gold-400/[0.06]",
  ghost: "text-white/75 hover:text-white hover:bg-white/5",
  glass: "glass text-white hover:border-gold-300/50 hover:text-gold-100",
};

const sizes: Record<Size, string> = {
  xs: "h-8 px-3 text-[11px]",
  sm: "h-9 px-4 text-[12.5px]",
  md: "h-11 px-6 text-[13px]",
  lg: "h-12 px-8 text-[14px] md:h-[52px] md:text-[15px]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "gold", size = "md", pill = false, iconLeft, iconRight, className = "", children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`${base} ${variants[variant]} ${sizes[size]} ${pill ? "rounded-full" : "rounded-lg"} ${className}`}
      {...rest}
    >
      {variant === "gold" && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/45 to-transparent animate-shine"
        />
      )}
      {iconLeft}
      <span className="relative">{children}</span>
      {iconRight}
    </button>
  );
});
