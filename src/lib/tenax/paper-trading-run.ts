// Canonical paper/Demo run record and truth-preserving builder.
// This module composes existing flow, activity, receipt, and proof evidence.
// It never creates provider facts or execution authority.

import { z } from "zod";

import { buildJudgeProof } from "../proof/builder.ts";
import type { JudgeProof } from "../proof/model.ts";
import type { ActivityEvent, ActivityEventType } from "./activity.ts";
import type { DecisionReceipt } from "./domain.ts";
import type { TenaxDevStore } from "./dev-store.ts";

export const PAPER_TRADING_RUN_VERSION = 1 as const;
export const PAPER_TRADING_RUN_SYMBOL = "NVDAUSDT" as const;

export const PAPER_RUN_SOURCES = [
  "TENAX_DOMAIN",
  "BITGET_PUBLIC",
  "BITGET_DEMO_PRIVATE",
  "AI_PROVIDER",
  "DERIVED",
] as const;
export type PaperRunSource = (typeof PAPER_RUN_SOURCES)[number];

export const PAPER_RUN_STATUSES = [
  "EXECUTED",
  "ESCALATED",
  "REFUSED",
  "REVIEW_REQUIRED",
  "NO_ACTION",
  "FAILED",
] as const;
export type PaperRunStatus = (typeof PAPER_RUN_STATUSES)[number];

export const PAPER_RUN_AUTHORITY_OUTCOMES = [
  "EXECUTE",
  "ESCALATE",
  "REFUSE",
  "REVIEW",
  "NO_ACTION",
  "UNKNOWN",
] as const;
export type PaperRunAuthorityOutcome = (typeof PAPER_RUN_AUTHORITY_OUTCOMES)[number];

export const PAPER_RUN_EXECUTION_STATUSES = [
  "PREVIEW",
  "NO_ORDER",
  "SUBMITTED",
  "FILLED",
  "FAILED",
  "UNKNOWN",
] as const;
export type PaperRunExecutionStatus = (typeof PAPER_RUN_EXECUTION_STATUSES)[number];

export const PAPER_RUN_OUTCOME_STATES = [
  "NOT_OBSERVED",
  "OPEN_MARK",
  "REALIZED",
  "UNAVAILABLE",
] as const;
export type PaperRunOutcomeState = (typeof PAPER_RUN_OUTCOME_STATES)[number];

const nullableFinite = z.number().finite().nullable();
const nullableString = z.string().nullable();

const provenanceSchema = z.object({
  event: z.enum(PAPER_RUN_SOURCES),
  decision: z.enum(PAPER_RUN_SOURCES),
  authority: z.enum(PAPER_RUN_SOURCES),
  execution: z.enum(PAPER_RUN_SOURCES),
  outcome: z.enum(PAPER_RUN_SOURCES),
}).strict();

const eventSchema = z.object({
  eventType: z.string().min(1).max(64),
  eventId: nullableString,
  contextRefs: z.array(z.string().min(1).max(300)).max(50),
  observedPrice: nullableFinite,
  observedAt: nullableString,
}).strict();

const decisionSchema = z.object({
  provider: nullableString,
  model: nullableString,
  decision: z.string().nullable(),
  summary: nullableString,
  direction: z.enum(["SHORT", "UNKNOWN"]),
  proposedNotionalUsdt: nullableFinite,
  proposedProtectionPct: nullableFinite,
  reasoning: nullableString,
  proposedAt: nullableString,
}).strict();

const authorityBoundsSchema = z.object({
  maxProtectionPct: nullableFinite,
  maxNotionalUsdt: nullableFinite,
  maxExecutions: z.number().int().nullable(),
  maxLeverage: nullableFinite,
}).strict();

const authoritySchema = z.object({
  mandateId: nullableString,
  mandateHash: nullableString,
  mode: nullableString,
  outcome: z.enum(PAPER_RUN_AUTHORITY_OUTCOMES),
  reasonCodes: z.array(z.string().min(1).max(128)).max(30),
  bounds: authorityBoundsSchema.nullable(),
}).strict();

const executionSchema = z.object({
  provider: nullableString,
  orderId: nullableString,
  status: z.enum(PAPER_RUN_EXECUTION_STATUSES),
  submitted: z.boolean(),
  side: z.literal("sell").nullable(),
  size: nullableString,
  price: nullableFinite,
  fees: nullableFinite,
  submittedAt: nullableString,
  verifiedAt: nullableString,
  noOrderReason: nullableString,
}).strict();

const outcomeSchema = z.object({
  outcomeState: z.enum(PAPER_RUN_OUTCOME_STATES).default("NOT_OBSERVED"),
  markPrice: nullableFinite,
  markAt: nullableString,
  markSource: z.enum(PAPER_RUN_SOURCES).nullable().default(null),
  markPnlUsdt: nullableFinite.default(null),
  markReturnPct: nullableFinite.default(null),
  exitPrice: nullableFinite,
  exitSize: nullableString.default(null),
  exitAt: nullableString,
  exitProviderOrderId: nullableString.default(null),
  exitSource: z.enum(PAPER_RUN_SOURCES).nullable().default(null),
  realizedPnlUsdt: nullableFinite,
  realizedReturnPct: nullableFinite.default(null),
  feesUsdt: nullableFinite.default(null),
  netRealizedPnlUsdt: nullableFinite.default(null),
  pnlObservedAt: nullableString.default(null),
  unrealizedPnlUsdt: nullableFinite,
}).strict();

export const paperTradingRunSchema = z.object({
  version: z.literal(PAPER_TRADING_RUN_VERSION),
  runId: z.string().min(1).max(128),
  flowId: z.string().min(1).max(64),
  createdAt: z.string().datetime({ offset: true }),
  environment: z.enum(["DRY_RUN", "BITGET_DEMO"]).nullable(),
  symbol: z.literal(PAPER_TRADING_RUN_SYMBOL),
  status: z.enum(PAPER_RUN_STATUSES),
  sourceActivityEventId: nullableString,
  sourceProofId: nullableString,
  event: eventSchema,
  decision: decisionSchema,
  authority: authoritySchema,
  execution: executionSchema,
  outcome: outcomeSchema,
  provenance: provenanceSchema,
}).strict();

export type PaperTradingRun = z.infer<typeof paperTradingRunSchema>;

export interface PaperRunTerminalInput {
  readonly status: PaperRunStatus;
  readonly authorityOutcome: PaperRunAuthorityOutcome;
  readonly reasonCodes?: readonly string[];
  readonly noOrderReason?: string | null;
  readonly createdAt?: string;
}

export function paperTradingRunId(flowId: string): string {
  return `paper-run:v${PAPER_TRADING_RUN_VERSION}:${flowId}`;
}

export function isPaperTradingTerminalActivityType(type: ActivityEventType): boolean {
  return (
    type === "STANDING_AUTHORITY_ESCALATED" ||
    type === "STANDING_AUTHORITY_REFUSED" ||
    type === "STANDING_REVIEW_REQUIRED" ||
    type === "AUTONOMOUS_EXECUTION_FAILED" ||
    type === "AUTONOMOUS_EXECUTION_FILLED" ||
    type === "DECISION_RECEIPT_READY"
  );
}

function finiteFromString(value: string | null | undefined): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeReceipt(flow: { getReceipt(): DecisionReceipt | null } | undefined): DecisionReceipt | null {
  try {
    return flow?.getReceipt() ?? null;
  } catch {
    return null;
  }
}

function authorityFromProof(proof: JudgeProof | null): {
  readonly outcome: PaperRunAuthorityOutcome;
  readonly status: PaperRunStatus;
} {
  if (!proof) return { outcome: "UNKNOWN", status: "NO_ACTION" };
  switch (proof.kind) {
    case "EXECUTION_FILLED":
      return { outcome: "EXECUTE", status: "EXECUTED" };
    case "AUTHORITY_ESCALATED":
      return { outcome: "ESCALATE", status: "ESCALATED" };
    case "AUTHORITY_REFUSED":
      return { outcome: "REFUSE", status: "REFUSED" };
    case "REVIEW_REQUIRED":
      return { outcome: "REVIEW", status: "REVIEW_REQUIRED" };
    case "EXECUTION_FAILED":
      return { outcome: "EXECUTE", status: "FAILED" };
  }
}

function authorityFromEvent(event: ActivityEvent | null, receipt: DecisionReceipt | null): {
  readonly outcome: PaperRunAuthorityOutcome;
  readonly status: PaperRunStatus;
} {
  if (event?.type === "STANDING_AUTHORITY_ESCALATED") return { outcome: "ESCALATE", status: "ESCALATED" };
  if (event?.type === "STANDING_AUTHORITY_REFUSED") return { outcome: "REFUSE", status: "REFUSED" };
  if (event?.type === "STANDING_REVIEW_REQUIRED") return { outcome: "REVIEW", status: "REVIEW_REQUIRED" };
  if (event?.type === "AUTONOMOUS_EXECUTION_FILLED") return { outcome: "EXECUTE", status: "EXECUTED" };
  if (event?.type === "AUTONOMOUS_EXECUTION_FAILED") return { outcome: "EXECUTE", status: "FAILED" };
  if (receipt?.authorityDecision === "ESCALATE") return { outcome: "ESCALATE", status: "ESCALATED" };
  if (receipt?.authorityDecision === "REFUSED") return { outcome: "REFUSE", status: "REFUSED" };
  if (receipt?.approval === "REQUIRED") return { outcome: "REVIEW", status: "REVIEW_REQUIRED" };
  if (receipt) return { outcome: "EXECUTE", status: "EXECUTED" };
  return { outcome: "UNKNOWN", status: "NO_ACTION" };
}

function executionStatusFor(
  event: ActivityEvent | null,
  proof: JudgeProof | null,
  receipt: DecisionReceipt | null,
  demoExecution: { readonly orderId: string | null; readonly orderStatus: string | null; readonly filled: boolean; readonly avgPrice: string | null; readonly cumExecQty: string | null; readonly submittedAt: string | null; readonly verifiedAt: string | null } | null,
  terminal?: PaperRunTerminalInput,
): PaperRunExecutionStatus {
  if (!event && terminal && terminal.authorityOutcome !== "EXECUTE") return "NO_ORDER";
  if (proof?.execution?.status === "FILLED") return "FILLED";
  if (event?.type === "AUTONOMOUS_EXECUTION_FILLED") return "UNKNOWN";
  if (event?.type === "AUTONOMOUS_EXECUTION_FAILED") return "FAILED";
  if (event?.type === "STANDING_AUTHORITY_ESCALATED" || event?.type === "STANDING_AUTHORITY_REFUSED" || event?.type === "STANDING_REVIEW_REQUIRED") return "NO_ORDER";
  if (receipt?.executionMode === "DRY_RUN") return "PREVIEW";
  if (demoExecution?.filled === true) return "FILLED";
  if (demoExecution?.orderId || demoExecution?.orderStatus) return "SUBMITTED";
  return "UNKNOWN";
}

function terminalFor(
  event: ActivityEvent | null,
  proof: JudgeProof | null,
  receipt: DecisionReceipt | null,
  terminal?: PaperRunTerminalInput,
): { readonly status: PaperRunStatus; readonly authorityOutcome: PaperRunAuthorityOutcome; readonly reasonCodes: readonly string[]; readonly noOrderReason: string | null; readonly createdAt: string } {
  if (terminal) {
    return {
      status: terminal.status,
      authorityOutcome: terminal.authorityOutcome,
      reasonCodes: [...(terminal.reasonCodes ?? [])],
      noOrderReason: terminal.noOrderReason ?? null,
      createdAt: terminal.createdAt ?? event?.createdAt ?? receipt?.timestamp ?? new Date().toISOString(),
    };
  }
  const fromProof = authorityFromProof(proof);
  const fromEvent = authorityFromEvent(event, receipt);
  const selected = proof ? fromProof : fromEvent;
  return {
    status: selected.status,
    authorityOutcome: selected.outcome,
    reasonCodes: [...(event?.details?.reasonCodes ?? proof?.reasonCodes ?? [])],
    noOrderReason: selected.outcome === "EXECUTE" ? null : event?.summary ?? proof?.outcome ?? null,
    createdAt: event?.createdAt ?? receipt?.timestamp ?? new Date().toISOString(),
  };
}

export function buildPaperTradingRun(input: {
  readonly store: TenaxDevStore;
  readonly flowId: string;
  readonly event?: ActivityEvent | null;
  readonly proof?: JudgeProof | null;
  readonly terminal?: PaperRunTerminalInput;
  readonly nowMs?: number;
}): PaperTradingRun {
  const flow = input.store.flows.get(input.flowId);
  const context = flow?.getContext();
  const receipt = safeReceipt(flow);
  const event = input.event ?? null;
  const proof = input.proof ?? (event ? buildJudgeProof(input.store, event, input.nowMs) : null);
  const terminal = terminalFor(event, proof, receipt, input.terminal);
  const analysis = context?.analysis ?? null;
  const proposal = analysis?.proposal ?? null;
  const demo = context?.demoExecution ?? null;
  const executionStatus = executionStatusFor(event, proof, receipt, demo, input.terminal);
  const execution = proof?.execution;
  const authority = proof?.authority;
  const mandateSnapshot = proof?.mandateSnapshot;
  const environment = receipt?.executionMode ?? context?.executionModeUsed ?? null;
  const decisionSource: PaperRunSource = context?.aiAudit ? "AI_PROVIDER" : "TENAX_DOMAIN";
  const executionSource: PaperRunSource = execution || demo ? "BITGET_DEMO_PRIVATE" : "TENAX_DOMAIN";
  const eventSource: PaperRunSource = analysis?.reasoning.evidenceRefs.length ? "BITGET_PUBLIC" : "TENAX_DOMAIN";
  const orderId = execution?.providerOrderId ?? demo?.orderId ?? null;
  const size = execution?.quantity ?? demo?.cumExecQty ?? null;
  const price = execution?.avgFillPrice ? finiteFromString(execution.avgFillPrice) : finiteFromString(demo?.avgPrice);
  const submittedAt = demo?.submittedAt ?? null;
  const verifiedAt = demo?.verifiedAt ?? null;
  const run: PaperTradingRun = {
    version: PAPER_TRADING_RUN_VERSION,
    runId: paperTradingRunId(input.flowId),
    flowId: input.flowId,
    createdAt: terminal.createdAt,
    environment,
    symbol: PAPER_TRADING_RUN_SYMBOL,
    status: terminal.status,
    sourceActivityEventId: event?.id ?? null,
    sourceProofId: proof?.id ?? null,
    event: {
      eventType: context?.intent?.eventId ? "EARNINGS" : "UNKNOWN",
      eventId: context?.intent?.eventId ?? null,
      contextRefs: [...(analysis?.reasoning.evidenceRefs ?? [])],
      observedPrice: null,
      observedAt: null,
    },
    decision: {
      provider: context?.aiAudit?.provider ?? null,
      model: context?.aiAudit?.model ?? null,
      decision: context?.aiAudit?.decision ?? null,
      summary: analysis?.reasoning.summary ?? null,
      direction: proposal ? "SHORT" : "UNKNOWN",
      proposedNotionalUsdt: analysis?.authority.calculatedTradeValueUsdt ?? proposal?.proposedTradeValueUsdt ?? null,
      proposedProtectionPct: proposal?.protectionPct ?? null,
      reasoning: analysis?.reasoning.rationale ?? null,
      proposedAt: context?.analyzedAt ?? null,
    },
    authority: {
      mandateId: authority?.mandateId ?? mandateSnapshot?.mandateId ?? event?.details?.mandateId ?? null,
      mandateHash: authority?.mandateHash ?? mandateSnapshot?.mandateHash ?? null,
      mode: authority?.mode ?? mandateSnapshot?.mode ?? null,
      outcome: terminal.authorityOutcome,
      reasonCodes: [...terminal.reasonCodes],
      bounds: mandateSnapshot
        ? {
            maxProtectionPct: mandateSnapshot.maxProtectionPct,
            maxNotionalUsdt: mandateSnapshot.maxNotionalUsdt,
            maxExecutions: mandateSnapshot.maxExecutions,
            maxLeverage: null,
          }
        : event?.details
          ? {
              maxProtectionPct: event.details.maxPct ?? null,
              maxNotionalUsdt: event.details.maxNotional ?? null,
              maxExecutions: null,
              maxLeverage: null,
            }
          : null,
    },
    execution: {
      provider: execution?.provider ?? (demo ? "Bitget" : null),
      orderId,
      status: executionStatus,
      submitted: executionStatus === "SUBMITTED" || executionStatus === "FILLED" || Boolean(orderId),
      side: execution || demo ? "sell" : null,
      size,
      price,
      fees: null,
      submittedAt,
      verifiedAt,
      noOrderReason: executionStatus === "NO_ORDER" ? terminal.noOrderReason : null,
    },
    outcome: {
      outcomeState: "NOT_OBSERVED",
      markPrice: null,
      markAt: null,
      markSource: null,
      markPnlUsdt: null,
      markReturnPct: null,
      exitPrice: null,
      exitSize: null,
      exitAt: null,
      exitProviderOrderId: null,
      exitSource: null,
      realizedPnlUsdt: null,
      realizedReturnPct: null,
      feesUsdt: null,
      netRealizedPnlUsdt: null,
      pnlObservedAt: null,
      unrealizedPnlUsdt: null,
    },
    provenance: {
      event: eventSource,
      decision: decisionSource,
      authority: "TENAX_DOMAIN",
      execution: executionSource,
      outcome: "DERIVED",
    },
  };
  return paperTradingRunSchema.parse(run);
}
