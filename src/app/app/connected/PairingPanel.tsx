"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { ensureTenaxSession } from "../_components/SessionBootstrap";
import {
  runConnectedHandoff,
  type BrowserConnectState,
  type BrowserPairingPayload,
} from "@/lib/connected/browser-handoff";

const EMPTY_CONNECTION_STATES = new Set(["NOT_CONNECTED", "DISCONNECTED", "ERROR"]);

type PairingPanelProps = {
  readonly connectionStatus: string;
  readonly pendingPairing: boolean;
  readonly hasSnapshot: boolean;
};

type PairingResponse = {
  readonly ok: true;
  readonly pairingCode: string;
  readonly expiresAt: string;
};

type InstallerAvailability = {
  readonly status: "CHECKING" | "AVAILABLE" | "UNAVAILABLE";
  readonly url: string | null;
};

function safeInstallerUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function minutesRemaining(expiresAt: string | null): string {
  if (!expiresAt) return "—";
  const remaining = Math.max(0, new Date(expiresAt).getTime() - Date.now());
  return `${Math.max(1, Math.ceil(remaining / 60_000))} MINUTES`;
}

function stateLabel(state: BrowserConnectState): string {
  switch (state) {
    case "CREATING_PAIRING":
      return "PREPARING SECURE HANDOFF";
    case "CONNECTOR_READY":
      return "CONNECTOR READY";
    case "OPENING_CONNECTOR":
      return "OPENING CONNECTOR";
    case "HANDOFF_ACCEPTED":
      return "OPENING BITGET AUTHORIZATION";
    case "WAITING_FOR_AUTHORIZATION":
      return "WAITING FOR BITGET AUTHORIZATION";
    case "SYNCING_ACCOUNT":
      return "SYNCING ACCOUNT";
    case "CONNECTED":
      return "CONNECTED · READ ONLY";
    case "CONNECTOR_NOT_DETECTED":
      return "TENAX CONNECTOR NOT DETECTED";
    case "PAIRING_EXPIRED":
      return "PAIRING EXPIRED";
    case "FAILED":
      return "CONNECTION FAILED";
  }
}

function stateMessage(state: BrowserConnectState): string {
  switch (state) {
    case "CREATING_PAIRING":
      return "Preparing a short lived pairing for this browser session.";
    case "CONNECTOR_READY":
      return "The local connector is ready. Sending the secure pairing handoff.";
    case "OPENING_CONNECTOR":
      return "The local Tenax Connector is being opened on this device.";
    case "HANDOFF_ACCEPTED":
      return "Opening Bitget authorization in the local connector.";
    case "WAITING_FOR_AUTHORIZATION":
      return "Complete authorization in the Bitget window. Your credentials stay on this device.";
    case "SYNCING_ACCOUNT":
      return "Syncing your read only account data through Tenax.";
    case "CONNECTED":
      return "Bitget connected. Tenax receives only sanitized account information.";
    case "CONNECTOR_NOT_DETECTED":
      return "Secure Bitget connection requires the local Tenax Connector. Your Bitget credentials remain on this device.";
    case "PAIRING_EXPIRED":
      return "This pairing expired before the local handoff completed. Try again for a fresh pairing.";
    case "FAILED":
      return "The local handoff could not complete. Try again or use the advanced manual pairing option.";
  }
}

function isRunning(state: BrowserConnectState): boolean {
  return (
    state === "CREATING_PAIRING" ||
    state === "CONNECTOR_READY" ||
    state === "OPENING_CONNECTOR" ||
    state === "HANDOFF_ACCEPTED" ||
    state === "WAITING_FOR_AUTHORIZATION" ||
    state === "SYNCING_ACCOUNT"
  );
}

function isFallbackState(state: BrowserConnectState): boolean {
  return state === "CONNECTOR_NOT_DETECTED" || state === "PAIRING_EXPIRED" || state === "FAILED";
}

export default function PairingPanel({ connectionStatus, pendingPairing, hasSnapshot }: PairingPanelProps) {
  const router = useRouter();
  const mounted = useRef(true);
  const activeController = useRef<AbortController | null>(null);
  const [state, setState] = useState<BrowserConnectState | "IDLE">("IDLE");
  const [pairing, setPairing] = useState<BrowserPairingPayload | null>(null);
  const [serverOrigin, setServerOrigin] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installer, setInstaller] = useState<InstallerAvailability>({ status: "UNAVAILABLE", url: null });
  const [installerOpened, setInstallerOpened] = useState(false);

  const connected = connectionStatus === "CONNECTED";
  const pairingInProgress = connectionStatus === "PAIRING";
  const canCreate = EMPTY_CONNECTION_STATES.has(connectionStatus);
  const running = state !== "IDLE" && isRunning(state);
  const fallback = state !== "IDLE" && isFallbackState(state);
  const displayedExpiry = useMemo(() => minutesRemaining(pairing?.expiresAt ?? null), [pairing?.expiresAt]);

  useEffect(() => {
    return () => {
      mounted.current = false;
      activeController.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (state !== "CONNECTOR_NOT_DETECTED") return;
    const controller = new AbortController();
    let active = true;
    void fetch("/api/connected/installer", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as { readonly ok?: unknown; readonly url?: unknown } | null;
        const url = response.ok && payload?.ok === true ? safeInstallerUrl(payload.url) : null;
        if (active && mounted.current) setInstaller(url ? { status: "AVAILABLE", url } : { status: "UNAVAILABLE", url: null });
      })
      .catch(() => {
        if (active && mounted.current) setInstaller({ status: "UNAVAILABLE", url: null });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [state]);

  async function createPairing(): Promise<BrowserPairingPayload> {
    await ensureTenaxSession();
    const response = await fetch("/api/connected/pair", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("PAIRING_UNAVAILABLE");
    const payload = (await response.json()) as PairingResponse;
    if (!payload.ok || !payload.pairingCode || !payload.expiresAt) throw new Error("PAIRING_INVALID");
    return { pairingCode: payload.pairingCode, expiresAt: payload.expiresAt };
  }

  async function startConnection() {
    if (!canCreate || activeController.current) return;
    const controller = new AbortController();
    activeController.current = controller;
    const origin = window.location.origin;
    setServerOrigin(origin);
    setPairing(null);
    setManualOpen(false);
    setCopied(false);
    setError(null);
    setInstaller({ status: "CHECKING", url: null });
    setInstallerOpened(false);

    const updateState = (next: BrowserConnectState) => {
      if (mounted.current) setState(next);
    };

    try {
      const result = await runConnectedHandoff(
        {
          serverOrigin: origin,
          signal: controller.signal,
          createPairing,
          onPairingCreated: (nextPairing) => {
            if (mounted.current) setPairing(nextPairing);
          },
          onState: updateState,
        },
      );
      if (!mounted.current || result.outcome === "ABORTED") return;
      if (result.outcome === "CONNECTED") {
        setState("CONNECTED");
        router.refresh();
      } else if (result.outcome === "CONNECTOR_NOT_DETECTED") {
        setError("TENAX CONNECTOR NOT DETECTED");
      } else if (result.outcome === "PAIRING_EXPIRED") {
        setError("PAIRING EXPIRED");
      } else {
        setState("FAILED");
        setError("LOCAL_HANDOFF_FAILED");
      }
    } catch {
      if (mounted.current && !controller.signal.aborted) {
        setState("FAILED");
        setError("LOCAL_HANDOFF_FAILED");
      }
    } finally {
      if (activeController.current === controller) activeController.current = null;
    }
  }

  async function copyCode() {
    if (!pairing?.pairingCode) return;
    try {
      await navigator.clipboard.writeText(pairing.pairingCode);
      setCopied(true);
    } catch {
      setError("Copy is unavailable in this browser. Select the code manually.");
    }
  }

  function installConnector() {
    if (!installer.url) return;
    const opened = window.open(installer.url, "_blank", "noopener,noreferrer");
    if (opened) setInstallerOpened(true);
  }

  if (connected || state === "CONNECTED") {
    return (
      <div className="border-t border-ink/15 pt-4">
        <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-pass">CONNECTED · READ ONLY</p>
        <p className="mt-2 text-[15px] leading-[22px] text-mutedink">{hasSnapshot ? "This account is paired. The latest sanitized snapshot is shown above." : "This account is paired. Tenax is waiting for the first sanitized read only snapshot."}</p>
      </div>
    );
  }

  if (pairingInProgress) {
    return (
      <div className="border-t border-ink/15 pt-4">
        <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">PAIRING</p>
        <p className="mt-2 text-[15px] leading-[22px] text-mutedink">The local connector has paired. Tenax is waiting for the first sanitized read only snapshot.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 border-t border-ink/15 pt-4" aria-live="polite">
      {state !== "IDLE" ? (
        <div className={`border-l-2 p-4 ${fallback ? "border-clay bg-clay/10" : "border-signal bg-signal/10"}`}>
          <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-ink">{stateLabel(state)}</p>
          <p className="mt-2 text-[15px] leading-[22px] text-mutedink">{stateMessage(state)}</p>
          {state === "CONNECTOR_NOT_DETECTED" ? (
            <p className="mt-3 font-syslabel text-[10px] uppercase tracking-[0.08em] text-clay">
              {installerOpened
                ? "INSTALLER OPENED · RETURN HERE AND TRY AGAIN"
                : installer.status === "CHECKING"
                  ? "CHECKING INSTALLER AVAILABILITY"
                  : installer.status === "AVAILABLE"
                    ? "WINDOWS INSTALLER READY"
                    : "INSTALLER UNAVAILABLE IN THIS DEVELOPMENT BUILD"}
            </p>
          ) : null}
          {fallback ? (
            <div className="mt-4 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
              <button type="button" onClick={installConnector} disabled={installer.status !== "AVAILABLE" || installerOpened} className="min-h-11 rounded-[10px] border border-ink/20 px-4 py-3 text-[12px] font-bold leading-[16px] text-mutedink disabled:cursor-not-allowed disabled:opacity-70">INSTALL TENAX CONNECTOR</button>
              <button type="button" onClick={startConnection} disabled={!canCreate || running} className="min-h-11 rounded-[10px] bg-signal px-4 py-3 text-[12px] font-bold leading-[16px] text-ink disabled:cursor-wait disabled:opacity-60">TRY AGAIN</button>
            </div>
          ) : null}
        </div>
      ) : null}

      {state === "IDLE" ? (
        <div>
          <p className="text-[16px] leading-[24px] text-mutedink">
            {pendingPairing ? "A previous pairing is active. Start again to create a fresh secure handoff." : "Start a secure local handoff to the Tenax Connector."}
          </p>
          <button type="button" onClick={startConnection} disabled={!canCreate || running} className="mt-4 min-h-11 rounded-[10px] bg-signal px-5 py-3 text-[13px] font-bold leading-[18px] text-ink disabled:cursor-wait disabled:opacity-60">
            CONNECT BITGET
          </button>
        </div>
      ) : null}

      {pairing && !connected ? (
        <div className="border-t border-ink/10 pt-3">
          <button type="button" onClick={() => setManualOpen((open) => !open)} className="font-syslabel text-left text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink underline decoration-ink/30 underline-offset-4 hover:text-ink">
            {manualOpen ? "HIDE MANUAL PAIRING CODE" : "HAVING TROUBLE? SHOW MANUAL PAIRING CODE"}
          </button>
          {manualOpen ? (
            <div className="mt-3 grid gap-3 rounded-[10px] border border-ink/15 bg-softwhite/60 p-4">
              <div>
                <p className="font-syslabel text-[10px] uppercase tracking-[0.08em] text-mutedink">PAIRING CODE</p>
                <p className="mt-2 break-all font-mono text-[22px] font-bold leading-[28px] tracking-[0.12em] text-ink" aria-label="One-time pairing code">{pairing.pairingCode}</p>
                <p className="mt-2 text-[13px] leading-[18px] text-mutedink">Expires in ~{displayedExpiry.toLowerCase()}. This advanced path is for engineering fallback only.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={copyCode} className="min-h-11 self-start rounded-[10px] bg-ink px-4 py-3 text-[12px] font-bold leading-[16px] text-softwhite hover:bg-graphite">{copied ? "COPIED" : "COPY CODE"}</button>
                <button type="button" onClick={startConnection} className="min-h-11 self-start rounded-[10px] border border-ink/25 px-4 py-3 text-[12px] font-bold leading-[16px] text-ink hover:border-ink">GENERATE NEW CODE</button>
              </div>
              <code className="break-words rounded-[8px] bg-ink p-3 text-[11px] leading-[17px] text-softwhite">node scripts/bitget-agentic-connector.ts --server {serverOrigin ?? "<TENAX_ORIGIN>"} --pair {pairing.pairingCode}</code>
            </div>
          ) : null}
        </div>
      ) : null}
      {error && state !== "CONNECTOR_NOT_DETECTED" && state !== "PAIRING_EXPIRED" ? <p role="alert" className="text-[13px] leading-[19px] text-clay">The local connector handoff could not complete. Try again.</p> : null}
    </div>
  );
}
