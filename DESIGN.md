---
version: beta-signal
name: Tenax
description: "Institutional capital infrastructure x editorial product design x high-energy signal system — one yellow, ink authority, honest states."
colors:
  signal: "#F5FF3B"
  ink: "#111111"
  graphite: "#242424"
  ivory: "#F3EFE6"
  softWhite: "#FFFDF8"
  mutedInk: "#6E6D66"
  passGreen: "#177A50"
  refuseClay: "#C74B3B"
typography:
  editorial-hero:
    fontFamily: "Inter Tight, General Sans, Inter, sans-serif"
    fontSize: 64-96px desktop / 40px mobile
    fontWeight: 800
    lineHeight: 0.95-1.0
    letterSpacing: "-0.03em"
  signal-numeral:
    fontFamily: "Inter Tight, General Sans, Inter, sans-serif"
    fontSize: 72-120px desktop / 56px mobile
    fontWeight: 800
    lineHeight: 1.0
    letterSpacing: "-0.03em"
  body-large:
    fontFamily: "Inter Tight, General Sans, Inter, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
  nav:
    fontFamily: "Inter Tight, General Sans, Inter, sans-serif"
    fontSize: 15px
    fontWeight: 600
    lineHeight: 20px
  button:
    fontFamily: "Inter Tight, General Sans, Inter, sans-serif"
    fontSize: 15px
    fontWeight: 700
    lineHeight: 20px
    letterSpacing: "0.02em"
  system-label:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: 11px
    fontWeight: 500
    lineHeight: 14px
    letterSpacing: "0.08em"
    uppercase: true
  card-title:
    fontFamily: "Inter Tight, General Sans, Inter, sans-serif"
    fontSize: 13px
    fontWeight: 700
    lineHeight: 18px
  card-meta:
    fontFamily: "Inter Tight, General Sans, Inter, sans-serif"
    fontSize: 11px
    fontWeight: 400
    lineHeight: 14px
rounded:
  sharp: 2px
  control: 6px
  card: 10px
  pill: 9999px
spacing:
  xxs: 4px
  xs: 8px
  sm: 16px
  md: 24px
  lg: 32px
  xl: 48px
  2xl: 64px
  3xl: 96px
  4xl: 128px
---

# Tenax Design System — Signal Edition

## Overview

Tenax is an operating system for capital intent — institutional capital
infrastructure with editorial confidence and a high-energy signal system.
The interface must feel capable of carrying far more than the NVIDIA
earnings wedge: protect exposure, hedge risk, rebalance, enforce
spending/deployment rules, route capital, refuse unsafe actions.

The system runs on one dominant color used aggressively — **Signal Yellow
`#F5FF3B`** — against **Ink `#111111`** authority surfaces and a warm
ivory field. Yellow is not an accent. It marks major surfaces, decision
states, active navigation, event blocks, numerical highlights, approval
controls, Mandate Gate illumination, and interaction feedback.

Blue is retired as a brand color. It appears nowhere in new surfaces.

## Colors

| Token | Hex | Role |
|---|---|---|
| Signal Yellow | `#F5FF3B` | The dominant brand signal: active rail stage, gate illumination, approval CTAs, event blocks, key numerals, interaction feedback. Always paired with Ink text, never alone as decoration. |
| Ink | `#111111` | Authority and control: header bar, gate surface, control panels, primary text. |
| Graphite | `#242424` | Secondary dark surface: data regions, event blocks, footer fields. |
| Warm Ivory | `#F3EFE6` | Page field. Warm, never clinical. |
| Soft White | `#FFFDF8` | Selective cards and inputs on ivory. Not the page base. |
| Muted Ink | `#6E6D66` | Secondary copy, metadata, future rail stages. |
| Pass Green | `#177A50` | `PASS` states only, always with the word PASS. |
| Refuse Clay | `#C74B3B` | `REFUSED` / blocked states only, always with the word REFUSED. |

### Semantic rules
- Yellow means *signal*: the live thing, the active thing, the thing that
  needs a decision. It never decorates emptiness.
- Ink means *authority*: the system that enforces, the control that binds.
- State colors exist only as **labeled states**: `PASS`, `REFUSED`,
  `DRY RUN`, session markers. A color never speaks alone.
- Refusal gets dignity, not alarm: clay state word, flat surface, recorded
  reason. Refusal never glows yellow.
- No second accent color. No gradients, no glass, no terminal cosplay.

### Accessibility
- Ink on Signal Yellow ≈ 15:1 — the primary action pair.
- Soft White on Ink ≈ 18:1 — control-surface reading pair.
- Ink on Warm Ivory ≈ 14:1 — default reading pair.
- Muted Ink on Ivory ≈ 4.6:1 — secondary text only, never for anything a
  user must not miss.
- Never encode PASS/REFUSED by color alone: word + color, minimum 11px.
- All motion respects `prefers-reduced-motion`: animation off, states static.

## Typography

### Editorial voice vs system voice
Two registers, never mixed:
- **Editorial** (Inter Tight 800, tight tracking): headlines, signal
  numerals, statements. 64–96px heroes on desktop, 40px on mobile.
  Major values ($500, 20%, $100) set at 72–120px desktop / 56px mobile.
- **System** (mono labels, 11px, uppercase, tracked): `CAPITAL_001`,
  `EVENT_01`, `NVDA`, `BITGET_REALITY`, `LIVE`, `MANDATE_005`, `DRY_RUN`.
  Metadata, provenance, rail indexes, timestamps. Never body copy — this is
  not a terminal.

### Principles
- Numbers are visual objects: exposure, protection, verdicts get scale.
- Short declarative sentences for states; machine detail drops to mono meta.
- Tabular figures everywhere money or rates appear.
- One family (Inter Tight) for voice; one mono stack for labels. Nothing else.

## Layout

### Composition language
A deliberate mix, never identical rounded white cards for everything:
- Full-width fields (capital hero, event block).
- Editorial statements with room to breathe.
- Black control surfaces (gate, approval panel, data region).
- Yellow signal surfaces (active CTA band, event edge, rail marker).
- Structured hairline lists (mandate rows, receipt rows).
- Rails (decision rail, provenance strip).
- Selective cards where containment genuinely helps.

### Geometry
Sharper large surfaces welcome: 2px on fields and blocks, 6px on controls,
10px where a card is truly a card. Pills (`9999px`) are for state words
only — never decoration, never nav, never buttons.

### Grid and container
Max width `1280px`, centred. Desktop judge view first (1440px), laptop
second, 390px mobile third: stack composition vertically, keep the gate
core and the primary CTA dominant, shed secondary tiles before touching
type scale below minimums. Never sacrifice desktop impact to shrink
everything for mobile.

### Whitespace
Pages breathe. Hero fields get 64–96px of vertical room. Decision surfaces
stay calm: one proposal, one gate, one action per screen.

## Product primitives

### Tenax Decision Rail
The persistent flow indicator. Thin, technical, compact — never competing
with the headline:

```
01 EXPOSURE ━ 02 INTENT ━ 03 INTELLIGENCE ━ 04 MANDATE ━ 05 ACTION ━ 06 RECEIPT
```

- Active stage: Signal Yellow marker + Ink label.
- Completed: Ink, high contrast.
- Future: muted.
- Mono 11px, hairline connectors. One line on desktop; wraps quietly on
  mobile. Lightweight activation motion only (opacity), disabled under
  `prefers-reduced-motion`.

### Provenance strip
Compact source language, always truthful, never large chips:

- `● LIVE` — Bitget Reality public data.
- `○ DEMO` — simulated portfolio.
- `◇ DEV` — development analysis.
- `□ DRY` — no funds moved.

Full required truth is never hidden: LIVE BITGET DATA, SIMULATED
PORTFOLIO, DEVELOPMENT ANALYSIS, DRY_RUN EXECUTION. Unavailable data is
marked `○ OFFLINE` in clay with the reason beside it.

### Mandate Gate core (signature primitive)
The visual icon of Tenax: a dark ink control surface holding a large
geometric gate object illuminated in Signal Yellow. Oversized PASS /
REFUSED state word. Rules arranged with clear index numbers (01–06),
approval state visually separated from rule pass state. A financial
permission engine, not a checklist card. No sci-fi decoration; the glow
means "check running" and nothing else.

### State words
`PASS` (green) · `REFUSED` (clay) · `DRY RUN` (ink on yellow) ·
`AWAITING` (muted) · `LIVE` / `OFFLINE` markers. Always text + color.

### Approval control
The approval CTA is a Signal Yellow band with Ink text — the single most
energetic object on its screen. It states the exact authorization:
`APPROVE $100 PROTECTION`. Below it, the dry-run notice in plain words.
After approval, the execution control reads `CREATE EXECUTION PREVIEW`.

### Event block
Consequential, dark, consequential: `EVENT_01 / NVIDIA EARNINGS` with
`CAPITAL AT RISK $500`, `DATE UNVERIFIED`, `STATUS WATCHING` as labeled
rows. Never a fabricated date, never a countdown to an unknown.

## Components

### App shell
Ink header bar: strong `TENAX` wordmark with a yellow square mark;
Capital / Events / Mandate / Activity in semibold ivory; active route in
Signal Yellow; compact mono `DRY RUN` indicator outlined in yellow at the
right edge. Mobile: wordmark + DRY RUN persist; nav collapses to a menu.

### Capital hero
`CAPITAL_001` system label, editorial headline ("What should your capital
do?"), then the dominant object: `$500 / NVIDIA EXPOSURE` at signal scale
with `rNVDA · BITGET REALITY` and `LIVE MARKET · ONLINE` markers. A yellow
CTA band: `PROTECT THROUGH EARNINGS →`. Market data lives in a secondary
graphite signal region — distinctive, not an equal white card.

### Mandate control surface
`MANDATE_001` label, hairline rows (`MAX HEDGE 30%`, `MAX TRADE $150`,
`LEVERAGE OFF`, `APPROVAL REQUIRED`, `EXPOSURE NVDA`) with mono labels
left and strong values right. The authority sentence
("You're allowing up to…") sits central, not as a footnote.

### Check rows
Hairline-separated rows with mono index (`01`), line-art glyph, title,
rule detail, and state word. 6px radius. Approval-required renders as a
yellow-outlined `REQUIRED` marker, visually distinct from green PASS rows.

### Receipt
Editorial receipt header (id + timestamp in mono), hairline decision rows,
would-be request in a graphite code field, refused alternative in a flat
clay-edged block. Provenance strip closes the page.

## Motion (lightweight, purposeful, CSS only)
- Rail stage activation: quick opacity settle.
- Gate illumination: single soft yellow bloom on PASS.
- View entrance: short fade/slide on hero fields.
- Approval signal: CTA press feedback.
No animation library. All motion disabled under
`prefers-reduced-motion`; states remain fully legible static.

## Do's and Don'ts

### Do
- Lead with yellow where the decision lives; lead with ink where authority lives.
- Give numbers scale: exposure, protection, verdicts are visual objects.
- Keep provenance compact but complete — every required truth on every
  relevant screen.
- Let refusal sit flat and documented next to the gate it stopped at.
- Label demo, fixture, simulated, and dry-run states in plain words.
- Preserve the gate core first on small screens.

### Don't
- Don't use blue as a brand color in new surfaces.
- Don't put everything in identical rounded white cards.
- Don't use pills for decoration — state words only.
- Don't let color speak alone for any state.
- Don't glow refusals, errors, or marketing claims yellow.
- Don't fabricate dates, prices, fills, order IDs, or hashes — ever.
- Don't make it look like a terminal: mono is for labels, never body copy.
- Don't add heavy animation libraries for this system.
