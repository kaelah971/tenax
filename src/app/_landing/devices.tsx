// Landing device mockups — marketing representations of real Tenax product
// surfaces (Event Room, Final Tenax Decision, Decision Proof), not a separate
// fake product. Every value comes from the canonical demo fixtures and the
// deterministic Mandate Engine; nothing here is performance, profit or
// adoption data. Pure CSS device frames, server-rendered, zero client JS.
// Sizing is container-relative (em on a cqw-based scene font-size) so the
// whole composition scales fluidly without transforms or overflow.
import type { CSSProperties, ReactNode } from "react";

import { signalRailForAnalysis } from "@/app/app/_components/signal";
import type { MandateCheck, MandateDecision, ProtectionProposal } from "@/lib/tenax/domain";

export interface DeviceData {
  readonly exposureUsdt: number;
  readonly representation: string;
  readonly proposal: ProtectionProposal;
  readonly decision: MandateDecision;
  readonly maxPct: number;
  readonly maxTrade: number;
}

const CHECK_LABEL: Partial<Record<MandateCheck["id"], string>> = {
  underlying_allowed: "ASSET",
  max_protection_pct: "MAX HEDGE",
  max_trade_value: "MAX TRADE",
  max_leverage: "LEVERAGE",
};

function Phone({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={`tx-phone ${className}`} style={style}>
      <span className="tx-phone-btn tx-phone-btn-a" />
      <span className="tx-phone-btn tx-phone-btn-b" />
      <div className="tx-phone-screen">
        <span className="tx-phone-island" />
        <div className="tx-phone-status">
          <span>TENAX</span>
          <span className="tx-phone-status-signal">
            <i />
            <i />
            <i />
          </span>
        </div>
        <div className="tx-phone-body">{children}</div>
        <p className="tx-phone-foot">ILLUSTRATIVE · DEMO FIXTURE</p>
      </div>
    </div>
  );
}

function Row({ k, v, tone }: { k: string; v: string; tone?: "signal" | "clay" | "muted" }) {
  return (
    <div className="tx-ps-row">
      <span className="tx-ps-k">{k}</span>
      <span className={`tx-ps-v${tone ? ` tx-ps-${tone}` : ""}`}>{v}</span>
    </div>
  );
}

export function EventScreen({ data }: { data: DeviceData }) {
  return (
    <>
      <p className="tx-ps-label tx-ps-signal">● EVENT ROOM</p>
      <p className="tx-ps-title">NVIDIA EARNINGS</p>
      <p className="tx-ps-copy">Monitored against the capital you hold.</p>
      <div className="tx-ps-panel">
        <Row k="EXPOSURE" v={`$${data.exposureUsdt}`} />
        <Row k="REPRESENTATION" v={data.representation} />
        <Row k="POSITION" v="SIMULATED" tone="muted" />
        <Row k="EVENT DATE" v="UNVERIFIED" tone="clay" />
      </div>
      <div className="tx-ps-panel tx-ps-integrity">
        <p className="tx-ps-label">SOURCE INTEGRITY</p>
        <p className="tx-ps-copy">No date is inferred. Unverified events stay unverified.</p>
      </div>
      <span className="tx-ps-cta">PROTECT THIS EXPOSURE →</span>
    </>
  );
}

export function DecisionScreen({ data }: { data: DeviceData }) {
  const refused = data.decision.verdict === "REFUSE";
  const checks = data.decision.checks.filter((c) => CHECK_LABEL[c.id]);
  return (
    <>
      <div className="tx-ps-ai">
        <p className="tx-ps-tag tx-ps-tag-ai">AI · PROPOSES</p>
        <p className="tx-ps-proposal">
          PROTECT {data.proposal.protectionPct}% · ${data.proposal.proposedTradeValueUsdt}
        </p>
      </div>
      <p className="tx-ps-seam">IT CANNOT AUTHORIZE ITSELF</p>
      <div className={`tx-ps-authority${refused ? " tx-ps-authority-refused" : ""}`}>
        <p className="tx-ps-tag tx-ps-tag-authority">FINAL TENAX DECISION</p>
        <p className={`tx-ps-verdict ${refused ? "tx-ps-clay" : "tx-ps-signal"}`}>{data.decision.verdict}</p>
        <div className="tx-ps-checks">
          {checks.map((check) => (
            <div key={check.id} className="tx-ps-row">
              <span className="tx-ps-k">{CHECK_LABEL[check.id]}</span>
              <span className="tx-ps-v">
                {check.id === "max_protection_pct"
                  ? `${data.proposal.protectionPct}% / ${data.maxPct}%`
                  : check.id === "max_trade_value"
                    ? `$${data.proposal.proposedTradeValueUsdt} / $${data.maxTrade}`
                    : check.id === "max_leverage"
                      ? `${data.proposal.leverageUsed}x`
                      : data.proposal.underlying}
              </span>
              <span className={check.pass ? "tx-ps-ok" : "tx-ps-no"}>{check.pass ? "✓" : "✕"}</span>
            </div>
          ))}
        </div>
      </div>
      <ol className="tx-ps-rail" aria-hidden="true">
        {signalRailForAnalysis(refused ? "REFUSED" : "AUTHORIZED", data.decision.failedRules.length === 0).map((node) => (
          <li key={node.stage} className={`tx-rail-${node.state}`}>
            <span className="tx-signal-node" />
            {node.stage}
          </li>
        ))}
      </ol>
      <div className="tx-ps-panel">
        <p className="tx-ps-label">{refused ? "WHY IT STOPPED" : "NEXT AUTHORITY STEP"}</p>
        {data.decision.failedRules.map((rule) => (
          <Row key={rule} k={CHECK_LABEL[rule] ?? rule.toUpperCase()} v="REFUSED" tone="clay" />
        ))}
        <Row k="HUMAN APPROVAL" v={refused ? "NOT REACHABLE" : "REQUIRED"} tone="muted" />
      </div>
      <span className={`tx-ps-result${refused ? " tx-ps-result-refused" : ""}`}>
        {refused ? "NO ORDER SENT" : "APPROVAL STILL REQUIRED"}
      </span>
    </>
  );
}

export function ProofScreen({ data }: { data: DeviceData }) {
  const refused = data.decision.verdict === "REFUSE";
  const chain: ReadonlyArray<readonly [string, string, "signal" | "clay" | "muted" | undefined]> = [
    ["AI ANALYSIS", "RECORDED", undefined],
    ["AUTHORITY", data.decision.verdict, refused ? "clay" : "signal"],
    ["EXECUTION", refused ? "NOT REACHED" : "AWAITING APPROVAL", "muted"],
    ["RUN", "LINKED", undefined],
    ["PROOF", "RECORDED", "signal"],
  ];
  return (
    <>
      <p className="tx-ps-label tx-ps-signal">● DECISION PROOF</p>
      <p className="tx-ps-title">{refused ? "REFUSED" : "CLEARED"}</p>
      <p className="tx-ps-copy">{refused ? "Stopped at the authority layer." : "Mandate cleared. Human approval pending."}</p>
      <ol className="tx-ps-chain">
        {chain.map(([k, v, tone]) => (
          <li key={k}>
            <span className={`tx-ps-node${tone === "clay" ? " tx-ps-node-clay" : tone === "muted" ? " tx-ps-node-muted" : ""}`} />
            <span className="tx-ps-k">{k}</span>
            <span className={`tx-ps-v${tone ? ` tx-ps-${tone}` : ""}`}>{v}</span>
          </li>
        ))}
      </ol>
      <div className="tx-ps-panel">
        <Row k="PROPOSED" v={`$${data.proposal.proposedTradeValueUsdt}`} />
        <Row k="MANDATE MAX" v={`$${data.maxTrade}`} />
        <Row k="OUTCOME" v={refused ? "NO ORDER SENT" : "NO ORDER YET"} tone={refused ? "clay" : "muted"} />
      </div>
    </>
  );
}

const SCENE_LABEL =
  "Illustrative Tenax screens built from demo fixtures: Event Intelligence for NVIDIA earnings with an unverified date, the Final Tenax Decision refusing an AI proposal that exceeds the mandate, and the resulting Decision Proof.";

/** Closing CTA composition: decision + proof, rising out of the band. */
export function CtaDevices({ data }: { data: DeviceData }) {
  return (
    <div className="tx-device-stage" role="img" aria-label={SCENE_LABEL}>
      <div className="tx-device-scene tx-device-scene-cta" aria-hidden="true">
        <span className="tx-scene-floor" />
        <span className="tx-orbit tx-orbit-back" />
        <Phone className="tx-phone-d">
          <ProofScreen data={data} />
        </Phone>
        <Phone className="tx-phone-e">
          <DecisionScreen data={data} />
        </Phone>
        <span className="tx-orbit tx-orbit-front" />
      </div>
    </div>
  );
}
