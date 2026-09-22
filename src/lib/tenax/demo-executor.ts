// Tenax Phase 2D-A — guarded BITGET_DEMO NVDA hedge executor.
//
// DEMO ONLY. Implements the write path but never executes without every
// pre-execution gate passing AND explicit owner confirmation.
//
// Architecture:
// - evaluateDemoHedgeGates: pure gate evaluation over a caller-supplied
//   market snapshot (fresh instrument/ticker/position/settings reads).
// - previewDemoHedge: pure preview (gates + derived qty, never submits).
// - submitDemoHedgeOrder: re-runs every gate immediately before POST,
//   submits only when confirmed, then verifies via order-info. FILLED is
//   reported only on an explicit filled status — never inferred.
// - Tenax never sets leverage: the order body carries no marginMode and
//   no leverage; execution runs under the account's configured 1x crossed
//   margin, enforced by the gates.

import type {
  DemoAuthCredentials,
  DemoReadOnlyFetchResult,
} from "../bitget/demo-auth.ts";
import {
  DEMO_ACCOUNT_SETTINGS_PATH,
  DEMO_POSITION_CURRENT_PATH,
  extractEnvelopeSafe,
  fetchDemoReadOnly,
} from "../bitget/demo-auth.ts";
import {
  createDefaultPublicClient,
  BITGET_BASE_URL,
} from "../bitget/reality.ts";
import {
  computeHedgeSizing,
  evaluatePositionProbe,
  normalizeAccountSettings,
  normalizeNvdaInstrument,
  normalizeNvdaTicker,
  selectReferencePrice,
  type HedgeSizingResult,
  type NvdaInstrument,
  type NvdaPosition,
  type NvdaTicker,
  type ReferencePriceSource,
} from "../bitget/nvda-hedge.ts";
import {
  buildDemoShortOrderBody,
  createDemoClientOid,
  extractPlacedOrderIds,
  fetchDemoOrderInfo,
  isFilledOrderStatus,
  normalizeDemoOrderInfo,
  placeDemoShortOrder,
  type DemoOrderVerification,
  type DemoShortOrderBody,
  type ReadFetchImpl,
  type WriteFetchImpl,
} from "../bitget/demo-trade.ts";

export type { ReadFetchImpl, WriteFetchImpl };
import { hashProposal, isApprovalValidFor, type ProtectionApproval } from "./approval.ts";
import type { StandingGateAttestation } from "./authority.ts";
import type {
  ExecutionMode,
  Mandate,
  MandateDecision,
  ProtectionProposal,
} from "./domain.ts";

/** Default human-approval freshness bound (15 minutes). */
export const DEFAULT_APPROVAL_MAX_AGE_MS = 15 * 60 * 1000;

const HEDGE_POSITION_QUERY = "category=USDT-FUTURES&symbol=NVDAUSDT";
const SUCCESS_CODE = "00000";

async function fetchPublicRow<T>(
  path: string,
  normalize: (body: unknown) => T | null,
): Promise<T | null> {
  try {
    const res = await createDefaultPublicClient().getJson(`${BITGET_BASE_URL}${path}`);
    if (res.httpStatus !== 200) return null;
    const root =
      typeof res.body === "object" && res.body !== null && !Array.isArray(res.body)
        ? (res.body as Record<string, unknown>)
        : null;
    if (root?.code !== SUCCESS_CODE) return null;
    return normalize(res.body);
  } catch {
    return null;
  }
}

export interface DemoMarketReaderDeps {
  readonly credentials: DemoAuthCredentials;
  readonly baseUrl: string;
}

/**
 * Fresh read-only market snapshot for the gates: public NVDAUSDT
 * instrument/ticker plus authenticated position/settings. Any failed
 * read yields null fields, which refuse the gates honestly. Never writes.
 */
export async function fetchLiveDemoHedgeMarket(
  deps: DemoMarketReaderDeps,
): Promise<DemoHedgeMarketState> {
  const instrument = await fetchPublicRow(
    `/api/v3/market/instruments?${HEDGE_POSITION_QUERY}`,
    normalizeNvdaInstrument,
  );
  const ticker = await fetchPublicRow(
    `/api/v3/market/tickers?${HEDGE_POSITION_QUERY}`,
    normalizeNvdaTicker,
  );
  const positionResult = await fetchDemoReadOnly({
    credentials: deps.credentials,
    baseUrl: deps.baseUrl,
    tradingMode: "demo",
    requestPath: DEMO_POSITION_CURRENT_PATH,
    queryString: HEDGE_POSITION_QUERY,
  });
  const positionEvaluation = evaluatePositionProbe({
    httpStatus: positionResult.httpStatus,
    body: positionResult.body,
    transportError: positionResult.transportError,
  });
  const settingsResult = await fetchDemoReadOnly({
    credentials: deps.credentials,
    baseUrl: deps.baseUrl,
    tradingMode: "demo",
    requestPath: DEMO_ACCOUNT_SETTINGS_PATH,
  });
  const settings =
    settingsResult.transportError === null &&
    settingsResult.httpStatus === 200 &&
    extractEnvelopeSafe(settingsResult.body).code === SUCCESS_CODE
      ? normalizeAccountSettings(settingsResult.body)
      : null;
  return {
    category: instrument?.category ?? null,
    symbol: instrument?.symbol ?? null,
    holdMode: settings?.holdMode ?? null,
    nvdaSymbolConfigFound: settings?.nvdaSymbolConfigFound ?? false,
    marginMode: settings?.nvdaMarginMode ?? settings?.marginMode ?? null,
    configuredLeverage: settings?.nvdaLeverage ?? null,
    position: positionEvaluation.probe === "PASS" ? positionEvaluation.position : null,
    instrument,
    ticker,
  };
}

/** Fresh market/account snapshot the gates evaluate (all reads, no writes). */
export interface DemoHedgeMarketState {
  readonly category: string | null;
  readonly symbol: string | null;
  readonly holdMode: string | null;
  readonly nvdaSymbolConfigFound: boolean;
  readonly marginMode: string | null;
  readonly configuredLeverage: string | null;
  readonly position: NvdaPosition | null;
  readonly instrument: NvdaInstrument | null;
  readonly ticker: NvdaTicker | null;
}

export interface DemoHedgeGateInput {
  readonly tradingMode: string;
  readonly executionMode: ExecutionMode;
  readonly mandate: Mandate;
  readonly proposal: ProtectionProposal;
  readonly decision: MandateDecision;
  /**
   * Exactly one authority must be present: a human approval record, or a
   * standing attestation. A standing attestation is never a fabricated
   * approval — the binding/mode/freshness gates evaluate whichever source
   * is bound, with source-labeled details.
   */
  readonly approval: ProtectionApproval | null;
  readonly standingAuthority?: StandingGateAttestation | null;
  readonly market: DemoHedgeMarketState;
  readonly maxApprovalAgeMs: number;
  readonly nowMs: number;
}

export interface DemoHedgeGate {
  readonly id: string;
  readonly pass: boolean;
  readonly detail: string;
}

export interface DemoHedgeGateReport {
  readonly gates: readonly DemoHedgeGate[];
  readonly refused: boolean;
  readonly failedGateIds: readonly string[];
}

function gate(id: string, pass: boolean, detail: string): DemoHedgeGate {
  return { id, pass, detail };
}

function parseConfiguredLeverage(raw: string | null): number | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

function ageBoundMs(isoTimestamp: string | null, nowMs: number): number | null {
  if (isoTimestamp === null) return null;
  const parsedMs = Date.parse(isoTimestamp);
  if (!Number.isFinite(parsedMs)) return null;
  return nowMs - parsedMs;
}

/**
 * Derive deterministic sizing from the approved proposal + fresh market
 * rules. Shared by the sizing gate, preview, and submission so all three
 * always agree. Quantity comes from the approved notional — never hardcoded.
 */
export function deriveDemoHedgeSizing(
  proposal: ProtectionProposal,
  instrument: NvdaInstrument | null,
  ticker: NvdaTicker | null,
): HedgeSizingResult {
  const reference =
    ticker === null ? { price: null, source: null } : selectReferencePrice(ticker);
  return computeHedgeSizing({
    targetNotional: proposal.proposedTradeValueUsdt,
    referencePrice: reference.price,
    priceSource: reference.source,
    quantityPrecision: instrument?.quantityPrecision ?? null,
    minOrderQty: instrument?.minOrderQty ?? null,
    minOrderAmount: instrument?.minOrderAmount ?? null,
  });
}

/** Format a normalized qty to instrument precision for the order body. */
export function formatDemoHedgeQty(normalizedQty: number, quantityPrecision: number): string {
  return normalizedQty.toFixed(quantityPrecision);
}

/**
 * Canonical NVIDIA protection action (Phase 4B-B2.1). The ONE derivation
 * of what Tenax would submit for an NVDA hedge: NVDAUSDT, USDT-FUTURES,
 * sell/short, market — with quantity derived server-side from the
 * validated proposal notional and instrument rules. DRY_RUN previews and
 * BITGET_DEMO submissions both consume this shape; there is no separate
 * preview instrument. RNVDAUSDT (the Reality exposure representation)
 * may appear in evidence, never here. Throws when sizing is unevaluable.
 */
export interface CanonicalProtectionAction {
  readonly symbol: "NVDAUSDT";
  readonly category: "USDT-FUTURES";
  readonly side: "sell";
  readonly posSide: "short";
  readonly orderType: "market";
  readonly qty: string;
}

export function deriveCanonicalProtectionAction(
  proposal: ProtectionProposal,
  instrument: NvdaInstrument | null,
  ticker: NvdaTicker | null,
): CanonicalProtectionAction {
  // Same sizing both paths submit: DRY_RUN previews and BITGET_DEMO
  // submissions share deriveDemoHedgeSizing exactly.
  const sizing = deriveDemoHedgeSizing(proposal, instrument, ticker);
  const precision = instrument?.quantityPrecision ?? null;
  if (
    sizing.normalizedQty === null ||
    precision === null ||
    sizing.executableByInstrumentRules !== "YES"
  ) {
    throw new Error(
      "ACTION_UNEVALUABLE: instrument rules or reference price missing — no qty invented",
    );
  }
  return {
    symbol: "NVDAUSDT",
    category: "USDT-FUTURES",
    side: "sell",
    posSide: "short",
    orderType: "market",
    qty: formatDemoHedgeQty(sizing.normalizedQty, precision),
  };
}

/**
 * Evaluate all 16 pre-execution hard gates. Pure: no network, no writes.
 * ANY unknown/failed gate refuses the order.
 */
export function evaluateDemoHedgeGates(input: DemoHedgeGateInput): DemoHedgeGateReport {
  const { mandate, proposal, decision, market } = input;
  const gates: DemoHedgeGate[] = [];

  gates.push(
    gate(
      "mode_demo",
      input.tradingMode.trim().toLowerCase() === "demo",
      `BITGET_TRADING_MODE=${input.tradingMode}`,
    ),
  );
  gates.push(
    gate("category_match", market.category === "USDT-FUTURES", `category=${market.category}`),
  );
  gates.push(gate("symbol_match", market.symbol === "NVDAUSDT", `symbol=${market.symbol}`));
  gates.push(gate("hold_mode", market.holdMode === "hedge_mode", `holdMode=${market.holdMode}`));
  gates.push(
    gate(
      "symbol_config",
      market.nvdaSymbolConfigFound === true,
      `nvdaSymbolConfigFound=${market.nvdaSymbolConfigFound}`,
    ),
  );
  gates.push(
    gate("margin_crossed", market.marginMode === "crossed", `marginMode=${market.marginMode}`),
  );

  const configuredLeverage = parseConfiguredLeverage(market.configuredLeverage);
  gates.push(
    gate(
      "leverage_one",
      configuredLeverage !== null &&
        configuredLeverage === 1 &&
        mandate.maxLeverage >= 1,
      `configuredLeverage=${market.configuredLeverage} maxLeverage=${mandate.maxLeverage}x`,
    ),
  );

  gates.push(
    gate(
      "position_understood",
      market.position !== null,
      market.position === null
        ? "position state unknown"
        : `currentPosition=${market.position.hasPosition ? "PRESENT" : "NONE"}`,
    ),
  );

  const marketFresh =
    market.instrument !== null &&
    market.ticker !== null &&
    market.instrument.symbol === "NVDAUSDT" &&
    market.ticker.symbol === "NVDAUSDT";
  gates.push(
    gate(
      "market_fresh",
      marketFresh,
      marketFresh ? "fresh instrument + ticker for NVDAUSDT" : "instrument/ticker missing or mismatched",
    ),
  );

  const sizing = deriveDemoHedgeSizing(proposal, market.instrument, market.ticker);
  gates.push(
    gate(
      "sizing_ok",
      sizing.normalizedQty !== null &&
        sizing.executableByInstrumentRules === "YES",
      sizing.normalizedQty === null
        ? "sizing not evaluable"
        : `qty=${sizing.normalizedQty} notional=${sizing.resultingNotional} rules=${sizing.executableByInstrumentRules}`,
    ),
  );

  const standing = input.standingAuthority ?? null;
  const hasHuman = input.approval !== null;
  const hasStanding = standing !== null;
  // Exactly one authority source; zero or two refuses the binding gates.
  const boundHash =
    hasHuman && !hasStanding
      ? (input.approval as ProtectionApproval).proposalHash
      : !hasHuman && hasStanding
        ? (standing as StandingGateAttestation).proposalHash
        : null;
  const boundMode =
    hasHuman && !hasStanding
      ? (input.approval as ProtectionApproval).executionMode
      : !hasHuman && hasStanding
        ? (standing as StandingGateAttestation).executionMode
        : null;
  const boundAt =
    hasHuman && !hasStanding
      ? (input.approval as ProtectionApproval).approvedAt
      : !hasHuman && hasStanding
        ? (standing as StandingGateAttestation).authorizedAt
        : null;
  const sourceLabel = !hasHuman && hasStanding ? "standing" : "approval";

  gates.push(
    gate(
      "proposal_bound",
      boundHash !== null && boundHash === hashProposal(proposal),
      boundHash === null
        ? "no single authority bound — refusing"
        : `${sourceLabel}Hash=${boundHash} proposalHash=${hashProposal(proposal)}`,
    ),
  );

  gates.push(
    gate(
      "mandate_pass",
      decision.verdict === "PASS" && decision.failedRules.length === 0,
      `verdict=${decision.verdict} failedRules=[${decision.failedRules.join(",")}]`,
    ),
  );

  const approvalBound =
    hasHuman && !hasStanding && input.approval
      ? isApprovalValidFor(input.approval, proposal, decision)
      : !hasHuman &&
        hasStanding &&
        standing !== null &&
        standing.proposalHash === hashProposal(proposal) &&
        decision.verdict === "PASS" &&
        decision.failedRules.length === 0;
  const ageMs = boundAt === null ? null : ageBoundMs(boundAt, input.nowMs);
  const approvalFresh =
    approvalBound && ageMs !== null && ageMs >= 0 && ageMs <= input.maxApprovalAgeMs;
  const humanInvalidDetail =
    hasHuman && !hasStanding && input.approval
      ? `approval state=${input.approval.state} — binding invalid`
      : `${sourceLabel} binding invalid or missing`;
  gates.push(
    gate(
      "approval_valid",
      approvalFresh,
      approvalBound
        ? ageMs === null
          ? `${sourceLabel === "approval" ? "approval" : "standing"} timestamp unparseable`
          : sourceLabel === "approval"
            ? `approved ${ageMs}ms ago (max ${input.maxApprovalAgeMs}ms)`
            : `standing authorized ${ageMs}ms ago (max ${input.maxApprovalAgeMs}ms)`
        : humanInvalidDetail,
    ),
  );

  const notionalOk =
    Number.isFinite(proposal.proposedTradeValueUsdt) &&
    proposal.proposedTradeValueUsdt > 0 &&
    proposal.proposedTradeValueUsdt <= mandate.maxTradeValueUsdt;
  gates.push(
    gate(
      "notional_cap",
      notionalOk,
      `${proposal.proposedTradeValueUsdt} USDT <= cap ${mandate.maxTradeValueUsdt} USDT`,
    ),
  );

  gates.push(
    gate(
      "execution_mode_demo",
      input.executionMode === "BITGET_DEMO",
      `executionMode=${input.executionMode}`,
    ),
  );

  gates.push(
    gate(
      "approval_mode",
      boundMode === "BITGET_DEMO",
      boundMode === null
        ? "no authority execution mode bound — refusing"
        : sourceLabel === "approval"
          ? `approvalExecutionMode=${boundMode} — DRY_RUN approvals can never authorize a Demo submission`
          : `standingExecutionMode=${boundMode} — non-DEMO authority can never authorize a Demo submission`,
    ),
  );

  const failedGateIds = gates.filter((g) => !g.pass).map((g) => g.id);
  return { gates, refused: failedGateIds.length > 0, failedGateIds };
}

export interface DemoHedgePreview {
  readonly ready: boolean;
  readonly gates: readonly DemoHedgeGate[];
  readonly failedGateIds: readonly string[];
  readonly qty: string | null;
  readonly approxNotional: number | null;
  readonly referencePrice: number | null;
  readonly priceSource: ReferencePriceSource | null;
  readonly configuredLeverage: string | null;
  readonly marginMode: string | null;
}

/** Pure preview: gates + derived order qty. Never submits, never writes. */
export function previewDemoHedge(input: DemoHedgeGateInput): DemoHedgePreview {
  const report = evaluateDemoHedgeGates(input);
  const sizing = deriveDemoHedgeSizing(input.proposal, input.market.instrument, input.market.ticker);
  const precision = input.market.instrument?.quantityPrecision ?? null;
  const qty =
    sizing.normalizedQty !== null && precision !== null
      ? formatDemoHedgeQty(sizing.normalizedQty, precision)
      : null;
  return {
    ready: !report.refused,
    gates: report.gates,
    failedGateIds: report.failedGateIds,
    qty,
    approxNotional: sizing.resultingNotional,
    referencePrice: sizing.referencePrice,
    priceSource: sizing.priceSource,
    configuredLeverage: input.market.configuredLeverage,
    marginMode: input.market.marginMode,
  };
}

export interface DemoHedgeSubmitInput extends DemoHedgeGateInput {
  /** Explicit owner confirmation. False (or absent) never writes. */
  readonly confirmed: boolean;
  readonly credentials: DemoAuthCredentials;
  readonly baseUrl: string;
  /** Injected for tests; generated (unique) when omitted. */
  readonly clientOid?: string;
  readonly writeFetchImpl?: WriteFetchImpl;
  readonly readFetchImpl?: ReadFetchImpl;
}

export type DemoHedgeSubmitResult =
  | {
      readonly outcome: "REFUSED";
      readonly gates: readonly DemoHedgeGate[];
      readonly failedGateIds: readonly string[];
    }
  | {
      readonly outcome: "SUBMIT_FAILED";
      readonly gates: readonly DemoHedgeGate[];
      readonly httpStatus: number;
      readonly reason: string;
    }
  | {
      readonly outcome: "SUBMITTED";
      readonly gates: readonly DemoHedgeGate[];
      readonly body: DemoShortOrderBody;
      readonly orderId: string | null;
      readonly clientOid: string;
      readonly orderStatus: string | null;
      readonly filled: boolean;
      readonly verification: DemoOrderVerification | null;
    };

/**
 * Guarded submission. Re-runs every gate immediately before POST; submits
 * only when all pass AND explicit confirmation is present. After a 00000
 * submission, verifies via order-info. FILLED only on explicit filled
 * status. The injected fetch boundary keeps every path offline-testable;
 * with the default fetch this performs the real Demo POST — callers must
 * gate it behind owner confirmation (the script does).
 */
export async function submitDemoHedgeOrder(
  input: DemoHedgeSubmitInput,
): Promise<DemoHedgeSubmitResult> {
  const report = evaluateDemoHedgeGates(input);
  const gates: DemoHedgeGate[] = [...report.gates];
  if (!input.confirmed) {
    const refusal: DemoHedgeGate = {
      id: "explicit_confirmation",
      pass: false,
      detail: "owner confirmation flag missing — NO ORDER SUBMITTED",
    };
    return {
      outcome: "REFUSED",
      gates: [...gates, refusal],
      failedGateIds: [...report.failedGateIds, refusal.id],
    };
  }
  if (report.refused) {
    return { outcome: "REFUSED", gates, failedGateIds: report.failedGateIds };
  }

  // Gates passed and confirmation present: derive the exact order from
  // the canonical protection action (the same derivation previews use).
  let action: CanonicalProtectionAction;
  try {
    action = deriveCanonicalProtectionAction(
      input.proposal,
      input.market.instrument,
      input.market.ticker,
    );
  } catch {
    return {
      outcome: "REFUSED",
      gates: [
        ...gates,
        { id: "sizing_ok", pass: false, detail: "sizing became unevaluable before submit" },
      ],
      failedGateIds: [...report.failedGateIds, "sizing_ok"],
    };
  }
  const clientOid = input.clientOid ?? createDemoClientOid(input.nowMs);
  const body = buildDemoShortOrderBody({
    qty: action.qty,
    clientOid,
  });

  const placed = await placeDemoShortOrder({
    credentials: input.credentials,
    baseUrl: input.baseUrl,
    body,
    fetchImpl: input.writeFetchImpl,
  });
  if (placed.transportError !== null) {
    return {
      outcome: "SUBMIT_FAILED",
      gates,
      httpStatus: 0,
      reason: "transport failure reaching Bitget Demo",
    };
  }
  const envelopeCode =
    typeof placed.body === "object" && placed.body !== null && !Array.isArray(placed.body)
      ? (placed.body as Record<string, unknown>).code
      : null;
  if (placed.httpStatus !== 200 || envelopeCode !== "00000") {
    return {
      outcome: "SUBMIT_FAILED",
      gates,
      httpStatus: placed.httpStatus,
      reason: `place-order not accepted (http ${placed.httpStatus}, code ${typeof envelopeCode === "string" ? envelopeCode : "null"})`,
    };
  }

  // 00000 is "accepted", NOT "filled". Verify via order-info.
  const ids = extractPlacedOrderIds(placed.body);
  const info: DemoReadOnlyFetchResult = await fetchDemoOrderInfo({
    credentials: input.credentials,
    baseUrl: input.baseUrl,
    orderId: ids.orderId,
    clientOid: ids.clientOid ?? body.clientOid,
    fetchImpl: input.readFetchImpl,
  });
  const verification =
    info.transportError === null && info.httpStatus === 200
      ? normalizeDemoOrderInfo(info.body)
      : null;
  const orderStatus = verification?.orderStatus ?? null;
  return {
    outcome: "SUBMITTED",
    gates,
    body,
    orderId: ids.orderId,
    clientOid: ids.clientOid ?? body.clientOid,
    orderStatus,
    filled: isFilledOrderStatus(orderStatus),
    verification,
  };
}
