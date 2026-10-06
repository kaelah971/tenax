import Link from "next/link";

export default function ConnectedPage() {
  return (
    <div className="tx-connected tx-observatory-entry flex flex-col gap-6 pt-6 sm:gap-7 sm:pt-8">
      <section className="tx-material-editorial border-t-2 border-ink px-1 pb-1 pt-6 sm:px-5 sm:pt-8">
        <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
          PERSONAL BITGET ACCOUNTS
        </p>
        <div className="mt-3 grid gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(280px,0.65fr)] sm:items-end sm:gap-8">
          <div>
            <h1 className="tx-connected-display max-w-2xl text-[clamp(2.75rem,5vw,3.75rem)] font-semibold leading-[0.92] tracking-[-0.02em] text-balance">
              Bring your own portfolio into Tenax.
            </h1>
            <p className="mt-4 font-syslabel text-[12px] uppercase leading-[18px] tracking-[0.08em] text-signal">
              COMING SOON — HOSTED CONNECTION
            </p>
            <p className="mt-4 max-w-xl text-[16px] leading-[24px] text-mutedink">
              Tenax plans to support a browser-native hosted account connection. No installation is required for the main Tenax experience.
            </p>
          </div>
          <div className="border-t border-ink/20 pt-3 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
            <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
              ACCOUNT ACCESS
            </p>
            <p className="tx-connected-display mt-2 text-[28px] font-semibold leading-none tracking-[-0.01em] sm:text-[32px]">HOSTED</p>
            <p className="mt-2 text-[13px] leading-[18px] text-mutedink">
              Personal-account trading is not enabled.
            </p>
          </div>
        </div>
      </section>

      <section className="tx-material-authority rounded-[18px] p-4 sm:p-6">
        <div className="grid gap-6 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] sm:gap-8">
          <div>
            <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-signal">TENAX NOW</p>
            <h2 className="tx-connected-display mt-2 text-[clamp(2rem,4vw,2.75rem)] font-semibold leading-[0.96] tracking-[-0.02em]">Explore bounded protection now.</h2>
            <p className="mt-3 max-w-md text-[15px] leading-[22px] text-softwhite/70 sm:text-[16px] sm:leading-[24px]">
              The main Tenax experience is ready through simulated NVIDIA exposure, shared Bitget Demo capital, deterministic mandates, and durable decision proof.
            </p>
          </div>
          <div className="flex flex-wrap content-start gap-3 border-t border-softwhite/15 pt-4 sm:border-t-0 sm:pt-0">
            <Link
              href="/app/protect/nvidia"
              className="btn-living inline-flex min-h-11 items-center justify-center rounded-[9px] bg-signal px-4 py-3 text-[12px] font-bold leading-[16px] text-ink hover:brightness-95"
            >
              LAUNCH NVIDIA PROTECTION <span className="btn-arrow ml-1" aria-hidden="true">→</span>
            </Link>
            <Link
              href="/app/mandate"
              className="inline-flex min-h-11 items-center justify-center rounded-[9px] border border-softwhite/30 px-4 py-3 text-[12px] font-bold leading-[16px] text-softwhite hover:border-signal hover:text-signal"
            >
              VIEW STANDING MANDATE
            </Link>
            <Link
              href="/app/proof"
              className="inline-flex min-h-11 items-center justify-center rounded-[9px] border border-softwhite/30 px-4 py-3 text-[12px] font-bold leading-[16px] text-softwhite hover:border-signal hover:text-signal"
            >
              VIEW VERIFIED DECISIONS
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
