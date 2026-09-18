---
version: alpha
name: Tenax
description: "Warm, calm protection for tokenized equity exposure — one gate, one blue, soft light, honest states."
colors:
  cream: "#EFE8DC"
  ink: "#1A1A1A"
  muted: "#656565"
  white: "#FFFFFF"
  primary: "#4E80E8"
  primaryDeep: "#3E6DD6"
  primaryPressed: "#3560C4"
  badgeFill: "#DCE6F2"
  secondaryHover: "#F7F3EA"
  secondaryBorder: "#D8D2C4"
  passGreen: "#1F7A4D"
  refuseClay: "#B1442E"
  cautionAmber: "#966D12"
typography:
  display-1:
    fontFamily: "Inter Tight, General Sans, Inter, sans-serif"
    fontSize: 46px
    fontWeight: 700
    lineHeight: 50px
    letterSpacing: "-1px"
  display-1-mobile:
    fontFamily: "Inter Tight, General Sans, Inter, sans-serif"
    fontSize: 30px
    fontWeight: 700
    lineHeight: 34px
    letterSpacing: "-0.5px"
  body-large:
    fontFamily: "Inter Tight, General Sans, Inter, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
  nav:
    fontFamily: "Inter Tight, General Sans, Inter, sans-serif"
    fontSize: 15px
    fontWeight: 400
    lineHeight: 20px
  button:
    fontFamily: "Inter Tight, General Sans, Inter, sans-serif"
    fontSize: 15px
    fontWeight: 600
    lineHeight: 20px
  input:
    fontFamily: "Inter Tight, General Sans, Inter, sans-serif"
    fontSize: 15px
    fontWeight: 400
    lineHeight: 20px
  badge:
    fontFamily: "Inter Tight, General Sans, Inter, sans-serif"
    fontSize: 13px
    fontWeight: 500
    lineHeight: 18px
  card-title:
    fontFamily: "Inter Tight, General Sans, Inter, sans-serif"
    fontSize: 13px
    fontWeight: 600
    lineHeight: 18px
  card-meta:
    fontFamily: "Inter Tight, General Sans, Inter, sans-serif"
    fontSize: 11px
    fontWeight: 400
    lineHeight: 14px
  core-label:
    fontFamily: "Inter Tight, General Sans, Inter, sans-serif"
    fontSize: 12px
    fontWeight: 600
    lineHeight: 16px
rounded:
  xs: 10px
  card: 14px
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
components:
  surface-page:
    backgroundColor: "{colors.cream}"
    textColor: "{colors.ink}"
    typography: "{typography.body-large}"
  button-primary:
    backgroundColor: "{colors.primaryDeep}"
    textColor: "{colors.white}"
    typography: "{typography.button}"
    rounded: "{rounded.xs}"
    padding: "14px 24px"
    height: 48px
  button-primary-hover:
    backgroundColor: "{colors.primaryPressed}"
    textColor: "{colors.white}"
    typography: "{typography.button}"
    rounded: "{rounded.xs}"
    padding: "14px 24px"
    height: 48px
  button-secondary:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.xs}"
    padding: "14px 24px"
    height: 48px
  button-secondary-hover:
    backgroundColor: "{colors.secondaryHover}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.xs}"
    padding: "14px 24px"
    height: 48px
  badge:
    backgroundColor: "{colors.badgeFill}"
    textColor: "{colors.ink}"
    typography: "{typography.badge}"
    rounded: "{rounded.pill}"
    padding: "8px 12px"
  meta-label:
    backgroundColor: "{colors.white}"
    textColor: "{colors.muted}"
    typography: "{typography.card-meta}"
  check-tile:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    typography: "{typography.core-label}"
    rounded: "{rounded.xs}"
    size: 48px
  check-card:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    typography: "{typography.card-title}"
    rounded: "{rounded.card}"
    padding: "12px 16px"
  receipt-card:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    typography: "{typography.card-title}"
    rounded: "{rounded.card}"
    padding: "16px 20px"
  input:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    typography: "{typography.input}"
    rounded: "{rounded.xs}"
    padding: "0px 16px"
    height: 48px
  input-focus:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    typography: "{typography.input}"
    rounded: "{rounded.xs}"
    padding: "0px 16px"
    height: 48px
  gate-pass:
    backgroundColor: "{colors.passGreen}"
    textColor: "{colors.white}"
    typography: "{typography.badge}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  gate-refuse:
    backgroundColor: "{colors.refuseClay}"
    textColor: "{colors.white}"
    typography: "{typography.badge}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  tag-dryrun:
    backgroundColor: "{colors.cautionAmber}"
    textColor: "{colors.white}"
    typography: "{typography.badge}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
---

# Tenax Design System

## Overview

Tenax uses a **calm, instrument-like** visual system: a warm cream field, one confident blue, soft blurred light instead of hard edges, and an isometric diagram that shows the product's actual behaviour — a proposal travelling toward a gate that can pass it, stop it, or refuse it.

The substrate is retained from the supplied reference system: the warm cream base (never clinical white), a single blue accent, one type family differentiated only by weight, white cards lifted by soft shadows instead of borders, and an isometric hero device whose contents scale down with distance to create real depth. The meaning is rebuilt for Tenax: where the reference visualizes an assistant orchestrating many tools, this system visualizes **one mandate guarding one position** — the same compositional grammar (a glowing central module, two diagonal paths, floating data-dense cards) rebuilt around authorization.

### Why this substrate fits Tenax
Protection must feel like an instrument, not an alarm. The cream base keeps a technical, diagram-heavy product human and unpanicked. The single blue keeps attention on the only thing that matters — the state of the gate. Soft, blurred light reads as *gentle vigilance* rather than hard warning, and the isometric paths give the product's core chain (Exposure → Intent → Intelligence → Mandate → Action or Refusal → Receipt) a literal, memorable picture.

### Preserve / replace / reinterpret audit

| Layer | Preserve from the supplied reference | Tenax translation |
|---|---|---|
| Preserve | Cream base `#EFE8DC`, single blue family, Ink `#1A1A1A`, one-family typography, white cards with soft blurred shadows and no borders, radii (10px / 14px / pill), isometric depth with scale-by-distance | These carry over unchanged as the formal substrate. |
| Replace | Assistant/orchestration meaning, "core + tool tiles" copy, notification-card content, product labels | Replaced by the mandate gate, check tiles, check cards and decision receipts. |
| Reinterpret | Central glowing module, two diagonal paths, floating cards, glow rings | The glowing module becomes the **Mandate Gate**; the paths become **guarded paths** (one inbound: exposure, intent, event — two outbound: action and refusal); the floating cards become **check cards and receipt cards**; the glow becomes **the check running**. |

### The high-risk moment
The most important moment in the product is the **approval of an irreversible action** — and the gate that precedes it. The interface must make conditions legible before decoration: what is proposed, what it costs, which limits apply, whether approval is required, and what happened after. Nothing in this system may make a PASS, REFUSE, or `DRY RUN` state harder to read.

### Ownable territory: The Gate Diagram
**A calm diagram in which every proposal must pass through a glowing gate before it can become an action — and everything that passes, stops, or is refused ends in a receipt.**

The device has three parts:

1. **The Gate Core** — a glossy white module on a circular base, softly ringed by the brand blue; labelled `Mandate Gate / ENFORCED / deterministic`.
2. **The Guarded Paths** — one path flowing in (exposure, intent, event context), two outcomes flowing out: an **action path** continuing to a receipt, and a **refusal path** that stops cleanly with a recorded reason.
3. **The Floating Records** — check tiles (percentage, notional, leverage, approval, underlying) and receipt cards that shrink with distance from the core.

Use it in the landing hero, the mandate-gate screen, the receipt header, the demo video and the deck. It is a diagram with a job: it explains authorization in one look.

### Product rule
**Nothing glows except the check; nothing moves except toward the gate or to a stop; every path ends in writing.**

## Colors

| Token | Hex | Role |
|---|---|---|
| Cream | `#EFE8DC` | Page background. The base is always warm cream, never pure white. |
| Ink | `#1A1A1A` | Headlines and primary text. |
| Muted | `#656565` | Nav links, secondary body copy, metadata on white. |
| White | `#FFFFFF` | Cards, tiles, inputs, the gate core's surface. |
| Primary Blue | `#4E80E8` | The one accent: glow rings, path lines, logo mark, status bubble. Non-text only. |
| Primary Deep | `#3E6DD6` | CTA fill and interactive text. One step deeper than the signature blue so white text passes WCAG AA. |
| Primary Pressed | `#3560C4` | Hover/pressed fill for primary actions. |
| Badge Fill | `#DCE6F2` | Soft blue pill background for non-semantic badges. |
| Secondary Hover | `#F7F3EA` | Hover surface for the secondary button. |
| Secondary Border | `#D8D2C4` | 1px chrome for the secondary button and inputs. |
| Pass Green | `#1F7A4D` | `PASS` states only. |
| Refuse Clay | `#B1442E` | `REFUSED` / blocked states only. |
| Caution Amber | `#966D12` | `DRY RUN`, stale or pending labels only. |

### Semantic rules
- One accent, one job: blue means *the system is working on it* — glow, paths, the mark. It never means "success".
- State colours exist only as **labeled chips**: `PASS`, `REFUSED`, `DRY RUN`. A colour never speaks alone; the word always appears.
- Refusal never glows. A refused path ends flat, quiet and documented — dignity for the stop.
- Cream is the page; white is always a surface *on* the cream (card, tile, input). Never flood a page section with pure white.
- Do not introduce a second accent colour. The palette's restraint is the brand.

### Accessibility
Normative text pairs:

- Ink on Cream is ≈14.3:1 — the default reading pair.
- White on Primary Deep is ≈4.8:1 — CTA and pill fills.
- White on Pass Green / Refuse Clay / Caution Amber is ≈5.3:1 / 5.6:1 / 4.7:1 — state chips at small sizes.
- Muted on White is ≈5.8:1 and on Cream ≈4.8:1 — secondary text passes on both grounds; still prefer Ink for anything a user must not miss.

Keep focus states visible on cream and white surfaces (2px Primary Deep outline with a light halo). Never encode PASS/REFUSE by colour alone: icon + word + colour. All figures must remain readable at 11–13px card sizes; do not set essential data below 11px.

## Typography

### Font family
**One family: `Inter Tight`** (fallback: `General Sans`, `Inter`, sans-serif). Hierarchy comes from weight and size alone — there is no second display or accent face. The illustration carries the brand's visual personality; typography stays quiet, precise and legible.

### Hierarchy

| Role | Size | Weight | Line height | Tracking | Use |
|---|---:|---:|---:|---:|---|
| Display 1 | 46px | 700 | 50px | -1px | Landing hero headline, two lines. |
| Display 1 (mobile) | 30px | 700 | 34px | -0.5px | Hero on small viewports. |
| Body Large | 16px | 400 | 24px | 0 | Subheads, intros. |
| Nav | 15px | 400 | 20px | 0 | Header links — quiet, unbolded. |
| Button | 15px | 600 | 20px | 0 | CTA text. |
| Input | 15px | 400 | 20px | 0 | Intent input and form fields. |
| Badge | 13px | 500 | 18px | 0 | Pills, chips, status labels. |
| Card Title | 13px | 600 | 18px | 0 | Card headlines: check names, receipt rows. |
| Card Meta | 11px | 400 | 14px | 0 | Timestamps, IDs, secondary card detail. |
| Core Label | 12px | 600 | 16px | 0 | Gate core label stack; tile labels. |

### Principles
- Weight-differentiated hierarchy only — never introduce a second family.
- Negative tracking belongs to Display 1 alone.
- Card text stays small and data-dense (11–13px) so it reads as real product UI — check results, timestamps, values — not marketing copy.
- Nav text stays regular and unbolded so the header absorbs no attention.
- Use tabular figures for values, percentages and receipt amounts; numbers are never decorative.
- Receipts and gates favour short, complete sentences at Body Large; machine detail drops to Card Meta.

## Layout

### Spacing system
Base unit: **4px** — `4, 8, 16, 24, 32, 48, 64, 96, 128`.

- `4px` — icon-to-text micro gaps.
- `8px` — badge padding, chip rows.
- `16px` — card padding, nav gaps.
- `24px` — button padding, headline-to-body spacing.
- `32px` — body-to-CTA spacing.
- `48–64px` — nav padding, hero margins.
- `96px` — hero top padding.

### Grid and container
Max width `1280px`, centred. Landing hero is a two-column split: text ≈40%, Gate Diagram ≈60%, with the diagram free to bleed toward the right edge. Product screens follow the chain: **Exposure → Event → Gate → Receipt** — each screen names its step, and the gate sits between analysis and approval, never elsewhere.

### Whitespace philosophy
Tight in the text column, generous around the diagram. The hero stays efficient — badge, headline, subhead, two buttons — leaving the diagram room to be read. Inside the product, keep decision surfaces calm: one proposal, one gate, one action per screen.

### Radius scale
`9999px` — pills, chips, badges · `14px` — cards (check, receipt) · `10px` — buttons, inputs, tiles. Keep these three distinct; do not unify them.

## Elevation & Depth

| Level | Treatment | Tenax use |
|---|---|---|
| Flat | No shadow | Nav, body text, path bands. |
| Soft | `0 6–8px 14–20px rgba(0,0,0,0.08)` | Check cards, receipt cards, tiles, secondary button. |
| Colored Soft | `0 8px 20px rgba(78,128,232,0.25)` | Primary CTA only — shadow tinted to the brand blue. |
| Glow | Concentric radial rings, no hard edge, Primary Blue fading to transparent | The Mandate Gate core exclusively. |

**Shadow philosophy:** consistently soft and blurred — nothing in this system uses a hard offset or flat sticker shadow. The gate's glow is the same "gentle light" language at a larger scale. Refusal and error states keep the Soft level only; the glow belongs to the check, not the outcome.

## Shapes

### Shape language
- **The gate core** is the system's one sculptural object: a glossy white module with a soft top-rim highlight, sitting on a circular base, ringed by the glow.
- **Paths** are flat isometric bands in light blue; everything that rides them (tiles, cards) is rotated to match the path's diagonal angle — nothing on a path sits flat.
- **Tiles and cards scale down with distance** from the core; this is the depth system and it must be preserved in any composition.
- **Glyphs** are simple black line-art (percent, dollar, balance, sign-off, layers) inside white tiles.
- Avoid: hard-edged shadows, a second brand colour, unrotated isometric pieces, decorative display type, literal shields, robots, coins, candlesticks.

## Components

### Navigation
Transparent over cream. Logo mark + wordmark left; centred links in Muted at 15px/400; right side: plain-text `Log in` and a pill `Launch app` filled with Primary Deep. Padding `24px 40px`. Collapses to a hamburger below ~768px; logo and `Launch app` remain.

### Primary button
Fill Primary Deep, white text, `14px 24px` padding, `10px` radius, `48px` height, small ↗ suffix icon, Colored Soft shadow. Hover steps to Primary Pressed and slightly intensifies the shadow. One primary button per view. Labels: `Launch app`, `Connect Bitget Demo`, `Approve one action`.

### Secondary button
White fill, Ink text, `1px` Secondary Border, `14px 24px` padding, `10px` radius, `48px` height, filled play-circle icon left. Hover surface `#F7F3EA`. Labels: `See how it works`, `View the Decision Receipt`.

### Check tiles (isometric)
White, `10px` radius, `48–64px` (scaling down with distance), single line-art glyph, Soft shadow, rotated to the path angle. One tile per mandate check: **percentage limit, notional limit, leverage status, approval, allowed underlying**. The gate screen uses the same five glyphs in a vertical checklist — same icons, same order, flat instead of isometric.

### Check card / Receipt card
White cards, no borders, `14px` radius, Soft shadow, data-dense typography: small icon top-left, Card Title (e.g. "Notional check"), Card Meta beneath (timestamp / rule ID), status bubble bottom-right.

- **Check card** example: title `Notional`, meta `$102 of $125 limit`, bubble `PASS`.
- **Receipt card** example: title `Decision Receipt #0182`, meta `NVIDIA earnings · approved · Demo`, rows for exposure, proposal, mandate result, execution mode. Values use tabular figures; sentences stay complete.

### Mandate Gate core
The signature module: white glossy cylinder on a circular base; centred label stack in Core Label type (`Mandate Gate` / `ENFORCED` / `deterministic`); soft concentric blue rings radiating outward. The rings are the check running. The result is spoken by the chip beside it (`PASS` / `REFUSED`), never by the glow's hue.

### State chips
Pill chips, Badge type: `PASS` (Pass Green), `REFUSED` (Refuse Clay), `DRY RUN` (Caution Amber), `DEMO` (Primary Deep). Always text + colour; never alone. Chips appear next to the thing they describe — never in a legend far away.

### Execution mode tag
Persistent, unmissable: `DEMO` or `DRY RUN` chip pinned to the environment line on every execution-related screen. If the mode changes, the tag changes in the same glance.

### Intent input
White, `10px` radius, `48px` height, `0 16px` padding, `1px` Secondary Border; focus shifts the border to Primary. Placeholder: `Protect my NVIDIA through earnings — max 25%, max $125.` Helper text (Card Meta) states the current limits in plain words.

### Refusal state
A stopped path band, the failed rule named, a Refuse Clay chip, no glow, no primary CTA. The card reads like a complete sentence: `Refused — the hedge exceeded your $125 limit.` A `Review limits` secondary action is allowed; an `Approve` action is not.

### Empty & error states
Honest and quiet: `No monitored exposure yet — connect Bitget Demo.` / `Event data unavailable — Tenax will not propose actions on stale data.` Never fabricate values; never fill silence with decoration.

### Landing hero composition
Left: badge (`Bounded authority for tokenized equities`), Display 1 headline in two lines, Body Large subhead, primary + secondary buttons. Right: the Gate Diagram — core centred, inbound path lower-left with exposure/intent/event tiles, action path upper-right ending in a receipt card, refusal path ending in a short stop. Cards and tiles shrink with distance; the diagram may bleed off the right edge.

## Do's and Don'ts

### Do
- Keep every shadow soft and blurred — no hard or offset shadows anywhere.
- Reserve blue for system action (CTA, paths, glow, mark); reserve green, clay and amber strictly for labeled states.
- Scale tiles and cards down with distance from the core; rotation must match the path.
- Keep card text small and data-dense so cards read as real product UI.
- Use one type family, weight-differentiated; use tabular figures for all money and rates.
- Keep the warm cream base; surfaces are white only as cards, tiles and inputs.
- Keep the gate core's glow soft, wide and concentric — it signals an active check.
- Preserve the gate core first when the diagram must simplify on mobile; tiles and cards are secondary.
- Make the execution mode tag unmissable on every execution screen.
- Let refusal look dignified: stopped, labeled, documented — never alarmed.

### Don't
- Don't add a second accent colour or a second typeface.
- Don't let colour speak alone for PASS / REFUSED / DRY RUN — the word must be present.
- Don't put the glow behind refusals, errors or marketing claims; the glow means "check running", nothing else.
- Don't set headlines in a decorative face; the diagram carries the personality.
- Don't shrink the gate glow to a tight halo; the wide radial spread is the "alive system" cue.
- Don't rotate nothing: any element placed on a path stays flat only if it is off the path.
- Don't flood sections with pure white or let the design drift clinical.
- Don't use shields, robots, coins, candlesticks or generic AI gradients; the gate diagram is the brand object.
- Don't fake data inside demo cards; label demo and dry-run states honestly.

### Implementation checklist
- Load `Inter Tight` (fallback `General Sans`, `Inter`) and enable tabular numerals (`tnum`) globally.
- Build the gate core, guarded paths, check tiles and receipt card before any decorative polish.
- Wire the five mandate checks to the shared glyph set used in both isometric and flat layouts.
- Verify the CTA fill (`#3E6DD6`) and state chips against their text at 15px and 13px respectively.
- Test the diagram at 375px: core first, then one card per path, then fewer tiles.
- Confirm every irreversible action screen shows: proposal, limits, mode tag, and the one-action scope.
- Check reduced-motion: the check rings rest as static concentric rings with the chip visible.
