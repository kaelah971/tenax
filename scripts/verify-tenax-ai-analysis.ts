// Tenax Phase 4B-A — safe one-off AI analysis verification (READ-ONLY).
//
// Safety contract (do not weaken without owner approval):
// - Read-only evidence gathering: public Bitget snapshot/ticker/candles
//   and public xStocks discovery. No authenticated endpoints, no writes.
// - Exactly ONE real model request via the AI pipeline. The pipeline
//   validates output, derives a proposal deterministically, and runs a
//   mandate preview ONLY. This script NEVER approves, NEVER executes,
//   NEVER places a Demo order, and imports no execution path.
// - Credentials: OPENAI_API_KEY is read from process env with .env.local
//   as fallback (owner sets it manually; this script never writes it).
//   The key is never printed, logged, or embedded in output. Only
//   sanitized facts are printed — never request headers or raw bodies.
// - Shutdown: sets process.exitCode and lets the event loop drain. Never
//   force-exits while fetch handles may still be closing
//   (a forced exit trips a Windows/Node UV closing-handle assertion).
//
// Run (from repo root, never commits, never in CI):
//   node scripts/verify-tenax-ai-analysis.ts
// Exit codes: 0 = valid analysis (overall PASS, incl. WAIT/NO_ACTION),
// 1 = provider/invalid failure (overall FAIL), 2 = missing AI config.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createDefaultPublicClient, fetchRealityBundle } from "../src/lib/bitget/reality.ts";
import { BITGET_BASE_URL } from "../src/lib/bitget/reality.ts";
import { fetchNvdaCandles, fetchNvdaFuturesTicker } from "../src/lib/bitget/market-series.ts";
import { normalizeNvdaInstrument } from "../src/lib/bitget/nvda-hedge.ts";
import { normalizeNvidiaSnapshot } from "../src/lib/intelligence/snapshot.ts";
import { MANDATE_FIXTURE, NVDA_EXPOSURE_FIXTURE } from "../src/lib/tenax/fixtures.ts";
import { createProtectEventRiskIntent } from "../src/lib/tenax/intent.ts";
import { resolveAiConfig } from "../src/lib/ai/provider.ts";
import { runAiAnalysis } from "../src/lib/ai/pipeline.ts";
import {
  createDefaultXstocksClient,
  fetchNvdaxDiscovery,
} from "../src/lib/xstocks/public.ts";

const RAW_TEXT = "Protect my NVIDIA through earnings, but don't hedge more than 30%.";

function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const withoutExport = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const eq = withoutExport.indexOf("=");
    if (eq <= 0) continue;
    const key = withoutExport.slice(0, eq).trim();
    let value = withoutExport.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    if (key !== "") out[key] = value;
  }
  return out;
}

/** process.env wins; .env.local (repo root) is the fallback. Keys only — never echoed. */
function loadEnv(): Record<string, string | undefined> {
  let fileEnv: Record<string, string> = {};
  try {
    fileEnv = parseEnvFile(readFileSync(resolve(process.cwd(), ".env.local"), "utf8"));
  } catch {
    fileEnv = {};
  }
  const get = (key: string): string | undefined => process.env[key] ?? fileEnv[key];
  return {
    TENAX_AI_PROVIDER: get("TENAX_AI_PROVIDER"),
    TENAX_AI_MODEL: get("TENAX_AI_MODEL"),
    OPENAI_API_KEY: get("OPENAI_API_KEY"),
    GROQ_API_KEY: get("GROQ_API_KEY"),
  };
}

async function main(): Promise<number> {
  const env = loadEnv();
  const config = resolveAiConfig(env);
  if (!config) {
    console.log("overall: FAIL");
    console.log("reason: AI_UNAVAILABLE (TENAX_AI_PROVIDER + TENAX_AI_MODEL + provider key)");
    return 2;
  }

  // 1-2. Gather read-only evidence + construct the pack (inside the pipeline).
  const snapshot = normalizeNvidiaSnapshot(
    await fetchRealityBundle(createDefaultPublicClient(), { gapMs: 300 }),
  );
  const [ticker, candles, nvdax, instrument] = await Promise.all([
    fetchNvdaFuturesTicker().catch(() => null),
    fetchNvdaCandles(undefined, "5m").catch(() => null).then((s) => s?.candles ?? null),
    fetchNvdaxDiscovery(createDefaultXstocksClient(8000), { gapMs: 300 }).catch(() => null),
    createDefaultPublicClient(8000)
      .getJson(`${BITGET_BASE_URL}/api/v3/market/instruments?category=USDT-FUTURES&symbol=NVDAUSDT`)
      .then((r) => (r.httpStatus === 200 ? normalizeNvdaInstrument(r.body) : null))
      .catch(() => null),
  ]);
  const intent = createProtectEventRiskIntent(NVDA_EXPOSURE_FIXTURE, RAW_TEXT);

  // 3-6. ONE model request, validate, derive, mandate-preview. No approve/execute.
  const result = await runAiAnalysis({
    exposure: NVDA_EXPOSURE_FIXTURE,
    intent,
    mandate: MANDATE_FIXTURE,
    snapshot,
    market: { futuresTicker: ticker?.ticker ?? null, candles, nvdax, instrument },
    config,
  });
  if (!result.ok) {
    console.log(`overall: FAIL`);
    console.log(`reason: ${result.failure.code} (${result.failure.reason})`);
    console.log(`evidencePackHash: ${result.packHash}`);
    return 1;
  }

  const derivedNotional =
    result.proposal === null ? "NONE" : String(result.proposal.proposedTradeValueUsdt);
  const mandateVerdict = result.mandateDecision === null ? "NOT_EVALUATED" : result.mandateDecision.verdict;
  console.log(`provider: ${result.analysis.provider}`);
  console.log(`model: ${result.analysis.model}`);
  console.log(`subject: ${result.analysis.subjectId}`);
  console.log(`decision: ${result.analysis.decision}`);
  console.log(`recommendedProtectionPct: ${result.analysis.recommendedProtectionPct ?? "NONE"}`);
  console.log(`derivedNotional: ${derivedNotional}`);
  console.log(`mandateVerdict: ${mandateVerdict}`);
  console.log(`keyDrivers: ${result.analysis.keyDrivers.join(" · ") || "(none)"}`);
  console.log(`risks: ${result.analysis.risks.join(" · ") || "(none)"}`);
  console.log(`missingEvidence: ${result.analysis.missingEvidence.join(" · ") || "(none)"}`);
  console.log(`instrument: ${instrument ? `ONLINE (${instrument.symbol})` : "UNAVAILABLE"}`);
  console.log(`evidencePackHash: ${result.packHash}`);
  console.log(`outputHash: ${result.outputHash}`);
  console.log(`overall: PASS`);
  return 0;
}

const code = await main();
// Natural event-loop shutdown: never force-exit while fetch handles drain
// (a forced exit trips a Windows libuv closing-handle assertion).
process.exitCode = code;
