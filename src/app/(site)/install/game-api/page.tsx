import type { Metadata } from "next";
import { DocPage } from "@/components/account/DocPage";
import { GAME_API_GUIDE } from "@/content/game-api-guide";

export const metadata: Metadata = { title: "Game API Integration Note", robots: { index: false } };

export default function GameApiGuidePage() {
  return <DocPage active="game" title="Game API যোগ করার নোট" subtitle="Game provider / aggregator-এর API key বসানো, callback আর পরীক্ষা — ধাপে ধাপে।" markdown={GAME_API_GUIDE} />;
}
