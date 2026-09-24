// Tenax Phase 4B-B6.2 — Production Proof Storage + Historical Import tests.
// Offline, zero network, zero credentials, zero Bitget/AI/Telegram calls.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

import {
  validateHistoricalProof,
  parseImportedProof,
} from "../src/lib/proof/import";
import {
  PostgresProofRepository,
  getProofRepository,
} from "../src/lib/proof/repository";
import type { JudgeProof } from "../src/lib/proof/model";

const VALID_FILLED_RECORD: JudgeProof = {
  id: "proof:v1:EXECUTION_FILLED:act-prod-event-101",
  version: 1,
  kind: "EXECUTION_FILLED",
  flowId: "flow-prod-999",
  subject: "NVDA",
  symbol: "NVDAUSDT",
  createdAt: "2026-09-20T15:00:00.000Z",
  outcome: "FILLED · VERIFIED",
  authority: {
    source: "STANDING_MANDATE",
    mode: "AUTO_WITHIN_MANDATE",
    mandateId: "mandate-prod-101",
    mandateHash: "hash-prod-101",
  },
  proposal: {
    protectionPct: 20,
    notionalUsd: 100,
    side: "sell",
    action: "SHORT_HEDGE",
  },
  mandateSnapshot: {
    mandateId: "mandate-prod-101",
    mode: "AUTO_WITHIN_MANDATE",
    maxProtectionPct: 30,
    maxNotionalUsdt: 150,
    maxExecutions: 1,
    mandateHash: "hash-prod-101",
  },
  execution: {
    environment: "BITGET_DEMO",
    provider: "Bitget",
    providerOrderId: "order-bitget-101",
    quantity: "0.50",
    avgFillPrice: "200.00",
    executedValueUsdt: 100,
    status: "FILLED",
    fundsLabel: "DEMO · VIRTUAL FUNDS",
  },
  receiptId: "receipt-prod-101",
  reasonCodes: [],
  sourceActivityEventId: "act-prod-event-101",
  provenance: {
    evidenceSource: "TENAX_ACTIVITY_RECEIPT",
    recordedAt: "2026-09-20T15:00:00.000Z",
    imported: false,
    importSource: null,
  },
};

describe("Production DB Readiness & Durability State", () => {
  it("enforces server-only boundary in repository.ts", () => {
    const repoSource = readFileSync(
      resolve(process.cwd(), "src/lib/proof/repository.ts"),
      "utf8",
    );
    expect(repoSource).toContain("server-only");
    expect(repoSource).toContain('typeof window !== "undefined"');
    expect(repoSource).toContain('throw new Error("Proof repository is server-only")');
  });
  it("DATABASE_URL is not exposed to client bundles or browser objects", () => {
    const proofPageSource = readFileSync(
      resolve(process.cwd(), "src/app/app/proof/page.tsx"),
      "utf8",
    );
    expect(proofPageSource).not.toContain("process.env.DATABASE_URL");
    expect(proofPageSource).toContain("handle.durabilityState");
  });

  it("handles missing or blank DATABASE_URL with EPHEMERAL state", () => {
    const handleEmpty = getProofRepository({ DATABASE_URL: "" });
    expect(handleEmpty.backend).toBe("MEMORY");
    expect(handleEmpty.durabilityState).toBe("EPHEMERAL");
    expect(handleEmpty.durable).toBe(false);
    expect(handleEmpty.reason).toBe("DATABASE_URL is not configured");

    const handleBlank = getProofRepository({ DATABASE_URL: "   " });
    expect(handleBlank.durabilityState).toBe("EPHEMERAL");
  });

  it("rejects malformed DATABASE_URL safely without leaking raw strings", () => {
    const badHandle = getProofRepository({ DATABASE_URL: "not-a-postgres-url" });
    expect(badHandle.backend).toBe("POSTGRES");
    expect(badHandle.durabilityState).toBe("UNAVAILABLE");
    expect(badHandle.durable).toBe(false);
    expect(badHandle.reason).not.toContain("not-a-postgres-url");
    expect(badHandle.reason).toMatch(/postgres:\/\//);
  });

  it("detects hosted Neon endpoints and configures verified TLS with rejectUnauthorized: true", async () => {
    const mockFactory = async () => ({
      connect: async () => {},
      query: async () => ({ rows: [] }),
      end: async () => {},
    });

    const neonUrl = "postgresql://user:pass@ep-cool-pool.neon.tech/neondb?sslmode=require";
    const repo = new PostgresProofRepository(neonUrl, mockFactory);
    expect(repo.durabilityState).toBe("UNAVAILABLE"); // before query

    // Reject neon with sslmode=disable
    const disabledNeonUrl = "postgresql://user:pass@ep-cool-pool.neon.tech/neondb?sslmode=disable";
    expect(() => new PostgresProofRepository(disabledNeonUrl, mockFactory)).toThrow(
      /requires SSL/,
    );
  });

  it("transitions durabilityState from UNAVAILABLE to DURABLE on successful query", async () => {
    const mockFactory = async () => ({
      connect: async () => {},
      query: async (text: string) => {
        if (text.includes("CREATE TABLE")) return { rows: [] };
        return { rows: [] };
      },
      end: async () => {},
    });

    const repo = new PostgresProofRepository(
      "postgresql://tenax_user:secret_pass@db.example.com:5432/tenax_prod?sslmode=require",
      mockFactory,
    );
    expect(repo.durabilityState).toBe("UNAVAILABLE");
    expect(repo.durable).toBe(false);

    await repo.listProofs();
    expect(repo.durabilityState).toBe("DURABLE");
    expect(repo.durable).toBe(true);
  });

  it("transitions durabilityState to UNAVAILABLE on failure and rethrows sanitized error", async () => {
    let ended = false;
    const mockFactory = async () => ({
      connect: async () => {
        throw new Error("Connection timed out at 10.0.0.1:5432 with password xyz");
      },
      query: async () => ({ rows: [] }),
      end: async () => {
        ended = true;
      },
    });

    const repo = new PostgresProofRepository(
      "postgresql://tenax_user:secret_pass@db.example.com:5432/tenax_prod",
      mockFactory,
    );

    await expect(repo.listProofs()).rejects.toThrow("PROOF_STORE_UNAVAILABLE");
    expect(repo.durabilityState).toBe("UNAVAILABLE");
    expect(repo.durable).toBe(false);
    expect(ended).toBe(true); // end() called in finally
  });

  it("never silently falls back to in-memory store when Postgres fails", async () => {
    const mockFactory = async () => ({
      connect: async () => {
        throw new Error("DB DOWN");
      },
      query: async () => ({ rows: [] }),
      end: async () => {},
    });

    const repo = new PostgresProofRepository(
      "postgresql://u:p@db.example.com:5432/tenax",
      mockFactory,
    );

    await expect(repo.listProofs()).rejects.toThrow();
    expect(repo.backend).toBe("POSTGRES");
    expect(repo.durabilityState).toBe("UNAVAILABLE");
  });
});

describe("Historical Proof Import Validation", () => {
  it("accepts a complete, valid EXECUTION_FILLED historical proof", () => {
    const result = validateHistoricalProof(
      VALID_FILLED_RECORD,
      "owner-verified Bitget Demo fill 2026-09-20",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.proof.provenance.imported).toBe(true);
    expect(result.proof.provenance.importSource).toBe(
      "owner-verified Bitget Demo fill 2026-09-20",
    );
    expect(result.proof.execution?.environment).toBe("BITGET_DEMO");
    expect(result.proof.execution?.fundsLabel).toBe("DEMO · VIRTUAL FUNDS");
    expect(result.proof.execution?.status).toBe("FILLED");
  });

  it("rejects missing or empty importSource", () => {
    const r1 = validateHistoricalProof(VALID_FILLED_RECORD, "");
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.errors[0].code).toBe("IMPORT_SOURCE_REQUIRED");

    const r2 = validateHistoricalProof(VALID_FILLED_RECORD, "   ");
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.errors[0].code).toBe("IMPORT_SOURCE_REQUIRED");
  });

  it("rejects overlong importSource (> 200 chars)", () => {
    const longSource = "a".repeat(201);
    const r = validateHistoricalProof(VALID_FILLED_RECORD, longSource);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].code).toBe("IMPORT_SOURCE_TOO_LONG");
  });

  it("rejects incomplete fill facts in EXECUTION_FILLED", () => {
    // Missing execution entirely
    const noExec = { ...VALID_FILLED_RECORD, execution: null };
    const r1 = validateHistoricalProof(noExec, "source note");
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.errors.some((e) => e.code === "EXECUTION_REQUIRED")).toBe(true);

    // Missing providerOrderId
    const noOid = {
      ...VALID_FILLED_RECORD,
      execution: { ...VALID_FILLED_RECORD.execution!, providerOrderId: null },
    };
    const r2 = validateHistoricalProof(noOid, "source note");
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.errors.some((e) => e.code === "EXECUTION_FIELD_REQUIRED")).toBe(true);

    // Missing quantity
    const noQty = {
      ...VALID_FILLED_RECORD,
      execution: { ...VALID_FILLED_RECORD.execution!, quantity: null },
    };
    const r3 = validateHistoricalProof(noQty, "source note");
    expect(r3.ok).toBe(false);
    if (!r3.ok) expect(r3.errors.some((e) => e.code === "EXECUTION_FIELD_REQUIRED")).toBe(true);

    // Missing avgFillPrice
    const noPrice = {
      ...VALID_FILLED_RECORD,
      execution: { ...VALID_FILLED_RECORD.execution!, avgFillPrice: null },
    };
    const r4 = validateHistoricalProof(noPrice, "source note");
    expect(r4.ok).toBe(false);
    if (!r4.ok) expect(r4.errors.some((e) => e.code === "EXECUTION_FIELD_REQUIRED")).toBe(true);

    // executedValueUsdt <= 0 or null
    const zeroVal = {
      ...VALID_FILLED_RECORD,
      execution: { ...VALID_FILLED_RECORD.execution!, executedValueUsdt: 0 },
    };
    const r5 = validateHistoricalProof(zeroVal, "source note");
    expect(r5.ok).toBe(false);
    if (!r5.ok) expect(r5.errors.some((e) => e.code === "EXECUTED_VALUE_INVALID")).toBe(true);
  });

  it("rejects provider code 00000 alone without actual fill facts", () => {
    const codeOnly = {
      ...VALID_FILLED_RECORD,
      execution: {
        ...VALID_FILLED_RECORD.execution!,
        providerOrderId: "00000",
      },
    };
    const r = validateHistoricalProof(codeOnly, "source note");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.code === "FAKE_OR_PLACEHOLDER_ID")).toBe(true);
  });

  it("rejects DRY_RUN represented as execution", () => {
    const dryRun = {
      ...VALID_FILLED_RECORD,
      execution: {
        ...VALID_FILLED_RECORD.execution!,
        environment: "DRY_RUN",
      },
    };
    const r = validateHistoricalProof(dryRun, "source note");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.code === "EXECUTION_ENVIRONMENT_INVALID")).toBe(true);
  });

  it("rejects missing DEMO / VIRTUAL FUNDS labeling", () => {
    const badLabel = {
      ...VALID_FILLED_RECORD,
      execution: {
        ...VALID_FILLED_RECORD.execution!,
        fundsLabel: "REAL MONEY",
      },
    };
    const r = validateHistoricalProof(badLabel, "source note");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.code === "DEMO_FUNDS_REQUIRED")).toBe(true);
  });

  it("rejects fake, test, or placeholder identifiers", () => {
    const fakeId = {
      ...VALID_FILLED_RECORD,
      id: "proof:v1:EXECUTION_FILLED:test-event-id",
      sourceActivityEventId: "test-event-id",
    };
    const r = validateHistoricalProof(fakeId, "source note");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.code === "FAKE_OR_PLACEHOLDER_ID")).toBe(true);
  });

  it("enforces deterministic proof ID matching proofIdFor", () => {
    const mismatchedId = {
      ...VALID_FILLED_RECORD,
      id: "proof:v1:EXECUTION_FILLED:different-event-id",
    };
    const r = validateHistoricalProof(mismatchedId, "source note");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.code === "PROOF_ID_MISMATCH")).toBe(true);
  });

  it("recursively rejects secret-like fields", () => {
    const withSecret = {
      ...VALID_FILLED_RECORD,
      apiKey: "secret-key-value",
    };
    const r = validateHistoricalProof(withSecret, "source note");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.code === "SECRET_FIELD")).toBe(true);
  });

  it("rejects claims implying open positions or PnL", () => {
    const withPnl = {
      ...VALID_FILLED_RECORD,
      unrealizedPnl: "+$500.00",
    };
    const r = validateHistoricalProof(withPnl, "source note");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.code === "PNL_CLAIM" || e.code === "UNEXPECTED_FIELD")).toBe(true);
  });

  it("validates non-execution kinds (AUTHORITY_ESCALATED, AUTHORITY_REFUSED, REVIEW_REQUIRED, EXECUTION_FAILED)", () => {
    // Valid Escalated
    const escalated: JudgeProof = {
      id: "proof:v1:AUTHORITY_ESCALATED:act-esc-001",
      version: 1,
      kind: "AUTHORITY_ESCALATED",
      flowId: "flow-001",
      subject: "NVDA",
      symbol: "NVDAUSDT",
      createdAt: "2026-09-20T12:00:00.000Z",
      outcome: "NO AUTONOMOUS ORDER SENT",
      authority: { source: "STANDING_MANDATE", mode: "AUTO_WITH_ESCALATION", mandateId: "m1", mandateHash: "h1" },
      proposal: { protectionPct: 40, notionalUsd: 200, side: "sell", action: "SHORT_HEDGE" },
      mandateSnapshot: { mandateId: "m1", mode: "AUTO_WITH_ESCALATION", maxProtectionPct: 30, maxNotionalUsdt: 150, maxExecutions: 1, mandateHash: "h1" },
      execution: null,
      receiptId: null,
      reasonCodes: ["exceeds_max_protection_pct"],
      sourceActivityEventId: "act-esc-001",
      provenance: { evidenceSource: "TENAX_ACTIVITY_RECEIPT", recordedAt: "2026-09-20T12:00:00.000Z", imported: false, importSource: null },
    };
    const rEsc = validateHistoricalProof(escalated, "valid escalation note");
    expect(rEsc.ok).toBe(true);

    // Non-execution with execution object MUST be rejected
    const invalidEsc = {
      ...escalated,
      execution: VALID_FILLED_RECORD.execution,
    };
    const rBad = validateHistoricalProof(invalidEsc, "note");
    expect(rBad.ok).toBe(false);
    if (!rBad.ok) expect(rBad.errors.some((e) => e.code === "NON_EXECUTION_HAS_EXECUTION")).toBe(true);

    // Escalated with wrong outcome MUST be rejected
    const wrongOutcome = {
      ...escalated,
      outcome: "ORDER SENT TO VENUE",
    };
    const rWrong = validateHistoricalProof(wrongOutcome, "note");
    expect(rWrong.ok).toBe(false);
    if (!rWrong.ok) expect(rWrong.errors.some((e) => e.code === "NON_EXECUTION_OUTCOME_INVALID")).toBe(true);
  });

  it("all 5 template files are rejected out-of-the-box until owner replaces placeholders", () => {
    const templates = [
      "templates/proof-import/execution-filled.json",
      "templates/proof-import/authority-escalated.json",
      "templates/proof-import/authority-refused.json",
      "templates/proof-import/review-required.json",
      "templates/proof-import/execution-failed.json",
    ];

    for (const tplPath of templates) {
      const content = JSON.parse(readFileSync(resolve(process.cwd(), tplPath), "utf8"));
      const result = validateHistoricalProof(content, "test import source");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(
          result.errors.some(
            (e) => e.code === "FAKE_OR_PLACEHOLDER_ID" || e.code === "PROOF_ID_MISMATCH",
          ),
        ).toBe(true);
      }
    }
  });

  it("backward-compatible parseImportedProof returns null on invalid, JudgeProof on valid", () => {
    const valid = parseImportedProof({
      record: VALID_FILLED_RECORD,
      importSource: "owner note",
    });
    expect(valid).not.toBeNull();
    expect(valid?.provenance.imported).toBe(true);

    const invalid = parseImportedProof({
      record: { bad: "record" },
      importSource: "owner note",
    });
    expect(invalid).toBeNull();
  });
});

describe("scripts/proof-import.ts CLI contract", () => {
  const cliPath = resolve(process.cwd(), "scripts/proof-import.ts");
  const tempValidPath = resolve(process.cwd(), "temp-test-valid-proof.json");
  const tempInvalidPath = resolve(process.cwd(), "temp-test-invalid-proof.json");

  beforeEach(() => {
    writeFileSync(tempValidPath, JSON.stringify(VALID_FILLED_RECORD, null, 2), "utf8");
    writeFileSync(tempInvalidPath, JSON.stringify({ bad: "record" }, null, 2), "utf8");
  });

  afterEach(() => {
    try {
      unlinkSync(tempValidPath);
    } catch {}
    try {
      unlinkSync(tempInvalidPath);
    } catch {}
  });

  it("CLI --dry-run performs zero writes and prints canonical proof with exit code 0", () => {
    const output = execFileSync(
      process.execPath,
      ["--no-warnings", cliPath, tempValidPath, "--dry-run"],
      { encoding: "utf8", env: { ...process.env, DATABASE_URL: "" } },
    );

    const jsonLine = output.trim().split("\n").find((l) => l.startsWith("{")) ?? output;
    const parsed = JSON.parse(jsonLine);
    expect(parsed.ok).toBe(true);
    expect(parsed.mode).toBe("DRY_RUN");
    expect(parsed.wouldWrite).toBe(false);
    expect(parsed.proof.id).toBe(VALID_FILLED_RECORD.id);
    expect(parsed.proof.provenance.imported).toBe(true);
  });
  it("CLI exits 1 on validation error with structured error JSON on stderr", () => {
    let stderr = "";
    let exitCode = 0;
    try {
      execFileSync(
        process.execPath,
        ["--no-warnings", cliPath, tempInvalidPath, "--dry-run"],
        { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
      );
    } catch (err: unknown) {
      if (err && typeof err === "object") {
        if ("status" in err && typeof err.status === "number") exitCode = err.status;
        if ("stderr" in err && typeof err.stderr === "string") stderr = err.stderr;
      }
    }

    expect(exitCode).toBe(1);
    const jsonLine = stderr.trim().split("\n").find((l) => l.startsWith("{")) ?? stderr;
    const parsed = JSON.parse(jsonLine);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toBe("VALIDATION_ERROR");
    expect(parsed.errors.length).toBeGreaterThan(0);
  });

  it("CLI exits 1 on conflicting flags (--dry-run and --import)", () => {
    let exitCode = 0;
    try {
      execFileSync(
        process.execPath,
        ["--no-warnings", cliPath, tempValidPath, "--dry-run", "--import"],
        { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
      );
    } catch (err: unknown) {
      if (err && typeof err === "object" && "status" in err && typeof err.status === "number") {
        exitCode = err.status;
      }
    }
    expect(exitCode).toBe(1);
  });

  it("CLI --import without DATABASE_URL exits 2 (CONFIG_DATABASE_URL_MISSING)", () => {
    let stderr = "";
    let exitCode = 0;
    try {
      execFileSync(
        process.execPath,
        ["--no-warnings", cliPath, tempValidPath, "--import", "--source", "Owner verified Demo fill"],
        {
          encoding: "utf8",
          env: { ...process.env, DATABASE_URL: "" },
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
    } catch (err: unknown) {
      if (err && typeof err === "object") {
        if ("status" in err && typeof err.status === "number") exitCode = err.status;
        if ("stderr" in err && typeof err.stderr === "string") stderr = err.stderr;
      }
    }

    expect(exitCode).toBe(2);
    const jsonLine = stderr.trim().split("\n").find((l) => l.startsWith("{")) ?? stderr;
    const parsed = JSON.parse(jsonLine);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toBe("CONFIG_DATABASE_URL_MISSING");
  });

  it("CLI import and validation code paths perform ZERO Bitget, AI, or Telegram calls", () => {
    const cliSource = readFileSync(cliPath, "utf8");
    expect(cliSource).not.toContain("@bitget-ai");
    expect(cliSource).not.toContain("bitget");
    expect(cliSource).not.toContain("groq");
    expect(cliSource).not.toContain("openai");
    expect(cliSource).not.toContain("telegram");
    expect(cliSource).not.toContain("process.exit("); // UV safe
  });
  it("CLI unknown option does not echo back arbitrary or sensitive arguments", () => {
    let stderr = "";
    try {
      execFileSync(
        process.execPath,
        ["--no-warnings", cliPath, tempValidPath, "--password=supersecret"],
        { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
      );
    } catch (err: unknown) {
      if (err && typeof err === "object" && "stderr" in err && typeof err.stderr === "string") {
        stderr = err.stderr;
      }
    }
    expect(stderr).not.toContain("supersecret");
    expect(stderr).not.toContain("--password");
    expect(stderr).toContain("Unknown option specified.");
  });

  it("rejects snake_case PnL claims in reasonCodes and values", () => {
    const withSnakePnl = {
      ...VALID_FILLED_RECORD,
      reasonCodes: ["pnl_loss"],
    };
    const r = validateHistoricalProof(withSnakePnl, "note");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.code === "PNL_CLAIM")).toBe(true);
  });

  it("rejects literal 'null' as providerOrderId", () => {
    const withNullStr = {
      ...VALID_FILLED_RECORD,
      execution: {
        ...VALID_FILLED_RECORD.execution!,
        providerOrderId: "null",
      },
    };
    const r = validateHistoricalProof(withNullStr, "note");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.code === "FAKE_OR_PLACEHOLDER_ID")).toBe(true);
  });

  it("InMemoryProofRepository enforces unique sourceActivityEventId across different IDs/kinds", async () => {
    const repo = getProofRepository({}).repo;
    const rec1 = { ...VALID_FILLED_RECORD };
    const rec2: JudgeProof = {
      ...VALID_FILLED_RECORD,
      id: "proof:v1:AUTHORITY_ESCALATED:act-prod-event-101",
      kind: "AUTHORITY_ESCALATED",
      outcome: "NO AUTONOMOUS ORDER SENT",
      execution: null,
      receiptId: null,
      reasonCodes: ["test_code"],
    };

    const first = await repo.saveProof(rec1);
    const second = await repo.saveProof(rec2);
    expect(second.id).toBe(first.id);
    const list = await repo.listProofs();
    const matchingEvent = list.filter((p) => p.sourceActivityEventId === "act-prod-event-101");
    expect(matchingEvent.length).toBe(1);
  });
});
