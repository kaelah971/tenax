// Tenax Obsidian Signal visual system — pure display contracts.
// Offline, zero network: the signal rail, environment routing and outcome
// tones must reflect only state the caller already holds.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { PROOF_KINDS } from "../src/lib/proof/model";
import {
  outcomeBadgeClass,
  outcomeSurfaceClass,
  SIGNAL_STAGES,
  signalRailForAnalysis,
  signalRailForProof,
  signalRailForReceipt,
  signalRailForRun,
  type SignalNode,
} from "../src/app/app/_components/signal";
import { SIGNAL_FIELD_VARIANTS, signalFieldForPath } from "../src/app/app/_components/signal-field";

const at = (nodes: SignalNode[], stage: (typeof SIGNAL_STAGES)[number]) => nodes.find((n) => n.stage === stage)!;

describe("signal rail", () => {
  it("always renders the five stages in order", () => {
    for (const kind of PROOF_KINDS) {
      expect(signalRailForProof(kind).map((n) => n.stage)).toEqual([...SIGNAL_STAGES]);
    }
  });

  it("never shows execution for refused, escalated or review proofs", () => {
    for (const kind of ["AUTHORITY_REFUSED", "POLICY_REFUSED", "AUTHORITY_ESCALATED", "REVIEW_REQUIRED"] as const) {
      expect(at(signalRailForProof(kind), "EXECUTION").state).toBe("skipped");
    }
    expect(at(signalRailForProof("POLICY_REFUSED"), "POLICY")).toMatchObject({ state: "stopped", word: "REFUSED" });
    expect(at(signalRailForProof("AUTHORITY_REFUSED"), "AUTHORITY")).toMatchObject({ state: "stopped", word: "REFUSED" });
    expect(at(signalRailForProof("AUTHORITY_ESCALATED"), "AUTHORITY").state).toBe("held");
    expect(at(signalRailForProof("EXECUTION_FILLED"), "EXECUTION")).toMatchObject({ state: "exec", word: "FILLED" });
    expect(at(signalRailForProof("EXECUTION_FAILED"), "EXECUTION").state).toBe("stopped");
  });

  it("marks run proof recorded only when a proof is linked", () => {
    expect(at(signalRailForRun("REFUSED", "NO_ORDER", false), "PROOF").state).toBe("pending");
    expect(at(signalRailForRun("REFUSED", "NO_ORDER", true), "PROOF").state).toBe("done");
    expect(at(signalRailForRun("EXECUTED", "SUBMITTED", true), "EXECUTION").word).toBe("SUBMITTED");
  });

  it("never claims execution or proof from an analysis", () => {
    for (const state of ["AUTHORIZED", "REFUSED", "ESCALATE", "NO_MANDATE", "UNKNOWN", "WAIT", "NO_ACTION"] as const) {
      const nodes = signalRailForAnalysis(state, true);
      expect(["pending", "skipped"]).toContain(at(nodes, "EXECUTION").state);
      expect(at(nodes, "PROOF").state).toBe("pending");
    }
    expect(at(signalRailForAnalysis("REFUSED", false), "POLICY").state).toBe("stopped");
    expect(at(signalRailForAnalysis("REFUSED", true), "AUTHORITY").state).toBe("stopped");
  });

  it("a dry-run receipt never reads as a fill", () => {
    const nodes = signalRailForReceipt({ mode: "DRY_RUN", filled: false, hasProof: false });
    expect(at(nodes, "EXECUTION").word).toBe("DRY RUN · NOT SUBMITTED");
    expect(at(nodes, "PROOF")).toMatchObject({ state: "pending", word: "SESSION ONLY" });
  });
});

describe("semantic outcome tones", () => {
  it("refusal is coral, escalation/review amber, execution blue", () => {
    expect(outcomeBadgeClass("refused")).toContain("bg-clay");
    expect(outcomeBadgeClass("escalated")).toContain("bg-amber");
    expect(outcomeBadgeClass("review")).toContain("bg-amber");
    expect(outcomeBadgeClass("done")).toContain("bg-exec");
    expect(outcomeSurfaceClass("failed")).toBe("surface-refuse");
  });

  it("escalation and review never borrow the authority green", () => {
    for (const tone of ["escalated", "review"] as const) {
      expect(outcomeBadgeClass(tone)).not.toContain("signal");
    }
  });
});

describe("signal field environment", () => {
  it("maps every app route family to a defined variant", () => {
    const cases: Array<[string, string]> = [
      ["/app", "dashboard"],
      ["/app/exposure/nvidia", "dashboard"],
      ["/app/events", "event"],
      ["/app/protect/nvidia", "protect"],
      ["/app/analysis/flow-0001", "analysis"],
      ["/app/approval/flow-0001", "authority"],
      ["/app/mandate", "authority"],
      ["/app/proof", "proof"],
      ["/app/proof/x", "proof"],
      ["/app/receipts/flow-0001", "proof"],
      ["/app/paper-trading/run-1", "proof"],
    ];
    for (const [path, variant] of cases) expect(signalFieldForPath(path)).toBe(variant);
    for (const variant of SIGNAL_FIELD_VARIANTS) {
      expect(readFileSync("src/app/globals.css", "utf8")).toContain(`.tx-field--${variant}`);
    }
  });

  it("is shared by the landing page and the app shell", () => {
    expect(readFileSync("src/app/page.tsx", "utf8")).toContain('<SignalField variant="landing" />');
    expect(readFileSync("src/app/app/layout.tsx", "utf8")).toContain("<AppSignalField />");
  });
});

describe("centralized material tokens", () => {
  const css = readFileSync("src/app/globals.css", "utf8");

  it("defines the Obsidian Signal palette once in the theme", () => {
    for (const token of ["#050706", "#63ff2a", "#8b7cff", "#4cc9ff", "#ff665f", "#ffb454", "#66f2a2"]) {
      expect(css).toContain(token);
    }
  });

  it("exposes the shared surface levels and semantic blooms", () => {
    for (const cls of [
      ".surface-structural",
      ".surface-glass",
      ".surface-glass-raised",
      ".surface-focus",
      ".surface-ai",
      ".surface-authority",
      ".surface-exec",
      ".surface-review",
      ".surface-refuse",
      ".surface-proof",
    ]) {
      expect(css).toContain(cls);
    }
  });

  it("ships no raster backgrounds or video for the environment", () => {
    expect(css).not.toMatch(/url\(["']?\/[^)]*\.(png|jpe?g|webp|mp4|webm)/i);
  });
});
