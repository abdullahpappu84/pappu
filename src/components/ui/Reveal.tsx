"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

export function Reveal({
  children,
  delay = 0,
  className = "",
  as = "section",
  id,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "section" | "div";
  id?: string;
}) {
  const Comp = as === "section" ? motion.section : motion.div;
  return (
    <Comp
      id={id}
      className={className}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </Comp>
  );
}
