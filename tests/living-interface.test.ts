// Tenax Phase 1E-C — living-interface contracts (no network, no browser).
//
// Pins the Sentinel's pure state mapping and stagger helper. Rendering is
// covered by typecheck + production build; financial, mandate, and
// provenance behavior is unchanged and covered by the existing suites.
import { describe, expect, it } from "vitest";

import { agentPresence, staggerStyle, TENAX_AGENT_ASSET, type AgentState } from "../src/app/app/_components/living";
import { materialClass, OBSERVATORY_SCENE_ORDER } from "../src/app/app/_components/materials";

const STATES: AgentState[] = [
  "idle",
  "watching",
  "analyzing",
  "gate-check",
  "waiting",
  "approved",
  "refused",
  "complete",
];

describe("tenax sentinel presence", () => {
  it("maps every state to an expressive, labeled presence", () => {
    for (const state of STATES) {
      const presence = agentPresence(state);
      expect(presence.label.length).toBeGreaterThan(0);
      expect(["soft", "open", "narrow", "half", "happy", "flat", "calm"]).toContain(presence.eyes);
      expect(["dim", "signal", "clay"]).toContain(presence.glow);
    }
  });

  it("waits visibly distinct from idle and watching", () => {
    expect(agentPresence("waiting")).toMatchObject({ eyes: "half", glow: "dim", label: "WAITING" });
    expect(agentPresence("idle")).toMatchObject({ eyes: "soft", label: "IDLE" });
    expect(agentPresence("watching")).toMatchObject({ eyes: "open", glow: "signal" });
  });

  it("keeps refusal visually distinct from approval", () => {
    expect(agentPresence("refused")).toMatchObject({ eyes: "flat", glow: "clay" });
    expect(agentPresence("approved")).toMatchObject({ eyes: "happy", glow: "signal" });
    expect(agentPresence("refused").glow).not.toBe(agentPresence("approved").glow);
  });

  it("keeps mascot state expression free of decorative orbit graphics", () => {
    for (const state of STATES) {
      expect("orbit" in agentPresence(state)).toBe(false);
    }
  });

  it("falls back to idle presence on unknown states", () => {
    expect(agentPresence("idle")).toMatchObject({ eyes: "soft", glow: "dim", label: "IDLE" });
  });
});

describe("agent asset contract", () => {
  it("points at the brand asset path the component expects", () => {
    expect(TENAX_AGENT_ASSET).toBe("/brand/tenax-agent.png");
  });
});

describe("stagger helper", () => {
  it("assigns the sequence index as a CSS custom property", () => {
    expect(staggerStyle(0)).toMatchObject({ "--i": 0 });
    expect(staggerStyle(4)).toMatchObject({ "--i": 4 });
  });
});

describe("observatory material contract", () => {
  it("keeps the five spatial roles distinct", () => {
    expect(materialClass("editorial")).toBe("tx-material-editorial");
    expect(materialClass("light-frost")).toBe("tx-material-light-frost");
    expect(materialClass("clear-instrument")).toBe("tx-material-clear-instrument");
    expect(materialClass("authority")).toBe("tx-material-authority");
    expect(materialClass("critical")).toBe("tx-material-critical");
    expect(new Set([
      materialClass("editorial"),
      materialClass("light-frost"),
      materialClass("clear-instrument"),
      materialClass("authority"),
      materialClass("critical"),
    ]).size).toBe(5);
  });

  it("defines the observatory reading order", () => {
    expect(OBSERVATORY_SCENE_ORDER).toEqual([
      "editorial",
      "observation",
      "authority",
      "control",
      "witness",
    ]);
  });
});
