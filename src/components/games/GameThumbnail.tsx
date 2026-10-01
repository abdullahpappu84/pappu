"use client";

import Image from "next/image";
import { useState } from "react";
import type { GameDTO, GameArtDTO } from "@/lib/types";
import { GameArt } from "./GameArt";

const fallbackArt: GameArtDTO = { icon: "Gamepad2", from: "#253047", to: "#101522", glow: "#f0b93f" };

/** Aggregator thumbnail hosts vary, so load game artwork directly instead of through Next's image host allowlist. */
export function GameThumbnail({ src, title, art, priority = false, sizes }: {
  src?: string;
  title: string;
  art?: GameDTO["art"];
  priority?: boolean;
  sizes?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = failedSrc === src;

  if (src && !failed) {
    return <Image
      src={src}
      alt={`${title} artwork`}
      fill
      priority={priority}
      sizes={sizes}
      unoptimized
      className="object-cover"
      onError={() => setFailedSrc(src)}
    />;
  }

  return <GameArt art={art ?? fallbackArt} title={title} />;
}
