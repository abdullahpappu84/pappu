"use client";

import { motion } from "framer-motion";
import { CreditCard, Gift, Headset, Wallet } from "lucide-react";
import { useApp } from "@/components/providers/AppProvider";

const ACTIONS = [
  { id: "deposit", label: "Deposit", icon: Wallet, color: "#f9cf66", bg: "from-gold-400/25" },
  { id: "withdraw", label: "Withdraw", icon: CreditCard, color: "#a78bfa", bg: "from-violet-500/25" },
  { id: "bonuses", label: "Bonuses", icon: Gift, color: "#fb923c", bg: "from-orange-500/25" },
  { id: "chat", label: "Live Chat", icon: Headset, color: "#38bdf8", bg: "from-sky-500/25" },
];

export function QuickActions() {
  const { user, openAuth, scrollTo, go, setChatOpen } = useApp();

  const onAction = (id: string, _label: string) => {
    void _label;
    if (id === "chat") return setChatOpen(true);
    if (id === "bonuses") return user ? go("/account?tab=bonuses") : scrollTo("promotions");
    if (!user) return openAuth("login");
    go(`/account?tab=${id}`);
  };

  return (
    <section aria-label="Quick actions" className="grid grid-cols-4 gap-2.5 xs:gap-3 lg:hidden">
      {ACTIONS.map(({ id, label, icon: Icon, color, bg }) => (
        <motion.button
          key={id}
          whileTap={{ scale: 0.94 }}
          onClick={() => onAction(id, label)}
          className="group flex aspect-square max-h-[92px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-white/[0.08] bg-gradient-to-b from-ink-700/90 to-ink-800 shadow-card sm:aspect-auto sm:h-[84px]"
        >
          <span className={`grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-b ${bg} to-transparent`}>
            <Icon className="h-[22px] w-[22px]" style={{ color, filter: `drop-shadow(0 0 8px ${color}80)` }} strokeWidth={1.8} />
          </span>
          <span className="text-[11.5px] font-medium text-white/85">{label}</span>
        </motion.button>
      ))}
    </section>
  );
}
