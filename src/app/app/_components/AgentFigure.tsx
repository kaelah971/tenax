// Tenax agent visual: renders the supplied mascot asset with a graceful
// temporary fallback. Client-side only for img onError handling; state
// meaning (glow, badge, motion) lives in the server-safe TenaxAgent wrapper.
"use client";

import Image from "next/image";
import { useState } from "react";

export default function AgentFigure({
  src,
  size,
  glowColor,
}: {
  src: string;
  size: number;
  glowColor: string;
}) {
  const [missing, setMissing] = useState(false);

  if (missing) {
    // Temporary stand-in until the final mascot asset lands. Deliberately
    // abstract (frosted tile + state glow) — never a faked 3D character.
    return (
      <span
        data-agent-fallback="true"
        aria-hidden="true"
        className="flex items-center justify-center rounded-[28%] border border-white/60 bg-softwhite/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_18px_36px_-18px_rgba(17,17,17,0.4)] backdrop-blur-md"
        style={{ width: size, height: size }}
      >
        <span
          className="live-indicator-dot"
          style={{ background: glowColor, width: 12, height: 12 }}
        />
      </span>
    );
  }

  return (
    <Image
      src={src}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
      unoptimized
      onError={() => setMissing(true)}
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  );
}
