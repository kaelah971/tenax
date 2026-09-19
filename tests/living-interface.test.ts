// Tenax Phase 1E-C — living-interface contracts (no network, no browser).
//
// Pins the Sentinel's pure state mapping and stagger helper. Rendering is
// covered by typecheck + production build; financial, mandate, and
// provenance behavior is unchanged and covered by the existing suites.
import { describe, expect, it } from "vitest";

import { agentPresence, staggerStyle, type AgentState } from "../src/app/app/_components/living";

const STATES: AgentState[] = [
  "idle",
  "watching",
  "analyzing",
  "gate-check",
  "approved",
  "refused",
  "complete",
];

describe("tenax sentinel presence", () => {
  it("maps every state to an expressive, labeled presence", () => {
    for (const state of STATES) {
      const presence = agentPresence(state);
      expect(presence.label.length).toBeGreaterThan(0);
      expect(["soft", "open", "narrow", "happy", "flat", "calm"]).toContain(presence.eyes);
      expect(["dim", "signal", "clay"]).toContain(presence.glow);
    }
  });

  it("keeps refusal visually distinct from approval", () => {
    expect(agentPresence("refused")).toMatchObject({ eyes: "flat", glow: "clay" });
    expect(agentPresence("approved")).toMatchObject({ eyes: "happy", glow: "signal" });
    expect(agentPresence("refused").glow).not.toBe(agentPresence("approved").glow);
  });

  it("reserves orbital motion for the analyzing state only", () => {
    expect(agentPresence("analyzing").orbit).toBe(true);
    for (const state of STATES.filter((s) => s !== "analyzing")) {
      expect(agentPresence(state).orbit).toBe(false);
    }
  });

  it("falls back to idle presence on unknown states", () => {
    expect(agentPresence("idle")).toMatchObject({ eyes: "soft", glow: "dim", label: "IDLE" });
  });
});

describe("stagger helper", () => {
  it("assigns the sequence index as a CSS custom property", () => {
    expect(staggerStyle(0)).toMatchObject({ "--i": 0 });
    expect(staggerStyle(4)).toMatchObject({ "--i": 4 });
  });
});
