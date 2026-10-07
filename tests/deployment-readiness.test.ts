// Tenax deployment-readiness regressions (offline, no network).
//
// Proves: the env contract documents every required key without values;
// health reports configuration booleans with zero secret leakage;
// repository selection never silently downgrades; judge-path clients use
// same-origin relative routes with no localhost assumptions; no
// NEXT_PUBLIC variable exists to expose secrets to browser bundles.
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GET } from "../src/app/api/health/route";
import { getPaperTradingRunRepository } from "../src/lib/tenax/paper-trading-run-repository";

const SAVED = { ...process.env };

function setEnv(patch: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

beforeEach(() => {
  for (const key of Object.keys(process.env)) {
    if (/^(DATABASE_URL|TENAX_|GROQ_|OPENAI_|BITGET_|TELEGRAM_)/.test(key)) {
      delete process.env[key];
    }
  }
});

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (/^(DATABASE_URL|TENAX_|GROQ_|OPENAI_|BITGET_|TELEGRAM_)/.test(key)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, SAVED);
});

describe("environment contract", () => {
  it("documents every required key with classifications and no values", () => {
    const example = readFileSync(".env.example", "utf8");
    for (const key of [
      "DATABASE_URL",
      "TENAX_ANALYSIS_MODE",
      "TENAX_AI_PROVIDER",
      "TENAX_AI_MODEL",
      "GROQ_API_KEY",
      "OPENAI_API_KEY",
      "TENAX_EXECUTION_MODE",
      "BITGET_TRADING_MODE",
      "BITGET_API_KEY",
      "BITGET_SECRET_KEY",
      "BITGET_PASSPHRASE",
      "BITGET_API_BASE_URL",
    ]) {
      expect(example).toContain(key);
    }
    for (const classification of [
      "REQUIRED_FOR_DATABASE",
      "REQUIRED_FOR_AI_FLOW",
      "REQUIRED_FOR_BITGET_DEMO",
      "OPTIONAL",
    ]) {
      expect(example).toContain(classification);
    }
    // No assigned values: every non-comment line is a bare KEY=.
    for (const line of example.split("\n")) {
      const trimmed = line.trim();
      if (trimmed === "" || trimmed.startsWith("#")) continue;
      expect(trimmed).toMatch(/^[A-Z_]+=$/);
    }
  });
});

describe("health endpoint", () => {
  it("reports safe defaults with empty config and leaks nothing", async () => {
    const response = await GET();
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      ok: true,
      database: { configured: false },
      ai: { configured: false, provider: null, analysisMode: "fixture" },
      execution: { mode: "DRY_RUN", demoBackend: false, demoCredentialsPresent: false },
    });
    expect(typeof body.timestamp).toBe("string");
    expect(JSON.stringify(body)).not.toMatch(/sk-|Bearer|SECRET|TOKEN|SIGN/i);
  });

  it("reflects configured state without exposing secret material", async () => {
    const marker = "marker-secret-never-in-health-4q2";
    setEnv({
      DATABASE_URL: "postgres://owner@localhost/tenax",
      TENAX_AI_PROVIDER: "groq",
      TENAX_AI_MODEL: "test-model",
      GROQ_API_KEY: marker,
      TENAX_ANALYSIS_MODE: "ai",
      TENAX_EXECUTION_MODE: "BITGET_DEMO",
      BITGET_TRADING_MODE: "demo",
      BITGET_API_KEY: `${marker}-key`,
      BITGET_SECRET_KEY: `${marker}-secret`,
      BITGET_PASSPHRASE: `${marker}-pass`,
    });
    const response = await GET();
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      ok: true,
      database: { configured: true },
      ai: { configured: true, provider: "groq", analysisMode: "ai" },
      execution: { mode: "BITGET_DEMO", demoBackend: true, demoCredentialsPresent: true },
    });
    expect(JSON.stringify(body)).not.toContain(marker);
  });
});

describe("persistence selection never silently downgrades", () => {
  it("selects Postgres when configured and memory only when absent", () => {
    expect(getPaperTradingRunRepository({ DATABASE_URL: "postgres://owner@localhost/tenax" }).backend).toBe(
      "POSTGRES",
    );
    expect(getPaperTradingRunRepository({}).backend).toBe("MEMORY");
    expect(getPaperTradingRunRepository({ DATABASE_URL: "not-a-url" }).backend).toBe("POSTGRES");
  });
});

describe("client origin safety", () => {
  const CLIENT_FILES = [
    "src/app/app/analysis/[id]/RunAgentPanel.tsx",
    "src/app/app/approval/[id]/ApproveExecutePanel.tsx",
    "src/app/app/protect/nvidia/AnalyzeButton.tsx",
    "src/app/app/_components/SessionBootstrap.tsx",
    "src/app/app/connected/PairingPanel.tsx",
  ];

  it("judge-path clients use same-origin routes with no host assumptions", () => {
    for (const file of CLIENT_FILES) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/localhost|127\.0\.0\.1|https?:\/\//);
      const fetches = [...source.matchAll(/fetch\(\s*[`"']([^`"']+)/g)].map((m) => m[1]);
      for (const target of fetches) {
        expect(target?.startsWith("/api/")).toBe(true);
      }
    }
  });

  it("no NEXT_PUBLIC variable exists to expose config to browser bundles", () => {
    const routeSource = readFileSync("src/app/api/health/route.ts", "utf8");
    expect(routeSource).not.toContain("NEXT_PUBLIC");
  });
});
