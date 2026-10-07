// Tenax — trusted NVIDIA event-evidence boundary (read-only).
//
// A genuinely trusted NVIDIA event signal (verified earnings date or
// relevant company event) needs a verified read-only source. Current
// tooling has none: no Bitget US-stock MCP client, no earnings-calendar
// adapter, no news adapter. Inventing an endpoint URL or a date would be
// fabrication, so this boundary honestly returns null (UNAVAILABLE) until
// a verified source is integrated. The AI pack carries nvidiaEvent null,
// the prompt treats null as timing-unknown, and the pipeline's
// no-fabricated-timing check keeps prose honest.

import type { TrustedNvidiaEvent } from "../ai/evidence-pack.ts";

/**
 * Fetch one trusted NVIDIA event, or null when no verified source is
 * configured. Pure boundary for now — no network, no writes, no dates.
 */
export async function fetchTrustedNvidiaEvent(): Promise<TrustedNvidiaEvent | null> {
  return null;
}
