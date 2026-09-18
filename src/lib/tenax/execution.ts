// Tenax Phase 1A — execution adapter boundary.
//
// DRY_RUN is the safe default. BITGET_DEMO remains a supported future mode
// but is explicitly unavailable until tomorrow's authenticated spike proves
// it. No authenticated Bitget code lives in this module.

import type {
  ExecutionMode,
  ExecutionRequest,
  ExecutionResult,
} from "./domain";
import { DEFAULT_EXECUTION_MODE } from "./domain";

export { DEFAULT_EXECUTION_MODE };

export const DEMO_UNAVAILABLE_REASON =
  "BITGET_DEMO unverified: authenticated spike deferred until KYC/API access is available. Do not claim Demo execution works.";

export interface DryRunPreviewInput {
  /** Base-asset quantity as a decimal string (e.g. "0.4513"). */
  qty: string;
}

export interface ExecutionAdapter {
  readonly mode: ExecutionMode;
  previewProtection(input: DryRunPreviewInput): ExecutionRequest;
  executeProtection(
    input: DryRunPreviewInput,
  ): ExecutionResult | typeof DEMO_UNAVAILABLE_REASON;
}

/** DRY_RUN: constructs the would-be request, never submits, moves nothing. */
export const dryRunAdapter = {
  mode: "DRY_RUN" as const,
  previewProtection(input: DryRunPreviewInput): ExecutionRequest {
    if (!/^\d+(\.\d+)?$/.test(input.qty) || Number(input.qty) <= 0) {
      throw new Error(`Invalid dry-run qty (got ${input.qty})`);
    }
    return {
      mode: "DRY_RUN",
      operationId: "placeOrder",
      endpoint: "POST /api/v3/trade/place-order",
      category: "SPOT",
      symbol: "RNVDAUSDT",
      side: "sell",
      orderType: "market",
      qty: input.qty,
      kind: "would-be payload only — NOT submitted",
    };
  },
  executeProtection(input: DryRunPreviewInput): ExecutionResult {
    const request = dryRunAdapter.previewProtection(input);
    return {
      mode: "DRY_RUN",
      submitted: false,
      fundsMoved: false,
      request,
      disclaimer: "DRY_RUN — NO FUNDS MOVED",
    };
  },
};

/** BITGET_DEMO: represented only as an unavailable adapter for now. */
export const bitgetDemoAdapter = {
  mode: "BITGET_DEMO" as const,
  previewProtection(): ExecutionRequest {
    throw new Error(DEMO_UNAVAILABLE_REASON);
  },
  executeProtection(): typeof DEMO_UNAVAILABLE_REASON {
    return DEMO_UNAVAILABLE_REASON;
  },
};

export function getExecutionAdapter(mode: ExecutionMode): ExecutionAdapter {
  switch (mode) {
    case "DRY_RUN":
      return dryRunAdapter;
    case "BITGET_DEMO":
      return bitgetDemoAdapter;
    default:
      throw new Error(`Unknown execution mode (got ${mode satisfies never})`);
  }
}
