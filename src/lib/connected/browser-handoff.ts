// Tenax Connected Mode — browser-driven local connector handoff.
//
// This module owns only browser transport to Tenax and the loopback bridge.
// It never talks to Bitget and never reads provider credentials or account data.
import { z } from "zod";

import { TENAX_PROTOCOL_URI } from "./protocol-contract.ts";
import {
  LOCAL_BRIDGE_HANDOFF_PATH,
  LOCAL_BRIDGE_HOST,
  LOCAL_BRIDGE_PORT,
  LOCAL_BRIDGE_STATUS_PATH,
} from "./local-bridge-contract.ts";

export const LOCAL_BRIDGE_ORIGIN = `http://${LOCAL_BRIDGE_HOST}:${LOCAL_BRIDGE_PORT}`;

export type BrowserConnectState =
  | "CREATING_PAIRING"
  | "CONNECTOR_READY"
  | "OPENING_CONNECTOR"
  | "HANDOFF_ACCEPTED"
  | "WAITING_FOR_AUTHORIZATION"
  | "SYNCING_ACCOUNT"
  | "CONNECTED"
  | "CONNECTOR_NOT_DETECTED"
  | "PAIRING_EXPIRED"
  | "FAILED";

export type BrowserHandoffOutcome =
  | "CONNECTED"
  | "CONNECTOR_NOT_DETECTED"
  | "PAIRING_EXPIRED"
  | "FAILED"
  | "ABORTED";

export interface BrowserPairingPayload {
  readonly pairingCode: string;
  readonly expiresAt: string;
}

export interface BrowserHandoffResult {
  readonly outcome: BrowserHandoffOutcome;
  readonly pairing: BrowserPairingPayload | null;
}

export interface BrowserHandoffInput {
  readonly serverOrigin: string;
  readonly signal: AbortSignal;
  readonly createPairing: () => Promise<BrowserPairingPayload>;
  readonly onPairingCreated?: (pairing: BrowserPairingPayload) => void;
  readonly onState?: (state: BrowserConnectState) => void;
}

export interface BrowserHandoffDependencies {
  readonly fetchImpl?: typeof fetch;
  readonly launchProtocol?: () => void;
  readonly delay?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  readonly now?: () => number;
  readonly pollIntervalMs?: number;
  readonly maxPolls?: number;
}

const bridgeStateSchema = z.enum([
  "CONNECTOR_READY",
  "HANDOFF_ACCEPTED",
  "OAUTH_PENDING",
  "SYNCING",
  "CONNECTED",
  "FAILED",
]);

const bridgeStatusSchema = z
  .object({
    ok: z.literal(true),
    state: bridgeStateSchema,
    errorCode: z.string().nullable(),
  })
  .strict();

const handoffResponseSchema = z
  .object({
    ok: z.literal(true),
    state: z.literal("HANDOFF_ACCEPTED"),
  })
  .strict();

const pairingPayloadSchema = z
  .object({
    pairingCode: z.string().trim().min(1).max(128),
    expiresAt: z.string().datetime({ offset: true }),
  })
  .strict();

function defaultLaunchProtocol(): void {
  if (typeof document === "undefined") return;
  const link = document.createElement("a");
  link.href = TENAX_PROTOCOL_URI;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function defaultDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("The handoff was cancelled.", "AbortError"));
      },
      { once: true },
    );
  });
}

function isAborted(error: unknown, signal: AbortSignal): boolean {
  return signal.aborted || (error instanceof DOMException && error.name === "AbortError");
}

function pairingExpired(expiresAt: string, now: () => number): boolean {
  return new Date(expiresAt).getTime() <= now();
}

async function readBridgeStatus(
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<z.infer<typeof bridgeStatusSchema> | null> {
  try {
    const response = await fetchImpl(`${LOCAL_BRIDGE_ORIGIN}${LOCAL_BRIDGE_STATUS_PATH}`, {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal,
    });
    if (!response.ok) return null;
    const parsed = bridgeStatusSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch (error) {
    if (isAborted(error, signal)) throw error;
    return null;
  }
}

async function postBridgeHandoff(input: {
  readonly fetchImpl: typeof fetch;
  readonly serverOrigin: string;
  readonly pairingCode: string;
  readonly signal: AbortSignal;
}): Promise<"ACCEPTED" | "BUSY" | "FAILED"> {
  try {
    const response = await input.fetchImpl(`${LOCAL_BRIDGE_ORIGIN}${LOCAL_BRIDGE_HANDOFF_PATH}`, {
      method: "POST",
      credentials: "omit",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        serverOrigin: input.serverOrigin,
        pairingCode: input.pairingCode,
      }),
      signal: input.signal,
    });
    if (response.status === 409) return "BUSY";
    if (!response.ok) return "FAILED";
    return handoffResponseSchema.safeParse(await response.json()).success ? "ACCEPTED" : "FAILED";
  } catch (error) {
    if (isAborted(error, input.signal)) throw error;
    return "FAILED";
  }
}

function safePairingPayload(payload: BrowserPairingPayload): BrowserPairingPayload {
  return pairingPayloadSchema.parse(payload);
}

export async function runConnectedHandoff(
  input: BrowserHandoffInput,
  dependencies: BrowserHandoffDependencies = {},
): Promise<BrowserHandoffResult> {
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const launchProtocol = dependencies.launchProtocol ?? defaultLaunchProtocol;
  const delay = dependencies.delay ?? defaultDelay;
  const now = dependencies.now ?? Date.now;
  const pollIntervalMs = dependencies.pollIntervalMs ?? 500;
  const maxPolls = dependencies.maxPolls ?? 30;
  let pairing: BrowserPairingPayload;

  input.onState?.("CREATING_PAIRING");
  try {
    pairing = safePairingPayload(await input.createPairing());
  } catch (error) {
    if (isAborted(error, input.signal)) return { outcome: "ABORTED", pairing: null };
    return { outcome: "FAILED", pairing: null };
  }
  input.onPairingCreated?.(pairing);
  if (pairingExpired(pairing.expiresAt, now)) {
    input.onState?.("PAIRING_EXPIRED");
    return { outcome: "PAIRING_EXPIRED", pairing };
  }

  let handoffSent = false;
  let protocolLaunched = false;

  const sendHandoff = async (): Promise<"ACCEPTED" | "BUSY" | "FAILED" | "EXPIRED"> => {
    if (handoffSent) return "ACCEPTED";
    if (pairingExpired(pairing.expiresAt, now)) return "EXPIRED";
    const result = await postBridgeHandoff({
      fetchImpl,
      serverOrigin: input.serverOrigin,
      pairingCode: pairing.pairingCode,
      signal: input.signal,
    });
    if (result === "ACCEPTED") {
      handoffSent = true;
      input.onState?.("HANDOFF_ACCEPTED");
    }
    return result;
  };

  const inspectStatus = async (
    status: z.infer<typeof bridgeStatusSchema>,
  ): Promise<BrowserHandoffOutcome | null> => {
    if (status.state === "CONNECTOR_READY" || (!handoffSent && (status.state === "FAILED" || status.state === "CONNECTED"))) {
      input.onState?.("CONNECTOR_READY");
      const handoff = await sendHandoff();
      if (handoff === "FAILED") return "FAILED";
      if (handoff === "EXPIRED") return "PAIRING_EXPIRED";
      return null;
    }
    if (status.state === "HANDOFF_ACCEPTED") {
      input.onState?.("HANDOFF_ACCEPTED");
      return null;
    }
    if (status.state === "OAUTH_PENDING") {
      input.onState?.("WAITING_FOR_AUTHORIZATION");
      return null;
    }
    if (status.state === "SYNCING") {
      input.onState?.("SYNCING_ACCOUNT");
      return null;
    }
    if (status.state === "CONNECTED" && handoffSent) {
      input.onState?.("CONNECTED");
      return "CONNECTED";
    }
    if (status.state === "FAILED" && handoffSent) return "FAILED";
    return null;
  };

  try {
    let status = await readBridgeStatus(fetchImpl, input.signal);
    if (pairingExpired(pairing.expiresAt, now)) {
      input.onState?.("PAIRING_EXPIRED");
      return { outcome: "PAIRING_EXPIRED", pairing };
    }
    if (!status) {
      input.onState?.("OPENING_CONNECTOR");
      launchProtocol();
      protocolLaunched = true;
    } else {
      const outcome = await inspectStatus(status);
      if (outcome) {
        input.onState?.(outcome === "FAILED" ? "FAILED" : "CONNECTED");
        return { outcome, pairing };
      }
    }

    for (let attempt = 0; attempt < maxPolls; attempt += 1) {
      await delay(pollIntervalMs, input.signal);
      if (input.signal.aborted) return { outcome: "ABORTED", pairing };
      if (pairingExpired(pairing.expiresAt, now)) {
        input.onState?.("PAIRING_EXPIRED");
        return { outcome: "PAIRING_EXPIRED", pairing };
      }
      status = await readBridgeStatus(fetchImpl, input.signal);
      if (!status) continue;
      const outcome = await inspectStatus(status);
      if (outcome) {
        input.onState?.(outcome === "FAILED" ? "FAILED" : "CONNECTED");
        return { outcome, pairing };
      }
    }

    input.onState?.("CONNECTOR_NOT_DETECTED");
    return { outcome: "CONNECTOR_NOT_DETECTED", pairing };
  } catch (error) {
    if (isAborted(error, input.signal)) return { outcome: "ABORTED", pairing };
    if (protocolLaunched) input.onState?.("FAILED");
    return { outcome: "FAILED", pairing };
  }
}
