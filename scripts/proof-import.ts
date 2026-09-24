// Tenax Phase 4B-B6.2 — owner-operated historical proof import CLI.
//
// Safety contract:
// - Validation only by default (`--dry-run` or no mode flag). Dry run
//   performs ZERO database calls: no repository construction, no connects,
//   no DDL, no writes.
// - `--import` is explicit, requires `--source <note>` and `DATABASE_URL`,
//   validates before connecting, then calls `saveProof` exactly once.
//   Memory/EPHEMERAL is never an import target.
// - Output is sanitized structured JSON only. Errors use fixed safe codes
//   and never echo connection strings, credentials, SQL, provider bodies,
//   or driver exception text.
// - Zero Bitget / AI / Telegram imports or calls.
// - Shutdown sets `process.exitCode` and lets the event loop drain; never
//   force-exits (avoids the Windows libuv closing-handle assertion).
//
// Run (from repo root, Node 24 native TypeScript):
//   node scripts/proof-import.ts <file-path> [--dry-run] [--import] [--source <note>]
// Exit codes: 0 = dry-run valid / import stored, 1 = usage/JSON/validation
// error, 2 = database configuration/connection/write error.

import { readFileSync } from "node:fs";

import { validateHistoricalProof } from "../src/lib/proof/import.ts";
import type { JudgeProof } from "../src/lib/proof/model.ts";
import { PostgresProofRepository } from "../src/lib/proof/repository.ts";

const DEFAULT_DRY_RUN_SOURCE = "CLI DRY RUN";
const USAGE =
  "Usage: node scripts/proof-import.ts <file-path> [--dry-run] [--import] [--source <note>]";

type Mode = "DRY_RUN" | "IMPORT";

interface ParsedArgs {
  readonly filePath: string | null;
  readonly extraPaths: readonly string[];
  readonly dryRunCount: number;
  readonly importCount: number;
  readonly sourceProvided: boolean;
  readonly source: string | null;
  readonly unknownFlag: string | null;
  readonly missingValue: boolean;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const positionals: string[] = [];
  let dryRunCount = 0;
  let importCount = 0;
  let sourceProvided = false;
  let source: string | null = null;
  let unknownFlag: string | null = null;
  let missingValue = false;

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i] as string;
    if (token === "--dry-run") {
      dryRunCount += 1;
    } else if (token === "--import") {
      importCount += 1;
    } else if (token === "--source") {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        missingValue = true;
      } else {
        sourceProvided = true;
        source = next;
        i += 1;
      }
    } else if (token.startsWith("--source=")) {
      sourceProvided = true;
      source = token.slice("--source=".length);
    } else if (token.startsWith("--")) {
      if (unknownFlag === null) unknownFlag = token;
    } else {
      positionals.push(token);
    }
  }

  return {
    filePath: positionals[0] ?? null,
    extraPaths: positionals.slice(1),
    dryRunCount,
    importCount,
    sourceProvided,
    source,
    unknownFlag,
    missingValue,
  };
}

function printStderr(payload: unknown): void {
  console.error(JSON.stringify(payload));
}

function usageError(mode: Mode, message: string): number {
  printStderr({ ok: false, mode, error: "USAGE_ERROR", message: `${message} ${USAGE}` });
  return 1;
}

/** Map an unknown DB failure to a fixed safe code; never echoes the cause. */
function classifyDbError(error: unknown): { code: string; message: string } {
  const text = error instanceof Error ? `${error.name}: ${error.message}`.toLowerCase() : "";
  if (
    text.includes("database_url") ||
    text.includes("connection string") ||
    text.includes("invalid url") ||
    text.includes("malformed") ||
    text.includes("unsupported scheme") ||
    text.includes("sslmode")
  ) {
    return { code: "CONFIG_DATABASE_URL_INVALID", message: "DATABASE_URL is invalid." };
  }
  if (
    text.includes("schema") ||
    text.includes("relation") ||
    text.includes("migration") ||
    text.includes("ddl")
  ) {
    return { code: "DB_SCHEMA_ERROR", message: "Proof ledger schema could not be initialized." };
  }
  if (
    text.includes("connect") ||
    text.includes("timeout") ||
    text.includes("econn") ||
    text.includes("enotfound") ||
    text.includes("eai_again") ||
    text.includes("tls") ||
    text.includes("ssl") ||
    text.includes("certificate") ||
    text.includes("network") ||
    text.includes("unavailable")
  ) {
    return { code: "DB_UNAVAILABLE", message: "Durable proof store is unavailable." };
  }
  return { code: "DB_WRITE_FAILED", message: "Proof could not be written to the durable store." };
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const modeHint: Mode = args.importCount > 0 && args.dryRunCount === 0 ? "IMPORT" : "DRY_RUN";

  if (args.unknownFlag !== null) {
    return usageError(modeHint, "Unknown option specified.");
  }
  if (args.missingValue) {
    return usageError(modeHint, "Missing value for --source.");
  }
  if (args.dryRunCount > 1 || args.importCount > 1) {
    return usageError(modeHint, "Repeated mode flag.");
  }
  if (args.dryRunCount > 0 && args.importCount > 0) {
    return usageError(modeHint, "--dry-run and --import are mutually exclusive.");
  }
  if (args.filePath === null) {
    return usageError(modeHint, "Exactly one proof file path is required.");
  }
  if (args.extraPaths.length > 0) {
    return usageError(modeHint, "Exactly one proof file path is required.");
  }

  const filePath = args.filePath as string;

  if (args.importCount > 0) {
    if (!args.sourceProvided || (args.source ?? "").trim() === "") {
      return usageError("IMPORT", "--import requires --source <note>.");
    }
  }

  let rawText: string;
  try {
    rawText = readFileSync(filePath, "utf8");
  } catch {
    printStderr({
      ok: false,
      mode: modeHint,
      error: "FILE_READ_ERROR",
      message: "Proof file could not be read.",
    });
    return 1;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText) as unknown;
  } catch {
    printStderr({
      ok: false,
      mode: modeHint,
      error: "JSON_PARSE_ERROR",
      message: "Proof file is not valid JSON.",
    });
    return 1;
  }

  if (modeHint === "DRY_RUN") {
    const sourceNote =
      args.sourceProvided && (args.source ?? "").trim() !== ""
        ? (args.source as string).trim()
        : DEFAULT_DRY_RUN_SOURCE;
    if (args.sourceProvided && (args.source ?? "").trim() === "") {
      return usageError("DRY_RUN", "--source must not be empty.");
    }
    // Dry run: validation only. No repository construction, no DB calls.
    const result = validateHistoricalProof(parsed, sourceNote);
    if (!result.ok) {
      printStderr({
        ok: false,
        mode: "DRY_RUN",
        error: "VALIDATION_ERROR",
        errors: result.errors,
      });
      return 1;
    }
    console.log(JSON.stringify({ ok: true, mode: "DRY_RUN", wouldWrite: false, proof: result.proof }));
    return 0;
  }

  // --import path: source is guaranteed nonempty here.
  const sourceNote = (args.source as string).trim();
  const validated = validateHistoricalProof(parsed, sourceNote);
  if (!validated.ok) {
    printStderr({
      ok: false,
      mode: "IMPORT",
      error: "VALIDATION_ERROR",
      errors: validated.errors,
    });
    return 1;
  }

  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (databaseUrl.trim() === "") {
    printStderr({
      ok: false,
      mode: "IMPORT",
      error: "CONFIG_DATABASE_URL_MISSING",
      message: "DATABASE_URL is not configured. Memory is never an import target.",
    });
    return 2;
  }

  try {
    const repo = new PostgresProofRepository(databaseUrl.trim());
    const existingBefore: JudgeProof | null = await repo.getProof(validated.proof.id);
    const stored: JudgeProof = await repo.saveProof(validated.proof);
    const status = existingBefore !== null ? "ALREADY_PRESENT" : "IMPORTED";
    console.log(JSON.stringify({ ok: true, mode: "IMPORT", status, durability: "DURABLE", proof: stored }));
    return 0;
  } catch (error) {
    const classified = classifyDbError(error);
    printStderr({ ok: false, mode: "IMPORT", error: classified.code, message: classified.message });
    return 2;
  }
}

const code = await main();
// Natural event-loop shutdown: never force-exit while pg/fetch handles drain
// (a forced exit trips a Windows libuv closing-handle assertion).
process.exitCode = code;
