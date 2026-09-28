import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ensureSeeded } from "@/db/seed";
import { AppProvider } from "@/components/providers/AppProvider";
import { Header } from "@/components/header/Header";
import { Footer } from "@/components/footer/Footer";
import { MobileBottomNav } from "@/components/mobile-navigation/MobileBottomNav";
import { MobileMenu } from "@/components/mobile-navigation/MobileMenu";
import { AuthModal } from "@/components/modals/AuthModal";
import { PreviewModal } from "@/components/modals/PreviewModal";
import { LiveChat } from "@/components/support/LiveChat";
import { GamePlayer } from "@/components/games/GamePlayer";
import { Toaster } from "@/components/ui/Toaster";
import { LogoMark } from "@/components/ui/Logo";
import { getAdminContext, getCurrentUser } from "@/lib/server/auth";
import { buildSessionUser, loadCatalog } from "@/lib/server/catalog";
import { getSettings, publicSettings } from "@/lib/server/settings";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  return {
    title: { default: s.seo.metaTitle, template: `%s · ${s.site.name}` },
    description: s.seo.metaDescription,
    keywords: s.seo.keywords,
    alternates: s.seo.canonicalUrl ? { canonical: s.seo.canonicalUrl } : undefined,
    metadataBase: s.seo.canonicalUrl ? new URL(s.seo.canonicalUrl) : undefined,
    openGraph: { title: s.seo.metaTitle, description: s.seo.metaDescription, images: s.seo.ogImage ? [s.seo.ogImage] : undefined, siteName: s.site.name, type: "website" },
    robots: { index: s.seo.robotsIndex, follow: s.seo.robotsIndex },
    icons: s.site.faviconUrl ? { icon: s.site.faviconUrl } : undefined,
  };
}

export default async function SiteLayout({ children }: { children: ReactNode }) {
  await ensureSeeded();
  const [settings, catalog, cur] = await Promise.all([getSettings(), loadCatalog(), getCurrentUser()]);

  if (settings.maintenance.enabled && !(await getAdminContext())) {
    return (
      <main className="grid min-h-screen place-items-center px-6 text-center">
        <div className="panel max-w-md rounded-3xl p-10">
          <LogoMark className="mx-auto h-14 w-14" />
          <h1 className="mt-5 font-display text-[34px] font-bold uppercase text-gold-gradient">Be right back</h1>
          <p className="mt-3 text-[14px] leading-relaxed text-white/65">{settings.maintenance.message}</p>
          <p className="mt-6 text-[12px] text-white/40">{settings.support.email}</p>
        </div>
      </main>
    );
  }

  const user = cur ? await buildSessionUser(cur.user) : null;
  return (
    <AppProvider catalog={catalog} settings={publicSettings(settings)} initialUser={user}>
      <Header />
      {children}
      <Footer />
      <MobileBottomNav />
      <MobileMenu />
      <AuthModal />
      <PreviewModal />
      <LiveChat />
      <GamePlayer />
      <Toaster />
    </AppProvider>
  );
}
