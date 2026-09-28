import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BrandProvider } from "@/components/ui/BrandContext";
import { getSettings } from "@/lib/server/settings";
import { ensureSeeded } from "@/db/seed";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  return { title: `Admin Console · ${s.site.name}`, robots: { index: false, follow: false }, icons: s.site.faviconUrl ? { icon: s.site.faviconUrl } : undefined };
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await ensureSeeded();
  const s = await getSettings();
  return (
    <BrandProvider brand={s.site}>
      <div className="min-h-screen bg-ink-950">{children}</div>
    </BrandProvider>
  );
}
