// Tenax display formatting — presentation only, never canonical truth.
//
// These helpers shape provider/domain strings for rendering. Raw values
// stay untouched upstream; unparseable input passes through (or renders
// an em dash for null) so no information is destroyed by formatting.

/** Parse a decimal string strictly; null when absent or non-numeric. */
function parseDecimal(raw: string | null): number | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/**
 * Fixed-decimal price display (2dp default). Null → "—"; non-numeric
 * strings pass through untouched.
 */
export function formatPrice(raw: string | null, decimals = 2): string {
  if (raw === null) return "—";
  const n = parseDecimal(raw);
  if (n === null) return raw.trim();
  return n.toFixed(decimals);
}

/**
 * Rate display (funding, multipliers): provider precision preserved
 * as-is; null → "—". Rates are small and exact — never rounded here.
 */
export function formatRate(raw: string | null): string {
  if (raw === null) return "—";
  const trimmed = raw.trim();
  return trimmed === "" ? "—" : trimmed;
}

/**
 * Signed PnL display: +$0.12 / -$0.44 at 2dp, widening to 4dp for dust
 * magnitudes (|v| < 0.01) so small values stay visible. Null → "—".
 */
export function formatSignedPnl(raw: string | null): string {
  const n = parseDecimal(raw);
  if (n === null) return raw === null ? "—" : raw.trim();
  if (n === 0) return "+$0.00";
  const decimals = Math.abs(n) < 0.01 ? 4 : 2;
  const sign = n > 0 ? "+" : "-";
  return `${sign}$${Math.abs(n).toFixed(decimals)}`;
}

/**
 * Multiplier display (rebase factors near 1): six decimals with trailing
 * zeros trimmed, so 1.001701196801074 reads 1.001701. Null → "—".
 */
export function formatMultiplier(raw: number | string | null): string {
  if (raw === null) return "—";
  const n = typeof raw === "string" ? Number(raw.trim()) : raw;
  if (!Number.isFinite(n)) return "—";
  return String(parseFloat(n.toFixed(6)));
}

/** True when a formatted PnL string represents a gain (for tone). */
export function isPnlGain(formatted: string): boolean {
  return formatted.startsWith("+");
}
