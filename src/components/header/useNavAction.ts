"use client";

import { useCallback } from "react";
import { useApp } from "@/components/providers/AppProvider";
import type { NavItem } from "@/data/types";

/** Shared navigation behaviour for header, drawer and bottom nav. */
export function useNavAction() {
  const { setCategory, setSearch, setProvider, scrollTo, setMenuOpen } = useApp();
  return useCallback(
    (item: Pick<NavItem, "target" | "category">) => {
      if (item.category) {
        setCategory(item.category);
        setSearch("");
        setProvider("All Providers");
      }
      setMenuOpen(false);
      // allow drawer close animation to begin before scrolling
      window.setTimeout(() => scrollTo(item.target ?? "top"), 60);
    },
    [setCategory, setSearch, setProvider, scrollTo, setMenuOpen],
  );
}
