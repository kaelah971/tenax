"use client";

import { useState } from "react";

import { ensureTenaxSession } from "../_components/SessionBootstrap";

type DisconnectButtonProps = {
  readonly disabled?: boolean;
};

export default function DisconnectButton({ disabled = false }: DisconnectButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function disconnect() {
    setBusy(true);
    setError(false);
    try {
      await ensureTenaxSession();
      const response = await fetch("/api/connected/disconnect", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("DISCONNECT_FAILED");
      window.location.reload();
    } catch {
      setBusy(false);
      setError(true);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={disconnect}
        disabled={disabled || busy}
        className="min-h-11 rounded-[10px] border border-ink/25 px-5 py-3 font-syslabel text-[11px] font-bold uppercase tracking-[0.08em] text-ink transition-colors hover:border-ink hover:bg-ink hover:text-softwhite disabled:cursor-wait disabled:opacity-60"
      >
        {busy ? "DISCONNECTING…" : "DISCONNECT BITGET"}
      </button>
      {error ? <p role="alert" className="text-[12px] leading-[17px] text-clay">Tenax could not disconnect this connection. Try again.</p> : null}
    </div>
  );
}
