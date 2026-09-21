// Tenax Phase 4B-A — deterministic AI evidence pack (pure, no network).
//
// The pack is the ONLY thing the model ever sees: canonical Tenax state,
// sanitized and source-tagged. It contains no credentials, no auth headers,
// no raw env, no unnecessary raw payloads, and never the old fixture
// answer (no 20% / $100 anywhere in this module).
//
// Grounding rules enforced structurally:
// - publicationDeadline is carried VERBATIM with isDateContext:false and an
//   explicit never-infer-a-date marker. There is NO earningsDate field.
// - NVDAx carries owned:false. Availability is not ownership.
// - Every group carries {source, provenance} identifiers.

import { createHash } from "node:crypto";

import type { Exposure, ProtectionIntent } from "../tenax/domain.ts";
import type { NvidiaMarketSnapshot } from "../intelligence/snapshot.ts";
import type { FuturesTicker, OhlcCandle } from "../bitget/market-series.ts";
import type { NvdaInstrument } from "../bitget/nvda-hedge.ts";
import type { NvdaxDiscovery } from "../xstocks/public.ts";

export type EvidenceProvenance = "REAL" | "SIMULATED" | "DEMO" | "DEV" | "UNAVAILABLE";

export interface EvidenceMeta {
  readonly source: string;
  readonly provenance: EvidenceProvenance;
}

export interface EvidenceSubject {
  readonly subjectId: "NVDA";
  readonly name: "NVIDIA";
  readonly meta: EvidenceMeta;
}

export interface EvidenceExposure {
  readonly valueUsd: number;
  readonly representation: string;
  readonly provenance: "SIMULATED";
  readonly liveOwnership: false;
  readonly meta: EvidenceMeta;
}

export interface EvidenceIntent {
  readonly type: string;
  readonly eventType: string | null;
  /**
   * Non-numerical user-intent guidance: what the user wants, never what
   * is permitted. Contains no ceilings, thresholds, or approval rules —
   * those live only in the deterministic mandate, which the model never sees.
   */
  readonly guidance: string;
  /** Always null in Phase 4B-A: no independently verified earnings date exists. */
  readonly earningsDate: null;
  readonly earningsDateStatus: string;
  /** Verbatim provider value (usually null). NEVER to be read as an event date. */
  readonly publicationDeadline: unknown;
  readonly meta: EvidenceMeta;
}

export interface EvidenceCandleSummary {
  readonly count: number;
  readonly firstClose: number | null;
  readonly lastClose: number | null;
  readonly windowHigh: number | null;
  readonly windowLow: number | null;
}

export interface EvidenceLiveMarket {
  readonly venue: "Bitget";
  readonly instrument: "NVDAUSDT";
  readonly last: string | null;
  readonly mark: string | null;
  readonly index: string | null;
  readonly change24h: string | null;
  readonly high24h: string | null;
  readonly low24h: string | null;
  readonly funding: string | null;
  readonly bid: string | null;
  readonly ask: string | null;
  readonly candleSummary: EvidenceCandleSummary | null;
  readonly meta: EvidenceMeta;
}

export interface EvidenceRepresentations {
  readonly rnvda: {
    readonly symbol: string;
    readonly venue: string;
    readonly status: string | null;
    readonly isReality: boolean | null;
    readonly tradingPeriods: readonly string[];
    readonly meta: EvidenceMeta;
  };
  readonly nvdaX: {
    readonly symbol: string;
    readonly network: string;
    readonly address: string | null;
    readonly price: number | null;
    readonly halted: boolean | null;
    readonly owned: false;
    readonly meta: EvidenceMeta;
  } | null;
}

export interface AiEvidencePack {
  readonly version: 1;
  readonly subject: EvidenceSubject;
  readonly exposure: EvidenceExposure;
  readonly intent: EvidenceIntent;
  readonly liveMarket: EvidenceLiveMarket;
  readonly representations: EvidenceRepresentations;
  readonly protectionInstrument: EvidenceProtectionInstrument | null;
}

/**
 * Verified NVDAUSDT hedge-instrument facts: what exists, not what is
 * permitted. No mandate ceilings, no approval rules, no notion of
 * ownership — quantity and holdings are absent by design. Venue leverage
 * bounds are deliberately excluded (authority-adjacent, not needed for
 * instrument identification). Liquidity is never scored: only raw
 * bid/ask/open-interest/ticker-activity facts are carried, and gaps stay
 * null for the model to interpret cautiously.
 */
export interface EvidenceProtectionInstrument {
  readonly symbol: "NVDAUSDT";
  readonly category: string | null;
  readonly subjectId: "NVDA";
  readonly status: string | null;
  readonly quoteAsset: string | null;
  readonly minOrderQty: number | null;
  readonly minOrderAmount: number | null;
  readonly quantityPrecision: number | null;
  readonly pricePrecision: number | null;
  readonly tickerAvailable: boolean;
  readonly candlesAvailable: boolean;
  readonly bid: string | null;
  readonly ask: string | null;
  /** Deterministic ask-minus-bid when both finite and uncrossed, else null. */
  readonly spread: number | null;
  readonly openInterest: string | null;
  readonly funding: string | null;
  readonly demoCapability: {
    readonly venue: "Bitget Demo";
    readonly action: "SHORT NVDAUSDT hedge via guarded executor";
    readonly requires: readonly string[];
    readonly accountState: "UNKNOWN — not probed in this evidence";
  };
  readonly meta: EvidenceMeta;
}

export interface BuildEvidencePackInput {
  readonly exposure: Exposure;
  readonly intent: ProtectionIntent;
  readonly snapshot: NvidiaMarketSnapshot;
  readonly futuresTicker: FuturesTicker | null;
  readonly candles: readonly OhlcCandle[] | null;
  /** Verified xStocks discovery; null when unavailable (leaf stays null). */
  readonly nvdax: NvdaxDiscovery | null;
  /** Normalized NVDAUSDT instrument rules; null when unverified. */
  readonly instrument: NvdaInstrument | null;
}

/**
 * Deterministic recent-candle summary computed by code (counts, closes,
 * window range). No interpretation, no trend claims.
 */
export function summarizeCandles(
  candles: readonly OhlcCandle[] | null,
): EvidenceCandleSummary | null {
  if (!candles || candles.length === 0) return null;
  const closes = candles.map((c) => c.c);
  const highs = candles.map((c) => c.h);
  const lows = candles.map((c) => c.l);
  return {
    count: candles.length,
    firstClose: closes[0] ?? null,
    lastClose: closes[closes.length - 1] ?? null,
    windowHigh: Math.max(...highs),
    windowLow: Math.min(...lows),
  };
}

/** Deterministic ask-minus-bid spread. Null unless both finite and uncrossed. */
export function deriveSpread(bid: string | null, ask: string | null): number | null {
  if (bid === null || ask === null) return null;
  const b = Number(bid.trim());
  const a = Number(ask.trim());
  if (!Number.isFinite(b) || !Number.isFinite(a) || a < b) return null;
  return parseFloat((a - b).toFixed(6));
}

const REAL_BITGET: EvidenceMeta = { source: "bitget:public", provenance: "REAL" };

export function buildEvidencePack(input: BuildEvidencePackInput): AiEvidencePack {
  const { exposure, intent, snapshot } = input;
  const ticker = snapshot.ticker.data;
  const instrument = snapshot.instrument.data;
  const trading = snapshot.trading.data;
  const earnings = snapshot.earningsForecast.data;

  return {
    version: 1,
    subject: {
      subjectId: "NVDA",
      name: "NVIDIA",
      meta: { source: "tenax:domain", provenance: "DEV" },
    },
    exposure: {
      valueUsd: exposure.exposureValueUsdt,
      representation: exposure.representation.baseCoin,
      provenance: "SIMULATED",
      liveOwnership: false,
      meta: { source: "tenax:fixture", provenance: "SIMULATED" },
    },
    intent: {
      type: intent.type,
      eventType: intent.type === "PROTECT_EVENT_RISK" ? "EARNINGS" : null,
      guidance:
        "Preserve the underlying exposure; protection is preferred over selling spot.",
      earningsDate: null,
      earningsDateStatus:
        "UNVERIFIED — no independently verified earnings date exists; never infer one from publicationDeadline",
      publicationDeadline: earnings?.publicationDeadline ?? null,
      meta: { source: "tenax:intent", provenance: "DEV" },
    },
    liveMarket: {
      venue: "Bitget",
      instrument: "NVDAUSDT",
      last: input.futuresTicker?.lastPrice ?? ticker?.lastPrice ?? null,
      mark: input.futuresTicker?.markPrice ?? null,
      index: input.futuresTicker?.indexPrice ?? null,
      change24h: input.futuresTicker?.change24h ?? ticker?.priceChangePct24h ?? null,
      high24h: input.futuresTicker?.high24h ?? ticker?.highPrice24h ?? null,
      low24h: input.futuresTicker?.low24h ?? ticker?.lowPrice24h ?? null,
      funding: input.futuresTicker?.fundingRate ?? null,
      bid: input.futuresTicker?.bidPrice ?? ticker?.bidPrice ?? null,
      ask: input.futuresTicker?.askPrice ?? ticker?.askPrice ?? null,
      candleSummary: summarizeCandles(input.candles),
      meta: REAL_BITGET,
    },
    representations: {
      rnvda: {
        symbol: instrument ? exposure.representation.symbol : exposure.representation.symbol,
        venue: exposure.representation.venue,
        status: instrument?.status ?? null,
        isReality: instrument?.isReality ?? null,
        tradingPeriods: trading?.tradingPeriods ?? [],
        meta: REAL_BITGET,
      },
      nvdaX:
        input.nvdax && input.nvdax.identity.mapping === "PASS" && input.nvdax.solana?.address
          ? {
              symbol: input.nvdax.symbol,
              network: input.nvdax.network,
              address: input.nvdax.solana.address,
              price: input.nvdax.price?.quote ?? null,
              halted:
                input.nvdax.asset?.isTradingHalted ??
                input.nvdax.systemStatus?.isMarketTradingHalted ??
                null,
              owned: false as const,
              meta: { source: "xstocks:public", provenance: "REAL" as const },
            }
          : null,
    },
    protectionInstrument: buildProtectionInstrument(
      input.instrument,
      input.futuresTicker,
      input.candles,
    ),
  };
}

function buildProtectionInstrument(
  instrument: NvdaInstrument | null,
  ticker: FuturesTicker | null,
  candles: readonly OhlcCandle[] | null,
): EvidenceProtectionInstrument | null {
  if (!instrument && !ticker && (!candles || candles.length === 0)) return null;
  const bid = ticker?.bidPrice ?? null;
  const ask = ticker?.askPrice ?? null;
  return {
    symbol: "NVDAUSDT",
    category: instrument?.category ?? null,
    subjectId: "NVDA",
    status: instrument?.status ?? null,
    quoteAsset: instrument?.quoteCoin ?? null,
    minOrderQty: instrument?.minOrderQty ?? null,
    minOrderAmount: instrument?.minOrderAmount ?? null,
    quantityPrecision: instrument?.quantityPrecision ?? null,
    pricePrecision: instrument?.pricePrecision ?? null,
    tickerAvailable: ticker !== null,
    candlesAvailable: !!candles && candles.length > 0,
    bid,
    ask,
    spread: deriveSpread(bid, ask),
    openInterest: ticker?.openInterest ?? null,
    funding: ticker?.fundingRate ?? null,
    demoCapability: {
      venue: "Bitget Demo",
      action: "SHORT NVDAUSDT hedge via guarded executor",
      requires: ["mandate PASS", "human approval"],
      accountState: "UNKNOWN — not probed in this evidence",
    },
    meta: REAL_BITGET,
  };
}

/** Stable serialization: recursive key sorting, no whitespace variance. */
export function serializeEvidencePack(pack: AiEvidencePack): string {
  return JSON.stringify(sortKeys(pack as unknown));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/** SHA-256 hex over the stable serialization. */
export function hashEvidencePack(serialized: string): string {
  return createHash("sha256").update(serialized, "utf8").digest("hex");
}

export function hashValue(serialized: string): string {
  return createHash("sha256").update(serialized, "utf8").digest("hex");
}
