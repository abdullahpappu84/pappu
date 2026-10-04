import { HeroBanner } from "@/components/hero/HeroBanner";
import { QuickActions } from "@/components/mobile-navigation/QuickActions";
import { GameSearchBar } from "@/components/search/GameSearchBar";
import { CategorySlider } from "@/components/categories/CategorySlider";
import { LobbySections } from "@/components/games/LobbySections";
import { LiveCasinoSection } from "@/components/live-casino/LiveCasinoSection";
import { PromotionBanner } from "@/components/promotions/PromotionBanner";
import { TrustSection } from "@/components/trust/TrustSection";
import { Reveal } from "@/components/ui/Reveal";

export default function HomePage() {
  return (
    <main className="relative">
      <HeroBanner />
      <div className="container-x mt-3 md:mt-4">
        <GameSearchBar />
      </div>
      <div className="container-x mt-4 space-y-6 md:mt-5 md:space-y-7 lg:mt-0 xl:space-y-8">
        <QuickActions />
        <CategorySlider />
        <LobbySections />
        <Reveal as="div">
          <LiveCasinoSection />
        </Reveal>
        <Reveal as="div">
          <PromotionBanner />
        </Reveal>
        <Reveal as="div">
          <TrustSection />
        </Reveal>
      </div>
    </main>
  );
}
