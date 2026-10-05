"use client";

import { useMemo, useState } from "react";

import { ensureTenaxSession } from "../_components/SessionBootstrap";

const EMPTY_CONNECTION_STATES = new Set(["NOT_CONNECTED", "DISCONNECTED", "ERROR"]);

type PairingPanelProps = {
  readonly connectionStatus: string;
  readonly pendingPairing: boolean;
  readonly hasSnapshot: boolean;
};

type PairingState = "IDLE" | "CREATING" | "PAIRING" | "ERROR";

type PairingResponse = {
  readonly ok: true;
  readonly pairingCode: string;
  readonly expiresAt: string;
};

function minutesRemaining(expiresAt: string | null): string {
  if (!expiresAt) return "—";
  const remaining = Math.max(0, new Date(expiresAt).getTime() - Date.now());
  return `${Math.max(1, Math.ceil(remaining / 60_000))} MINUTES`;
}

export default function PairingPanel({ connectionStatus, pendingPairing, hasSnapshot }: PairingPanelProps) {
  const [state, setState] = useState<PairingState>("IDLE");
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connected = connectionStatus === "CONNECTED";
  const pairing = connectionStatus === "PAIRING";
  const canCreate = EMPTY_CONNECTION_STATES.has(connectionStatus);
  const displayedExpiry = useMemo(() => minutesRemaining(expiresAt), [expiresAt]);

  async function createPairing() {
    setState("CREATING");
    setError(null);
    setCopied(false);
    try {
      await ensureTenaxSession();
      const response = await fetch("/api/connected/pair", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("PAIRING_UNAVAILABLE");
      const payload = (await response.json()) as PairingResponse;
      setPairingCode(payload.pairingCode);
      setExpiresAt(payload.expiresAt);
      setState("PAIRING");
    } catch {
      setPairingCode(null);
      setExpiresAt(null);
      setState("ERROR");
      setError("Tenax could not create a pairing code. Try again when durable Connected Mode is available.");
    }
  }

  async function copyCode() {
    if (!pairingCode) return;
    try {
      await navigator.clipboard.writeText(pairingCode);
      setCopied(true);
    } catch {
      setError("Copy is unavailable in this browser. Select the code manually.");
    }
  }

  if (connected) {
    return (
      <div className="border-t border-ink/15 pt-4">
        <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-pass">CONNECTED · READ ONLY</p>
        <p className="mt-2 text-[15px] leading-[22px] text-mutedink">{hasSnapshot ? "This account is paired. The latest sanitized snapshot is shown above." : "This account is paired. Tenax is waiting for the first sanitized read only snapshot."}</p>
      </div>
    );
  }

  if (pairing) {
    return (
      <div className="border-t border-ink/15 pt-4">
        <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">PAIRING</p>
        <p className="mt-2 text-[15px] leading-[22px] text-mutedink">The local connector has paired. Tenax is waiting for the first sanitized read only snapshot.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 border-t border-ink/15 pt-4">
      {state === "PAIRING" && pairingCode ? (
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div>
            <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">PAIRING CODE</p>
            <p className="mt-2 break-all font-mono text-[24px] font-bold leading-[30px] tracking-[0.12em] text-ink sm:text-[30px]" aria-label="One-time pairing code">{pairingCode}</p>
            <p className="mt-2 text-[13px] leading-[18px] text-mutedink">Expires in ~{displayedExpiry.toLowerCase()}. Run the Tenax local connector and enter this code.</p>
          </div>
          <button type="button" onClick={copyCode} className="min-h-11 rounded-[10px] bg-ink px-5 py-3 text-[13px] font-bold leading-[18px] text-softwhite hover:bg-graphite">{copied ? "COPIED" : "COPY CODE"}</button>
        </div>
      ) : (
        <div>
          <p className="text-[16px] leading-[24px] text-mutedink">
            {pendingPairing ? "A previous code is active but is not shown again. Generate a new code to replace it." : "Create a short lived code to pair the local Tenax connector with this session."}
          </p>
          <button type="button" onClick={createPairing} disabled={!canCreate || state === "CREATING"} className="mt-4 min-h-11 rounded-[10px] bg-signal px-5 py-3 text-[13px] font-bold leading-[18px] text-ink disabled:cursor-wait disabled:opacity-60">
            {state === "CREATING" ? "CREATING PAIRING…" : pendingPairing ? "GENERATE NEW CODE" : "CONNECT BITGET"}
          </button>
        </div>
      )}
      {state === "PAIRING" && pairingCode ? (
        <button type="button" onClick={createPairing} className="self-start text-left font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink underline decoration-ink/30 underline-offset-4 hover:text-ink">GENERATE NEW CODE</button>
      ) : null}
      {state === "ERROR" || error ? <p role="alert" className="text-[13px] leading-[19px] text-clay">{error ?? "Pairing is unavailable."}</p> : null}
    </div>
  );
}
