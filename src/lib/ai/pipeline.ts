// Tenax Phase 4B-A — AI analysis pipeline (validation + proposal derivation).
//
// The model REASONS and PROPOSES a percentage. Everything else is
// deterministic Tenax authority:
// - proposal notional, instrument mapping, SHORT semantics, leverage,
//   mandate verdict, and execution eligibility are computed by code.
// - AI output above the mandate is PRESERVED, never clamped: a 40%
//   recommendation stays 40% and the Mandate Engine refuses it.
// - WAIT / NO_ACTION never yields an actionable proposal; the flow stops
//   before approval. Malformed output fails closed (AI_ANALYSIS_INVALID).

import { round2Usdt, type AnalysisReasoning } from "../tenax/analysis.ts";
import type {
  Exposure,
  Mandate,
  MandateDecision,
  ProtectionIntent,
  ProtectionProposal,
} from "../tenax/domain.ts";
import { evaluateMandate } from "../tenax/mandate.ts";
import type { NvidiaMarketSnapshot } from "../intelligence/snapshot.ts";
import type { FuturesTicker, OhlcCandle } from "../bitget/market-series.ts";
import type { NvdaInstrument } from "../bitget/nvda-hedge.ts";
import type { NvdaxDiscovery } from "../xstocks/public.ts";
import type {
  DemoAccountEvidence,
  TrustedNvidiaEvent,
} from "./evidence-pack.ts";
import {
  buildEvidencePack,
  hashEvidencePack,
  hashValue,
  serializeEvidencePack,
  type AiEvidencePack,
} from "./evidence-pack.ts";
import {
  aiModelPayloadSchema,
  aiProtectionAnalysisSchema,
  type AiAnalysisAudit,
  type AiDecision,
  type AiModelPayload,
  type AiProtectionAnalysis,
} from "./schemas.ts";
import {
  buildAiSystemPrompt,
  requestAiAnalysis,
  resolveAiConfig,
  type AiFailure,
  type AiFetchImpl,
  type AiProviderConfig,
} from "./provider.ts";

export interface AiPipelineMarket {
  readonly futuresTicker: FuturesTicker | null;
  readonly candles: readonly OhlcCandle[] | null;
  readonly nvdax: NvdaxDiscovery | null;
  readonly instrument: NvdaInstrument | null;
  /** Read-only Demo account context; omitted/null when not probed. */
  readonly demoAccount?: DemoAccountEvidence | null;
  /** Trusted event evidence; omitted/null until a verified source exists. */
  readonly nvidiaEvent?: TrustedNvidiaEvent | null;
}

export interface AiPipelineInput {
  readonly exposure: Exposure;
  readonly intent: ProtectionIntent;
  readonly mandate: Mandate;
  readonly snapshot: NvidiaMarketSnapshot;
  readonly market: AiPipelineMarket;
  /** Null config resolves to AI_UNAVAILABLE (never the fixture). */
  readonly config: AiProviderConfig | null;
  readonly fetchImpl?: AiFetchImpl;
  readonly nowMs?: number;
}

export interface AiPipelineSuccess {
  readonly ok: true;
  readonly pack: AiEvidencePack;
  readonly packHash: string;
  readonly analysis: AiProtectionAnalysis;
  readonly outputHash: string;
  /** Null unless decision is PROTECT. Never clamped, never an order body. */
  readonly proposal: ProtectionProposal | null;
  /** Null unless a proposal was derived (WAIT/NO_ACTION stop here). */
  readonly mandateDecision: MandateDecision | null;
  readonly reasoning: AnalysisReasoning;
  readonly audit: AiAnalysisAudit;
}

export interface AiPipelineFailure {
  readonly ok: false;
  readonly failure: AiFailure;
  readonly pack: AiEvidencePack;
  readonly packHash: string;
}

export type AiPipelineResult = AiPipelineSuccess | AiPipelineFailure;

/** Parse + strictly validate the model-authored semantic payload. */export function validateAiOutput(raw: string): AiModelPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("AI_ANALYSIS_INVALID: model output is not JSON");
  }
  const result = aiModelPayloadSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`AI_ANALYSIS_INVALID: ${result.error.issues[0]?.message ?? "schema mismatch"}`);
  }
  const payload = result.data;
  if (payload.decision === "PROTECT") {
    if (payload.recommendedProtectionPct === null || !Number.isFinite(payload.recommendedProtectionPct)) {
      throw new Error("AI_ANALYSIS_INVALID: PROTECT requires a finite pct");
    }
  } else if (payload.recommendedProtectionPct !== null) {
    throw new Error("AI_ANALYSIS_INVALID: WAIT/NO_ACTION requires pct null");
  }
  return payload;
}

/**
 * Semantic consistency check: when the evidence pack carries no verified
 * event date (always the case in Phase 4B-A), the model must not affirm
 * a scheduled earnings date or imminent earnings timing in its prose.
 * Scanned fields are rationale + drivers + risks (missingEvidence is the
 * designated place to note absence, so it is excluded). Negated or
 * unknown-framed sentences ("no verified date", "timing unknown") pass.
 * This checks honesty, never financial judgment: no pct bounds involved.
 */
const AFFIRMATIVE_DATE_CLAIM =
  /\bearnings\s+date\s+(is|of|on|:)\s*\S|\bverified\s+earnings\s+date\s+(is|:)\s*\S/i;
const FABRICATED_IMMINENCE =
  /\bearnings\s+(is\s+|are\s+)?(imminent|approaching|coming\s+(up|soon)|next\s+week|tomorrow|in\s+\d+\s+days?)\b/i;
const NEGATION_MARKER =
  /\b(no|not|n't|never|unverified|unknown|missing|without|null|none|lack(?:s|ing)?)\b/i;

export function assertNoFabricatedEventTiming(
  payload: Pick<AiModelPayload, "rationale" | "keyDrivers" | "risks">,
  earningsDate: unknown,
): void {
  if (earningsDate !== null && earningsDate !== undefined) return;
  const sentences = [...payload.keyDrivers, ...payload.risks, payload.rationale]
    .flatMap((text) => text.split(/[.!?;\n]+/));
  for (const sentence of sentences) {
    if (NEGATION_MARKER.test(sentence)) continue;
    if (AFFIRMATIVE_DATE_CLAIM.test(sentence) || FABRICATED_IMMINENCE.test(sentence)) {
      throw new Error(
        "AI_ANALYSIS_INVALID: model asserts event timing the evidence marks unverified",
      );
    }
  }
}

/**
 * Attach Tenax-owned audit metadata to a validated payload, producing
 * the final envelope. Provider/model come from resolved server config,
 * generatedAt from the server clock, evidencePackHash from the pack
 * Tenax hashed before the request. The envelope is re-validated
 * defensively; any failure here is a Tenax bug, surfaced as invalid.
 */
export function buildAnalysisEnvelope(
  payload: AiModelPayload,
  meta: {
    readonly provider: string;
    readonly model: string;
    readonly generatedAt: string;
    readonly evidencePackHash: string;
  },
): AiProtectionAnalysis {
  const result = aiProtectionAnalysisSchema.safeParse({
    ...payload,
    generatedAt: meta.generatedAt,
    provider: meta.provider,
    model: meta.model,
    provenance: "AI",
    evidencePackHash: meta.evidencePackHash,
  });
  if (!result.success) {
    throw new Error(`AI_ANALYSIS_INVALID: ${result.error.issues[0]?.message ?? "envelope mismatch"}`);
  }
  return result.data;
}

/**
 * Derive the canonical proposal from a validated PROTECT analysis.
 * Notional = exposure × pct, instrument SHORT, leverage 1 — all by code.
 * Returns null for WAIT/NO_ACTION (no actionable proposal, ever).
 */
export function deriveAiProposal(
  analysis: AiModelPayload,
  exposure: Exposure,
): ProtectionProposal | null {
  if (analysis.decision !== "PROTECT") return null;
  const pct = analysis.recommendedProtectionPct as number;
  return {
    underlying: exposure.underlying,
    protectionPct: pct,
    proposedTradeValueUsdt: round2Usdt((exposure.exposureValueUsdt * pct) / 100),
    leverageUsed: 1,
  };
}

/** Map a validated payload onto the Tenax reasoning contract (kind model). */
export function toModelReasoning(analysis: AiModelPayload): AnalysisReasoning {
  return {
    kind: "model",
    summary: `Model recommends ${analysis.decision}${
      analysis.decision === "PROTECT" ? ` — ${analysis.recommendedProtectionPct}%` : ""
    }.`,
    riskObservations: [...analysis.risks],
    proposedProtectionPct: analysis.recommendedProtectionPct ?? 0,
    rationale: analysis.rationale,
    evidenceRefs: [...analysis.evidenceRefs],
  };
}

export function buildAiAudit(
  analysis: AiProtectionAnalysis,
  outputHash: string,
): AiAnalysisAudit {
  return {
    provider: analysis.provider,
    model: analysis.model,
    generatedAt: analysis.generatedAt,
    evidencePackHash: analysis.evidencePackHash,
    outputHash,
    decision: analysis.decision as AiDecision,
    recommendedProtectionPct: analysis.recommendedProtectionPct,
    rationale: analysis.rationale,
    keyDrivers: [...analysis.keyDrivers],
    risks: [...analysis.risks],
    missingEvidence: [...analysis.missingEvidence],
  };
}

/**
 * Run the full AI analysis: pack → model → validate → derive → mandate.
 * The mandate verdict is returned as evaluated — including REFUSE for
 * over-mandate recommendations. Never throws for AI conditions; failures
 * are explicit AI_UNAVAILABLE / AI_PROVIDER_ERROR / AI_ANALYSIS_INVALID.
 */
export async function runAiAnalysis(input: AiPipelineInput): Promise<AiPipelineResult> {
  // The mandate is deliberately NOT part of the model-facing pack: the
  // model recommends freely, and input.mandate below feeds only the
  // deterministic evaluation. Same pack, same hash, before or after.
  const pack = buildEvidencePack({
    exposure: input.exposure,
    intent: input.intent,
    snapshot: input.snapshot,
    futuresTicker: input.market.futuresTicker,
    candles: input.market.candles,
    nvdax: input.market.nvdax,
    instrument: input.market.instrument,
    demoAccount: input.market.demoAccount ?? null,
    nvidiaEvent: input.market.nvidiaEvent ?? null,
  });
  const serialized = serializeEvidencePack(pack);
  const packHash = hashEvidencePack(serialized);

  if (!input.config) {
    return {
      ok: false,
      failure: { code: "AI_UNAVAILABLE", reason: "AI configuration absent (provider/model/key)" },
      pack,
      packHash,
    };
  }

  const requested = await requestAiAnalysis({
    config: input.config,
    systemPrompt: buildAiSystemPrompt(),
    evidenceJson: serialized,
    fetchImpl: input.fetchImpl,
  });
  if (!requested.ok) return { ok: false, failure: requested.failure, pack, packHash };

  let payload: AiModelPayload;
  try {
    payload = validateAiOutput(requested.content);
    assertNoFabricatedEventTiming(payload, pack.intent.earningsDate);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "AI_ANALYSIS_INVALID";
    return { ok: false, failure: { code: "AI_ANALYSIS_INVALID", reason }, pack, packHash };
  }

  // Tenax binds its own audit metadata AFTER validation. The model never
  // sees, chooses, or echoes these values — hash mismatches are impossible
  // by construction.
  const evaluatedAt = new Date(input.nowMs ?? Date.now()).toISOString();
  let analysis: AiProtectionAnalysis;
  try {
    analysis = buildAnalysisEnvelope(payload, {
      provider: input.config.provider,
      model: input.config.model,
      generatedAt: evaluatedAt,
      evidencePackHash: packHash,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "AI_ANALYSIS_INVALID";
    return { ok: false, failure: { code: "AI_ANALYSIS_INVALID", reason }, pack, packHash };
  }

  // outputHash covers the validated semantic payload bound to Tenax's
  // immutable audit metadata (provider, model, timestamp, pack hash):
  // hash(stableSerialize(envelope)). Reproducible given the same inputs.
  const outputHash = hashValue(JSON.stringify(analysis));
  const proposal = deriveAiProposal(payload, input.exposure);
  const mandateDecision = proposal
    ? evaluateMandate(proposal, input.mandate, input.exposure, evaluatedAt)
    : null;
  return {
    ok: true,
    pack,
    packHash,
    analysis,
    outputHash,
    proposal,
    mandateDecision,
    reasoning: toModelReasoning(payload),
    audit: buildAiAudit(analysis, outputHash),
  };
}

export { resolveAiConfig };
