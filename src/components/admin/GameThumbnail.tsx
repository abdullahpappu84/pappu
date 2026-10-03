"use client";

import { Gamepad2 } from "lucide-react";
import { useEffect, useState } from "react";

export function GameThumbnail({ src, name, className }: { src: string | null | undefined; name: string; className: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  if (src && !failed) {
    return <img src={src} alt={`${name} thumbnail`} loading="lazy" className={`${className} bg-white/5`} onError={() => setFailed(true)} />;
  }

  const initials = name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "G";
  return (
    <span role="img" aria-label={`${name} thumbnail unavailable`} className={`${className} flex shrink-0 flex-col items-center justify-center gap-0.5 overflow-hidden bg-gradient-to-br from-amber-300/15 via-slate-800 to-indigo-950 text-amber-100/70`}>
      <Gamepad2 aria-hidden="true" className="h-1/2 w-1/2" />
      <span className="text-[9px] font-semibold tracking-wide">{initials}</span>
    </span>
  );
}
