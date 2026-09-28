import type { GameArtDTO } from "@/lib/types";
import { iconFor } from "@/lib/icons";

/** Original procedural artwork used when a game has no illustrated thumbnail. */
export function GameArt({ art, title }: { art: GameArtDTO; title: string }) {
  const Icon = iconFor(art.icon);
  const words = title.split(" ");
  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{ background: `radial-gradient(120% 95% at 50% 25%, ${art.from} 0%, ${art.to} 78%)` }}
    >
      {/* light rays */}
      <div
        className="absolute left-1/2 top-[38%] h-[220%] w-[220%] -translate-x-1/2 -translate-y-1/2 opacity-30"
        style={{
          background: `repeating-conic-gradient(from 0deg, ${art.glow}33 0deg 8deg, transparent 8deg 22deg)`,
          maskImage: "radial-gradient(circle, black 0%, transparent 45%)",
          WebkitMaskImage: "radial-gradient(circle, black 0%, transparent 45%)",
        }}
      />
      {/* dotted texture */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.12) 1px, transparent 1px)",
          backgroundSize: "12px 12px",
        }}
      />
      {/* glow orb */}
      <div
        className="absolute left-1/2 top-[36%] h-[55%] aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl"
        style={{ background: `${art.glow}55` }}
      />
      <Icon
        className="absolute left-1/2 top-[34%] h-[40%] w-[40%] -translate-x-1/2 -translate-y-1/2"
        style={{ color: art.glow, filter: `drop-shadow(0 0 14px ${art.glow}) drop-shadow(0 4px 6px rgba(0,0,0,0.6))` }}
        strokeWidth={1.4}
      />
      <div className="absolute inset-x-2 bottom-[9%] text-center font-display font-extrabold uppercase leading-[0.9]">
        {words.map((w, i) => (
          <span
            key={i}
            className="block text-gold-gradient text-[clamp(15px,2.2vw,30px)] lg:text-[clamp(16px,1.45vw,30px)] drop-shadow-[0_3px_0_rgba(0,0,0,0.55)]"
          >
            {w}
          </span>
        ))}
      </div>
      <div className="absolute inset-0 ring-1 ring-inset ring-white/10" />
    </div>
  );
}
