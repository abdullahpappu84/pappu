import type { LucideIcon } from "lucide-react";
import type { BannerDTO, GameDTO } from "@/lib/types";

export type CategoryId = string;

export interface Category {
  id: CategoryId;
  label: string;
  shortLabel?: string;
  icon: LucideIcon;
  color: string;
  badge?: "HOT" | "NEW";
}

export type Game = GameDTO;

export interface LiveTable {
  id: string;
  name: string;
  provider: string;
  image: string;
  players: number;
  minBet: string;
  maxBet: string;
  icon: LucideIcon;
  accent: string;
  tag?: string;
  game: Game;
}

export type HeroSlide = BannerDTO;

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  target?: string;
  category?: CategoryId;
}
