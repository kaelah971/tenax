// Dedicated landing-hero render (mascot holding the Event Room and Final
// Tenax Decision phones). Landing hero only — the in-app mascot stays on
// /brand/tenax-agent.png.
//
// `approved` is an owner gate, not a build switch: the render's phone
// screens are baked into the image, so it may only go live once the owner
// confirms they match Tenax's truthful product state (unverified event
// date, $500 simulated exposure, no "verified" claims). Until then the
// current code-rendered hero stays in place.
export const HERO_ART = {
  src: "/brand/tenax-agent-hero.png",
  width: 1122,
  height: 1402,
  approved: false,
} as const;
