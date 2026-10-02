// Tenax Connected Mode — authenticated personal account and pairing surface.
// Provider credentials remain on the local connector; this page reads only the
// current browser session's sanitized snapshot.
import Link from "next/link";

import AccountSnapshotPanel from "./AccountSnapshotPanel";
import PairingPanel from "./PairingPanel";
import { connectedAccountStateLabel, connectedAccountViewState } from "@/lib/connected/presentation";
import type { ConnectedAccountOverview } from "@/lib/connected/model";
import { getCurrentConnectedSession } from "@/lib/connected/session";

export const dynamic = "force-dynamic";

function sessionState(status: Awaited<ReturnType<typeof getCurrentConnectedSession>>["status"]): {
  label: string;
  detail: string;
} {
  switch (status) {
    case "READY":
      return {
        label: "SESSION READY",
        detail: "Server-derived identity is active for this browser.",
      };
    case "UNAVAILABLE":
      return {
        label: "SESSION UNAVAILABLE",
        detail: "Connected Mode needs durable PostgreSQL state before personal data can be shown.",
      };
    case "INVALID_COOKIE":
      return {
        label: "SESSION REFRESHING",
        detail: "The previous session is no longer valid. Tenax will establish a new server session.",
      };
    default:
      return {
        label: "SESSION INITIALIZING",
        detail: "Tenax is establishing a server-side identity. No account data is loaded yet.",
      };
  }
}

export default async function ConnectedPage() {
  const currentSession = await getCurrentConnectedSession();
  const state = sessionState(currentSession.status);
  let connectionStatus = "NOT_CONNECTED";
  let pendingPairing = false;
  let overview: ConnectedAccountOverview | null = null;

  if (currentSession.status === "READY") {
    try {
      const [accountOverview, pairing] = await Promise.all([
        currentSession.repository.getAccountOverviewByTokenHash(currentSession.tokenHash),
        currentSession.repository.getCurrentPairingForSession({
          userId: currentSession.session.userId,
          sessionId: currentSession.session.id,
        }),
      ]);
      overview = accountOverview;
      connectionStatus = overview?.connection?.status ?? "NOT_CONNECTED";
      pendingPairing = pairing !== null;
    } catch {
      connectionStatus = "ERROR";
    }
  }

  const accountViewState = connectedAccountViewState({
    connectionStatus,
    hasSnapshot: overview?.latestSnapshot !== null && overview?.latestSnapshot !== undefined,
    syncedAt: overview?.latestSnapshot?.syncedAt ?? null,
  });
  const accountStateLabel = connectedAccountStateLabel(accountViewState);
  const privateDataLabel = overview?.latestSnapshot
    ? "RECEIVED · SANITIZED"
    : overview?.connection
      ? "AWAITING FIRST SYNC"
      : "NOT RECEIVED";

  return (
    <div className="tx-observatory-entry flex flex-col gap-8 pt-7 sm:gap-10 sm:pt-10">
      <section className="tx-material-editorial border-t-2 border-ink px-1 pb-2 pt-8 sm:px-5 sm:pt-12">
        <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
          CONNECTED_001 · PERSONAL ACCOUNT
        </p>
        <div className="mt-4 grid gap-8 sm:grid-cols-[minmax(0,1fr)_minmax(280px,0.65fr)] sm:items-end sm:gap-12">
          <div>
            <h1 className="max-w-3xl text-[42px] font-extrabold leading-[0.93] tracking-[-0.04em] sm:text-[78px]">
              Your account. Your boundary.
            </h1>
            <p className="mt-5 max-w-xl text-[16px] leading-[24px] text-mutedink">
              Connected Mode is the private view for your Bitget Agentic account. Tenax will receive only sanitized account information; provider credentials stay on your local connector.
            </p>
          </div>
          <div className="border-t border-ink/20 pt-3 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
            <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
              TENAX ACCESS
            </p>
            <p className="mt-2 text-[30px] font-extrabold leading-none tracking-[-0.03em]">READ ONLY</p>
            <p className="mt-2 text-[12px] leading-[17px] text-mutedink">
              No connected-user trading or autonomous execution is available.
            </p>
          </div>
        </div>
      </section>

      <nav aria-label="Product mode" className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/app"
          className="tx-material-light-frost rounded-[12px] p-4 transition-transform hover:-translate-y-0.5 sm:p-5"
        >
          <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">DEMO MODE</p>
          <p className="mt-2 text-[22px] font-bold leading-[24px]">Explore shared Demo capital <span aria-hidden="true">→</span></p>
          <p className="mt-2 text-[12px] leading-[17px] text-mutedink">Instant judge experience · virtual funds · unchanged.</p>
        </Link>
        <div className="rounded-[12px] border-2 border-ink bg-signal p-4 text-ink sm:p-5">
          <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em]">CONNECTED MODE</p>
          <p className="mt-2 text-[22px] font-bold leading-[24px]">Private account boundary</p>
          <p className="mt-2 text-[12px] leading-[17px]">This session never reads the shared Demo account.</p>
        </div>
      </nav>

      <section className="tx-material-authority rounded-[18px] p-5 sm:p-8">
        <div className="grid gap-8 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] sm:gap-12">
          <div>
            <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-signal">ACCOUNT BOUNDARY</p>
            <h2 className="mt-3 text-[36px] font-extrabold leading-[0.95] tracking-[-0.04em] sm:text-[52px]">One session.<br />One account.</h2>
            <p className="mt-4 max-w-md text-[14px] leading-[21px] text-softwhite/70">
              Account-dependent records are owned through the server session, never through a user id or connection id supplied by the browser.
            </p>
          </div>
          <dl className="grid gap-0 border-t border-softwhite/15">
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-softwhite/15 py-4">
              <dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/55">CONNECTION STATE</dt>
              <dd className="text-right text-[18px] font-bold leading-[22px]">{accountStateLabel}</dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-softwhite/15 py-4">
              <dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/55">TENAX SESSION</dt>
              <dd className="text-right text-[18px] font-bold leading-[22px] text-signal">{state.label}</dd>
              <dd className="basis-full text-right text-[12px] leading-[17px] text-softwhite/60">{state.detail}</dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-softwhite/15 py-4">
              <dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/55">PROVIDER TRADE CAPABILITY</dt>
              <dd className="text-right text-[18px] font-bold leading-[22px]">UNKNOWN</dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-3 py-4">
              <dt className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-softwhite/55">PRIVATE DATA</dt>
              <dd className="text-right text-[18px] font-bold leading-[22px]">{privateDataLabel}</dd>
            </div>
          </dl>
        </div>
      </section>

      <AccountSnapshotPanel
        snapshot={overview?.latestSnapshot ?? null}
        viewState={accountViewState}
        hasConnection={overview?.connection !== null && overview?.connection !== undefined}
      />

      <section className="tx-material-light-frost rounded-[16px] p-5 sm:p-8">
        <div>
          <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">CONNECT BITGET</p>
          <h2 className="mt-2 text-[32px] font-extrabold leading-[0.98] tracking-[-0.03em] sm:text-[46px]">Pair locally. Keep keys local.</h2>
          <p className="mt-4 max-w-2xl text-[15px] leading-[22px] text-mutedink">
            This code authorizes one connector pairing to this Tenax session. It expires quickly, works once, and does not perform OAuth or receive provider credentials.
          </p>
          <div className="mt-6">
            <PairingPanel
              connectionStatus={connectionStatus}
              pendingPairing={pendingPairing}
              hasSnapshot={overview?.latestSnapshot !== null && overview?.latestSnapshot !== undefined}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
