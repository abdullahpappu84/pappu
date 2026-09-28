"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Globe } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { LANGUAGES } from "@/data/casino";
import { useApp } from "@/components/providers/AppProvider";
import { useClickOutside } from "@/components/ui/useClickOutside";

interface Props {
  variant?: "pill" | "wide";
  direction?: "down" | "up";
  className?: string;
}

export function LanguageSelector({ variant = "pill", direction = "down", className = "" }: Props) {
  const { language, setLanguage, notify } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close, open);
  const current = LANGUAGES.find((l) => l.code === language) ?? LANGUAGES[0];

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={
          variant === "pill"
            ? "flex h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 text-[12.5px] font-medium text-white/85 transition hover:border-white/25"
            : "flex h-11 w-full items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 text-[13px] text-white/85 transition hover:border-white/25"
        }
      >
        {variant === "wide" && <Globe className="h-4 w-4 text-gold-300" />}
        <span className="text-[14px] leading-none">{current.flag}</span>
        <span>{variant === "wide" ? current.label : current.code}</span>
        <ChevronDown className={`ml-auto h-3.5 w-3.5 text-white/50 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            initial={{ opacity: 0, y: direction === "down" ? -6 : 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: direction === "down" ? -6 : 6, scale: 0.97 }}
            transition={{ duration: 0.16 }}
            className={`absolute z-50 min-w-[170px] overflow-hidden rounded-xl border border-white/10 bg-ink-800/98 p-1 shadow-2xl backdrop-blur-xl ${
              direction === "down" ? "top-full mt-2" : "bottom-full mb-2"
            } ${variant === "wide" ? "left-0 right-0" : "right-0"}`}
          >
            {LANGUAGES.map((l) => (
              <li key={l.code}>
                <button
                  onClick={() => {
                    setLanguage(l.code);
                    setOpen(false);
                    notify({ title: `Language: ${l.label}`, description: "Translations arrive in a later phase.", tone: "info" });
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition ${
                    l.code === language ? "bg-gold-400/10 text-gold-200" : "text-white/80 hover:bg-white/5"
                  }`}
                >
                  <span>{l.flag}</span>
                  <span className="flex-1">{l.label}</span>
                  {l.code === language && <Check className="h-3.5 w-3.5" />}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
