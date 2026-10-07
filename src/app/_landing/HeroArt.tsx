// Landing hero figure from the dedicated transparent render. The image is
// the whole visual: no HTML phones, no card, no box — only a soft green
// glow behind it and a grounding shadow beneath the shoes, so it sits in
// the existing signal field. Server-rendered, optimized via next/image.
import Image from "next/image";

import { HERO_ART } from "./hero-art";

export default function HeroArt() {
  return (
    <figure className="tx-hero-art">
      <span className="tx-hero-art-glow" aria-hidden="true" />
      <span className="tx-hero-art-ground" aria-hidden="true" />
      <Image
        src={HERO_ART.src}
        width={HERO_ART.width}
        height={HERO_ART.height}
        alt="The Tenax agent holding two phones: the Event Room for NVIDIA earnings and the Final Tenax Decision refusing an AI proposal — no order sent."
        sizes="(min-width: 1024px) 500px, (min-width: 640px) 400px, 80vw"
        loading="eager"
        fetchPriority="high"
        draggable={false}
        className="tx-hero-art-img"
      />
    </figure>
  );
}
