# Tenax agent asset — placeholder

Expected file: `tenax-agent.png` (served at `/brand/tenax-agent.png`).

Contract (hooded-robot reference family):
- Full small character silhouette: visible hood/garment, rounded dark
  screen face, simple glowing eyes, compact body, soft proportions.
- Premium 3D-render feel, transparent background (PNG with alpha).
- Square-ish framing, minimum 512×512, subject centered with ~10% padding.
- Calm, intelligent, protective personality. No text baked into the image.

State is rendered by code around the asset (halo glow, state badge, orbit
ring, shimmer, float) — see `TenaxAgent` in
`src/app/app/_components/living.tsx`. Do not bake state variants into
separate files; one asset serves all states.

Until this file lands, `AgentFigure` renders an abstract frosted stand-in.
