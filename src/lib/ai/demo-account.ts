// Tenax AI evidence — read-only Bitget Demo account context (server-only).
//
// Supplies the `demoAccount` evidence group: normalized position, pending
// order, and margin facts for model reasoning. READ-ONLY by construction:
// every read goes through fetchDemoReadOnly (GET-only allowlist), so this
// module cannot place, cancel, or modify anything. Any failed read yields
// null (honest unavailable); credentials never enter the evidence.

import {
  DEMO_ACCOUNT_SETTINGS_PATH,
  DEMO_POSITION_CURRENT_PATH,
  DEMO_TRADE_UNFILLED_ORDERS_PATH,
  extractEnvelopeSafe,
  fetchDemoReadOnly,
  type DemoAuthCredentials,
} from "../bitget/demo-auth.ts";
import {
  evaluatePositionProbe,
  normalizeAccountSettings,
} from "../bitget/nvda-hedge.ts";
import type {
  DemoAccountEvidence,
  DemoPendingOrderState,
  DemoPositionState,
} from "./evidence-pack.ts";

if (typeof window !== "undefined") {
  throw new Error("Demo account evidence is server-only");
}

const HEDGE_QUERY = "category=USDT-FUTURES&symbol=NVDAUSDT";
const SUCCESS_CODE = "00000";

export interface DemoAccountEvidenceInput {
  readonly credentials: DemoAuthCredentials;
  readonly baseUrl: string;
  readonly nowMs?: number;
}

/** Count unfilled NVDAUSDT orders from a safe envelope (count only, never dumped). */
function countPendingOrders(body: unknown): number | null {
  const root =
    typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  if (!root) return null;
  const data = root.data;
  if (Array.isArray(data)) return data.length;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const list = (data as Record<string, unknown>).list;
    if (Array.isArray(list)) return list.length;
    return 0;
  }
  return null;
}

/**
 * Pure mapping from normalized reads to evidence. Exported for tests;
 * the network lives only in fetchDemoAccountEvidence below.
 */
export function buildDemoAccountEvidence(input: {
  readonly position: DemoPositionState;
  readonly positionSide: string | null;
  readonly positionSize: string | null;
  readonly positionLeverage: string | null;
  readonly pendingOrders: DemoPendingOrderState;
  readonly marginMode: string | null;
  readonly holdMode: string | null;
  readonly configuredLeverage: string | null;
  readonly observedAt: string;
}): DemoAccountEvidence {
  return { ...input };
}

/**
 * Best-effort read-only Demo account snapshot. Returns null on ANY
 * failure (transport, auth, permission, shape) — the pack then carries
 * demoAccount null, honestly unknown. Never throws for provider
 * conditions, never writes.
 */
export async function fetchDemoAccountEvidence(
  input: DemoAccountEvidenceInput,
): Promise<DemoAccountEvidence | null> {
  try {
    const observedAt = new Date(input.nowMs ?? Date.now()).toISOString();
    const [positionResult, settingsResult, ordersResult] = await Promise.all([
      fetchDemoReadOnly({
        credentials: input.credentials,
        baseUrl: input.baseUrl,
        tradingMode: "demo",
        requestPath: DEMO_POSITION_CURRENT_PATH,
        queryString: HEDGE_QUERY,
      }),
      fetchDemoReadOnly({
        credentials: input.credentials,
        baseUrl: input.baseUrl,
        tradingMode: "demo",
        requestPath: DEMO_ACCOUNT_SETTINGS_PATH,
      }),
      fetchDemoReadOnly({
        credentials: input.credentials,
        baseUrl: input.baseUrl,
        tradingMode: "demo",
        requestPath: DEMO_TRADE_UNFILLED_ORDERS_PATH,
        queryString: HEDGE_QUERY,
      }),
    ]);

    const positionEvaluation = evaluatePositionProbe({
      httpStatus: positionResult.httpStatus,
      body: positionResult.body,
      transportError: positionResult.transportError,
    });
    if (positionEvaluation.probe !== "PASS") return null;

    let settings: ReturnType<typeof normalizeAccountSettings> = null;
    if (
      settingsResult.transportError === null &&
      settingsResult.httpStatus === 200 &&
      extractEnvelopeSafe(settingsResult.body).code === SUCCESS_CODE
    ) {
      settings = normalizeAccountSettings(settingsResult.body);
    }
    if (settings === null) return null;

    let pendingOrders: DemoPendingOrderState = "UNKNOWN";
    if (
      ordersResult.transportError === null &&
      ordersResult.httpStatus === 200 &&
      extractEnvelopeSafe(ordersResult.body).code === SUCCESS_CODE
    ) {
      const count = countPendingOrders(ordersResult.body);
      pendingOrders = count === null ? "UNKNOWN" : count === 0 ? "NONE" : "PRESENT";
    }

    const position = positionEvaluation.position;
    return buildDemoAccountEvidence({
      position: position.hasPosition ? "PRESENT" : "NONE",
      positionSide: position.side,
      positionSize: position.size,
      positionLeverage: position.leverage,
      pendingOrders,
      marginMode: settings.nvdaMarginMode ?? settings.marginMode,
      holdMode: settings.holdMode,
      configuredLeverage: settings.nvdaLeverage,
      observedAt,
    });
  } catch {
    return null;
  }
}
