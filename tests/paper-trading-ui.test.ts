import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { buildPaperTradingRun } from "@/lib/tenax/paper-trading-run";
import { calculatePaperTradingMetrics } from "@/lib/tenax/paper-trading-metrics";
import { paperTradingExportPayload, paperTradingRunsToCsv } from "@/lib/tenax/paper-trading-run-export";
import { createDevStore } from "@/lib/tenax/dev-store";

const NOW = "2026-10-05T12:00:00.000Z";

function runFixture() {
  const store = createDevStore();
  const event = {
    id: "act-0001",
    type: "STANDING_AUTHORITY_ESCALATED" as const,
    flowId: "flow-0001",
    createdAt: NOW,
    summary: "Authority escalation",
    receiptId: null,
    details: {
      mandateId: "smand-0001",
      reasonCodes: ["exceeds_max_notional"],
      proposedPct: 20,
      proposedUsd: 100,
      maxPct: 30,
      maxNotional: 150,
    },
  };
  store.activities.push(event);
  return buildPaperTradingRun({ store, flowId: event.flowId, event });
}

describe("paper-trading evidence UI and exports", () => {
  it("exposes the judge log, detail route, navigation, and truthful empty-state copy", () => {
    const page = readFileSync(resolve(process.cwd(), "src", "app", "app", "paper-trading", "page.tsx"), "utf8");
    const detail = readFileSync(resolve(process.cwd(), "src", "app", "app", "paper-trading", "[runId]", "page.tsx"), "utf8");
    const nav = readFileSync(resolve(process.cwd(), "src", "app", "app", "_components", "ShellNav.tsx"), "utf8");

    expect(page).toContain("PAPER TRADING EVIDENCE");
    expect(page).toContain("Event → Decision → Execution");
    expect(page).toContain("DATA SOURCE");
    expect(page).toContain("DURABLE · POSTGRES");
    expect(page).toContain("EPHEMERAL · DEVELOPMENT MEMORY");
    expect(page).toContain("DOWNLOAD CSV");
    expect(page).toContain("DOWNLOAD JSON");
    expect(page).toContain("NO PAPER-TRADING RUNS RECORDED YET");
    expect(page).toContain("MAX DRAWDOWN");
    expect(page).toContain("SHARPE");
    expect(page).toContain("INSUFFICIENT DATA");
    expect(detail).toContain("01 · EVENT");
    expect(detail).toContain("02 · AI DECISION");
    expect(detail).toContain("03 · AUTHORITY");
    expect(detail).toContain("04 · EXECUTION");
    expect(detail).toContain("05 · OUTCOME");
    expect(detail).toContain("SUBMITTED · FILL NOT VERIFIED");
    expect(detail).toContain("NO ORDER SENT");
    expect(detail).toContain("NOT YET OBSERVED");
    expect(nav).toContain('href: "/app/paper-trading"');
    expect(nav).toContain('label: "PAPER TRADING"');
  });

  it("exports one canonical row and leaves unknown financial values blank", () => {
    const run = runFixture();
    const csv = paperTradingRunsToCsv([run]);
    const json = paperTradingExportPayload({
      exportedAt: NOW,
      persistence: "EPHEMERAL",
      aggregates: { totalRuns: 1, executes: 0, escalations: 1, refusals: 0, failedExecutions: 0 },
      metrics: calculatePaperTradingMetrics([run]),
      runs: [run],
    });

    expect(csv.split("\r\n")).toHaveLength(3);
    expect(csv).toContain("run_id,flow_id,created_at");
    expect(csv).toContain("paper-run:v1:flow-0001");
    expect(csv).toContain(",ESCALATE,");
    expect(csv).not.toContain(",0,0,");
    expect(json).toMatchObject({ schemaVersion: 1, source: "TENAX_RUN_LEDGER", persistence: "EPHEMERAL" });
    expect(json.runs).toHaveLength(1);
    expect(JSON.stringify(json)).not.toMatch(/apiKey|secret|passphrase|sync_token|authorization/i);
  });
});
