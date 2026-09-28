"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useOptionalApp } from "@/components/providers/AppProvider";
import { BRAND } from "@/data/casino";

export type Brand = { name: string; tagline: string; logoUrl: string; iconUrl: string; logoHeight: number; logoHeightMobile: number };

export const DEFAULT_BRAND: Brand = { name: BRAND.name, tagline: BRAND.tagline, logoUrl: "", iconUrl: "", logoHeight: 40, logoHeightMobile: 32 };

const BrandContext = createContext<Brand | null>(null);

/** Supplies brand settings to areas outside the player AppProvider (admin console, admin login). */
export function BrandProvider({ brand, children }: { brand: Partial<Brand>; children: ReactNode }) {
  return <BrandContext.Provider value={{ ...DEFAULT_BRAND, ...brand }}>{children}</BrandContext.Provider>;
}

/** Brand from Admin → Settings → site (player site or admin), falling back to the built-in brand. */
export function useBrand(): Brand {
  const app = useOptionalApp();
  const ctx = useContext(BrandContext);
  const s = app?.settings.site ?? ctx;
  if (!s) return DEFAULT_BRAND;
  return {
    name: s.name || DEFAULT_BRAND.name,
    tagline: s.tagline ?? DEFAULT_BRAND.tagline,
    logoUrl: s.logoUrl || "",
    iconUrl: s.iconUrl || "",
    logoHeight: Number(s.logoHeight) || DEFAULT_BRAND.logoHeight,
    logoHeightMobile: Number(s.logoHeightMobile) || DEFAULT_BRAND.logoHeightMobile,
  };
}
