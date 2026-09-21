// Tenax Phase 3B-A — safe one-off xStocks NVDAx READ-ONLY discovery check.
//
// Safety contract (do not weaken without owner approval):
// - Read-only discovery. Exactly five requests, all GET, via the shared
//   adapter (src/lib/xstocks/public.ts), which enforces the allowlist:
//   1. GET /public/assets/NVDAx (asset metadata + deployments)
//   2. GET /public/assets/NVDAx/price-data (indicative quote)
//   3. GET /public/assets/NVDAx/multiplier?network=Solana (multiplier)
//   4. GET /public/system/status/NVDAx (halt status)
//   5. GET /public/oracles/NVDAx (oracle refs, Solana filtered)
// - No API key, no auth headers, no signatures. The public surface needs
//   none; this script sends none.
// - No buy, sell, mint, redeem, bridge, sign, or transaction submission.
//   No order, no fund movement, nothing modified.
// - Only normalized facts are printed — never raw response bodies.
// - The Solana mint address is printed EXACTLY as the official API
//   returns it, or UNAVAILABLE when the API omits it. A community address
//   is never substituted (that would report PARTIAL, never a fake PASS).
// - NVDAx is reported as an AVAILABLE external representation, never as
//   a user holding and never as execution authority.
// - Shutdown: sets process.exitCode and lets the event loop drain. Never
//   force-exits while fetch handles may still be closing
//   (a forced exit trips a Windows/Node UV closing-handle assertion).
//
// Run (from repo root, never commits, never in CI):
//   node scripts/verify-xstocks-nvdax.ts
// No configuration required. Exit codes: 0 = discovery PASS,
// 1 = discovery PARTIAL, 2 = discovery FAIL.

import {
  SOLANA_TOKEN_STANDARD_DOC,
  XSTOCKS_NVDAX_SYMBOL,
  XSTOCKS_SOLANA_NETWORK,
  createDefaultXstocksClient,
  fetchNvdaxDiscovery,
  toAvailableRepresentation,
} from "../src/lib/xstocks/public.ts";

const METHOD = "GET";
const UNAVAILABLE = "UNAVAILABLE";

async function main(): Promise<number> {
  const discovery = await fetchNvdaxDiscovery(createDefaultXstocksClient(), {
    symbol: XSTOCKS_NVDAX_SYMBOL,
    network: XSTOCKS_SOLANA_NETWORK,
  });

  const address = discovery.solana?.address ?? null;
  const available = toAvailableRepresentation(discovery);
  const halted =
    discovery.asset?.isTradingHalted === true ||
    discovery.asset?.tradingHalted === true ||
    discovery.systemStatus?.isMarketTradingHalted === true;

  const lines = [
    `provider: xStocks`,
    `method: ${METHOD}-only (no key, no signature)`,
    `subject: NVIDIA / NVDA`,
    `symbol: ${discovery.symbol}`,
    `network: ${discovery.network}`,
    `tokenAddress: ${address ?? UNAVAILABLE}`,
    `tokenStandard: ${SOLANA_TOKEN_STANDARD_DOC.standard} + ${SOLANA_TOKEN_STANDARD_DOC.extension} (${SOLANA_TOKEN_STANDARD_DOC.source})`,
    `price: ${discovery.price ? String(discovery.price.quote) : UNAVAILABLE}`,
    `multiplier: ${discovery.multiplier?.currentMultiplier ?? UNAVAILABLE}`,
    `pendingMultiplier: ${discovery.multiplier?.newMultiplier ?? UNAVAILABLE}`,
    `tradingStatus: ${discovery.asset === null && discovery.systemStatus === null ? UNAVAILABLE : halted ? "HALTED" : "NOT_HALTED"}`,
    `atomicHalted: ${discovery.systemStatus?.isAtomicTradingHalted ?? UNAVAILABLE}`,
    `solanaOracles: ${discovery.oracles.length === 0 ? "(none)" : discovery.oracles.map((o) => `${o.managedBy ?? "unknown"}:${o.reference ?? "unref"}`).join(", ")}`,
    `identityMapping: ${discovery.identity.mapping} (${discovery.identity.detail})`,
    `availableRepresentation: ${available ? `${available.role} · ${available.note}` : "NOT_PROVEN"}`,
    `failedEndpoints: ${discovery.failedEndpoints.length === 0 ? "(none)" : discovery.failedEndpoints.join(", ")}`,
    `overallDiscovery: ${discovery.overall}`,
  ];
  for (const line of lines) {
    console.log(line);
  }
  return discovery.overall === "PASS" ? 0 : discovery.overall === "PARTIAL" ? 1 : 2;
}

const code = await main();
// Natural event-loop shutdown: never force-exit while fetch handles drain
// (a forced exit trips a Windows libuv closing-handle assertion).
process.exitCode = code;
