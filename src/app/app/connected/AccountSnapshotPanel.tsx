import DisconnectButton from "./DisconnectButton";
import type { AccountSnapshot } from "@/lib/connected/model";
import {
  connectedAccountStateLabel,
  type ConnectedAccountViewState,
} from "@/lib/connected/presentation";

type AccountSnapshotPanelProps = {
  readonly snapshot: AccountSnapshot | null;
  readonly viewState: ConnectedAccountViewState;
  readonly hasConnection: boolean;
};

function shown(value: string | null): string {
  return value ?? "—";
}

function timestamp(value: string | null): string {
  if (!value) return "NOT YET SYNCED";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "UNKNOWN" : `${parsed.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function stateTone(state: ConnectedAccountViewState): string {
  if (state === "CONNECTED") return "text-pass";
  if (state === "SYNC_STALE" || state === "AWAITING_FIRST_SYNC") return "text-signal";
  if (state === "ERROR" || state === "DISCONNECTED") return "text-clay";
  return "text-mutedink";
}

export default function AccountSnapshotPanel({ snapshot, viewState, hasConnection }: AccountSnapshotPanelProps) {
  const assets = snapshot?.assets ?? [];
  const positions = snapshot?.positions ?? [];
  const showAvailable = assets.some((asset) => asset.available !== null);
  const showFrozen = assets.some((asset) => asset.frozen !== null);
  const showEquity = assets.some((asset) => asset.equity !== null || asset.usdValue !== null);
  const showSide = positions.some((position) => position.side !== null);
  const showSize = positions.some((position) => position.size !== null);
  const showEntry = positions.some((position) => position.entryPrice !== null);
  const showMark = positions.some((position) => position.markPrice !== null);
  const showLeverage = positions.some((position) => position.leverage !== null);
  const showPnl = positions.some((position) => position.unrealizedPnl !== null);

  return (
    <section className="tx-material-light-frost rounded-[16px] p-5 sm:p-8" aria-labelledby="connected-account-heading">
      <div className="flex flex-wrap items-start justify-between gap-5 border-b border-ink/15 pb-5">
        <div>
          <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">{viewState === "DISCONNECTED" ? "BITGET DISCONNECTED" : "CONNECTED ACCOUNT · YOUR BITGET DATA"}</p>
          <h2 id="connected-account-heading" className="mt-2 text-[32px] font-extrabold leading-[0.98] tracking-[-0.03em] sm:text-[46px]">{viewState === "DISCONNECTED" ? "BITGET DISCONNECTED" : "BITGET"}</h2>
        </div>
        <div className="flex flex-col items-end gap-3">
          <p className={`font-syslabel text-right text-[11px] uppercase leading-[14px] tracking-[0.08em] ${stateTone(viewState)}`}>
            {connectedAccountStateLabel(viewState)}
          </p>
          {hasConnection && viewState !== "DISCONNECTED" && viewState !== "NOT_CONNECTED" ? <DisconnectButton /> : null}
        </div>
      </div>

      <dl className="grid gap-0 border-b border-ink/15 sm:grid-cols-3">
        <div className="border-b border-ink/15 py-4 sm:border-r sm:pr-5">
          <dt className="font-syslabel text-[10px] uppercase tracking-[0.08em] text-mutedink">PROVIDER</dt>
          <dd className="mt-2 text-[18px] font-bold">BITGET</dd>
        </div>
        <div className="border-b border-ink/15 py-4 sm:border-r sm:px-5">
          <dt className="font-syslabel text-[10px] uppercase tracking-[0.08em] text-mutedink">TENAX ACCESS</dt>
          <dd className="mt-2 text-[18px] font-bold">{viewState === "DISCONNECTED" ? "NO ACTIVE SYNC" : "READ ONLY"}</dd>
        </div>
        <div className="py-4 sm:pl-5">
          <dt className="font-syslabel text-[10px] uppercase tracking-[0.08em] text-mutedink">LAST SYNC</dt>
          <dd className="mt-2 text-[15px] font-bold leading-[20px]">{timestamp(snapshot?.syncedAt ?? null)}</dd>
        </div>
      </dl>

      {!snapshot ? (
        <div className="mt-6 border-l-2 border-signal bg-signal/10 p-5">
          <p className="font-syslabel text-[11px] uppercase tracking-[0.08em] text-ink">{viewState === "NOT_CONNECTED" ? "NOT CONNECTED" : connectedAccountStateLabel(viewState)}</p>
          <p className="mt-2 max-w-xl text-[14px] leading-[21px] text-mutedink">
            {viewState === "DISCONNECTED"
              ? "Tenax can no longer accept snapshots from this connection. Local Bitget credentials may still exist on the connector device."
              : viewState === "NOT_CONNECTED"
                ? "Create a pairing code above to connect your local Bitget connector. No balances or positions are fabricated here."
                : viewState === "ERROR"
                  ? "Connected Mode is temporarily unavailable. No balances or positions are fabricated here."
                  : "Your local connector has not uploaded a sanitized account snapshot yet. No balances or positions are fabricated here."}
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-8">
          {viewState === "SYNC_STALE" ? (
            <div className="border-l-2 border-signal bg-signal/10 p-4">
              <p className="font-syslabel text-[11px] uppercase tracking-[0.08em] text-ink">SYNC STALE · LAST KNOWN DATA RETAINED</p>
              <p className="mt-1 text-[13px] leading-[19px] text-mutedink">The last trustworthy snapshot remains visible. Run the local connector again to refresh it.</p>
            </div>
          ) : null}

          <section aria-labelledby="connected-assets-heading">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h3 id="connected-assets-heading" className="font-syslabel text-[11px] uppercase tracking-[0.08em] text-mutedink">ACCOUNT / ASSETS</h3>
              <span className="font-syslabel text-[11px] uppercase tracking-[0.08em] text-mutedink">{assets.length} ASSET{assets.length === 1 ? "" : "S"}</span>
            </div>
            {assets.length === 0 ? (
              <p className="mt-4 border border-ink/15 p-4 text-[14px] leading-[21px] text-mutedink">No asset rows were returned by Bitget in the latest snapshot.</p>
            ) : (
              <div className="mt-3 overflow-x-auto border-y border-ink/15">
                <table className="w-full min-w-[520px] text-left text-[13px]">
                  <thead className="font-syslabel text-[10px] uppercase tracking-[0.08em] text-mutedink">
                    <tr>
                      <th className="px-3 py-3 font-normal">ASSET</th>
                      {showAvailable ? <th className="px-3 py-3 text-right font-normal">AVAILABLE</th> : null}
                      {showFrozen ? <th className="px-3 py-3 text-right font-normal">FROZEN</th> : null}
                      {showEquity ? <th className="px-3 py-3 text-right font-normal">EQUITY / VALUE</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {assets.map((asset) => (
                      <tr key={asset.asset} className="border-t border-ink/10">
                        <th scope="row" className="px-3 py-3 font-bold">{asset.asset}</th>
                        {showAvailable ? <td className="px-3 py-3 text-right font-mono">{shown(asset.available)}</td> : null}
                        {showFrozen ? <td className="px-3 py-3 text-right font-mono">{shown(asset.frozen)}</td> : null}
                        {showEquity ? <td className="px-3 py-3 text-right font-mono">{shown(asset.equity ?? asset.usdValue)}</td> : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-labelledby="connected-positions-heading">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h3 id="connected-positions-heading" className="font-syslabel text-[11px] uppercase tracking-[0.08em] text-mutedink">POSITIONS</h3>
              <span className="font-syslabel text-[11px] uppercase tracking-[0.08em] text-mutedink">{positions.length} POSITION{positions.length === 1 ? "" : "S"}</span>
            </div>
            {positions.length === 0 ? (
              <p className="mt-4 border border-ink/15 p-4 text-[14px] leading-[21px] text-mutedink">No positions were returned by Bitget in the latest snapshot.</p>
            ) : (
              <div className="mt-3 overflow-x-auto border-y border-ink/15">
                <table className="w-full min-w-[680px] text-left text-[13px]">
                  <thead className="font-syslabel text-[10px] uppercase tracking-[0.08em] text-mutedink">
                    <tr>
                      <th className="px-3 py-3 font-normal">SYMBOL</th>
                      {showSide ? <th className="px-3 py-3 font-normal">SIDE</th> : null}
                      {showSize ? <th className="px-3 py-3 text-right font-normal">SIZE</th> : null}
                      {showEntry ? <th className="px-3 py-3 text-right font-normal">ENTRY</th> : null}
                      {showMark ? <th className="px-3 py-3 text-right font-normal">MARK</th> : null}
                      {showLeverage ? <th className="px-3 py-3 text-right font-normal">LEVERAGE</th> : null}
                      {showPnl ? <th className="px-3 py-3 text-right font-normal">UNREALIZED PNL</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((position, index) => (
                      <tr key={`${position.symbol}-${position.side ?? "unknown"}-${index}`} className="border-t border-ink/10">
                        <th scope="row" className="px-3 py-3 font-bold">{position.symbol}</th>
                        {showSide ? <td className="px-3 py-3 uppercase">{shown(position.side)}</td> : null}
                        {showSize ? <td className="px-3 py-3 text-right font-mono">{shown(position.size)}</td> : null}
                        {showEntry ? <td className="px-3 py-3 text-right font-mono">{shown(position.entryPrice)}</td> : null}
                        {showMark ? <td className="px-3 py-3 text-right font-mono">{shown(position.markPrice)}</td> : null}
                        {showLeverage ? <td className="px-3 py-3 text-right font-mono">{shown(position.leverage)}</td> : null}
                        {showPnl ? <td className="px-3 py-3 text-right font-mono">{shown(position.unrealizedPnl)}</td> : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
