"use client";

import Image from "next/image";
import { Heart, MonitorPlay, Play, Users } from "lucide-react";
import { useApp } from "@/components/providers/AppProvider";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { GameThumbnail } from "@/components/games/GameThumbnail";
import { LiveBadge } from "@/components/live-casino/LiveCasinoCard";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 text-center">
      <p className="text-[10.5px] uppercase tracking-wider text-white/45">{label}</p>
      <p className="mt-0.5 text-[14px] font-semibold text-white">{value}</p>
    </div>
  );
}

export function PreviewModal() {
  const { previewGame, setPreviewGame, previewTable, setPreviewTable, favorites, toggleFavorite, playGame } = useApp();

  const close = () => {
    setPreviewGame(null);
    setPreviewTable(null);
  };


  const game = previewGame;
  const table = previewTable;
  const open = Boolean(game || table);

  return (
    <Modal open={open} onClose={close} label={game?.title ?? table?.name ?? "Preview"}>
      {game && (
        <div>
          <div className="relative aspect-[16/10] overflow-hidden">
            <GameThumbnail src={game.image} title={game.title} art={game.art} sizes="520px" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink-850 via-transparent to-transparent" />
          </div>
          <div className="-mt-6 space-y-4 p-5 pt-0 md:p-6 md:pt-0">
            <div className="relative flex items-end justify-between gap-3">
              <div>
                <p className="text-[12px] text-sky-300/90">{game.provider}</p>
                <h3 className="font-display text-[30px] font-bold uppercase leading-none text-white">{game.title}</h3>
              </div>
              <button
                onClick={() => toggleFavorite(game.id, game.title)}
                aria-label="Toggle favourite"
                className={`grid h-11 w-11 place-items-center rounded-full border transition ${
                  favorites.has(game.id) ? "border-rose-400/40 bg-rose-500/15 text-rose-400" : "border-white/15 text-white/75 hover:text-white"
                }`}
              >
                <Heart className={`h-5 w-5 ${favorites.has(game.id) ? "fill-current" : ""}`} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="RTP" value={`${game.rtp.toFixed(2)}%`} />
              <Stat label="Volatility" value={game.volatility} />
              <Stat label="Max Win" value={game.maxWin} />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {game.hasDemo ? <Button
                variant="outline"
                size="lg"
                iconLeft={<MonitorPlay className="h-4 w-4" />}
                onClick={() => playGame(game, "demo")}
              >
                Demo
              </Button> : <span />}
              <Button size="lg" iconLeft={<Play className="relative h-4 w-4 fill-current" />} disabled={game.status === "maintenance"} onClick={() => playGame(game)}>
                {game.status === "maintenance" ? "Maintenance" : "Play Now"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {table && (
        <div>
          <div className="relative aspect-[16/9] overflow-hidden">
            <Image src={table.image} alt={table.name} fill sizes="520px" className="object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink-850 via-ink-850/10 to-transparent" />
            <LiveBadge className="absolute left-4 top-4" />
          </div>
          <div className="-mt-6 space-y-4 p-5 pt-0 md:p-6 md:pt-0">
            <div className="relative">
              <p className="text-[12px] text-sky-300/90">{table.provider}</p>
              <h3 className="font-display text-[30px] font-bold uppercase leading-none text-white">{table.name}</h3>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Players" value={table.players.toLocaleString("en-US")} />
              <Stat label="Min Bet" value={table.minBet} />
              <Stat label="Max Bet" value={table.maxBet} />
            </div>
            <p className="flex items-center gap-2 text-[12.5px] text-white/55">
              <Users className="h-4 w-4 text-emerald-300" /> Professional dealer · HD stream · Multi-language chat
            </p>
            <Button size="lg" className="w-full" onClick={() => playGame(table.game)}>
              Join Table
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
