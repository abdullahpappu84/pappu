"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Info, Sparkles, X } from "lucide-react";
import { useApp } from "@/components/providers/AppProvider";

const toneIcon = {
  gold: <Sparkles className="h-4 w-4 text-gold-300" />,
  success: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
  info: <Info className="h-4 w-4 text-sky-300" />,
};

export function Toaster() {
  const { toasts, dismissToast } = useApp();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[68px] z-[80] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:left-auto lg:right-6 lg:top-auto lg:items-end">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.25 }}
            className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-white/10 bg-ink-800/95 px-4 py-3 shadow-2xl backdrop-blur-xl"
          >
            <span className="mt-0.5">{toneIcon[t.tone ?? "gold"]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-white">{t.title}</p>
              {t.description && <p className="mt-0.5 text-[12px] text-white/60">{t.description}</p>}
            </div>
            <button onClick={() => dismissToast(t.id)} className="text-white/40 hover:text-white" aria-label="Dismiss">
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
