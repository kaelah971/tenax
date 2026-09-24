// Tenax Phase 4B-B6.2 — strict historical proof import validation.
//
// Historical imports are owner-supplied evidence only. This module never
// reads or writes a repository and never calls a provider, model, or sender.

import {
  judgeProofSchema,
  PROOF_KINDS,
  PROOF_VERSION,
  proofIdFor,
  type JudgeProof,
  type ProofKind,
} from "./model.ts";

export interface ImportedProofInput {
  readonly record: unknown;
  /** Human-supplied provenance note, e.g. "owner-attested 2026-09-20 Demo fill". */
  readonly importSource: string;
}

export type HistoricalProofErrorCode =
  | "IMPORT_SOURCE_REQUIRED"
  | "IMPORT_SOURCE_TOO_LONG"
  | "ROOT_NOT_OBJECT"
  | "SCHEMA_INVALID"
  | "UNSUPPORTED_VERSION"
  | "UNKNOWN_KIND"
  | "UNEXPECTED_FIELD"
  | "INVALID_TIMESTAMP"
  | "FUTURE_TIMESTAMP"
  | "INVALID_IDENTIFIER"
  | "FAKE_OR_PLACEHOLDER_ID"
  | "PROOF_ID_MISMATCH"
  | "SECRET_FIELD"
  | "SECRET_VALUE"
  | "DRY_RUN_EVIDENCE"
  | "SUCCESS_CODE_WITHOUT_FILL"
  | "EXECUTION_REQUIRED"
  | "EXECUTION_FIELD_REQUIRED"
  | "EXECUTION_NOT_FILLED"
  | "EXECUTION_ENVIRONMENT_INVALID"
  | "DEMO_FUNDS_REQUIRED"
  | "EXECUTED_VALUE_INVALID"
  | "VERIFIED_OUTCOME_REQUIRED"
  | "RECEIPT_REQUIRED"
  | "OPEN_POSITION_CLAIM"
  | "PNL_CLAIM"
  | "NON_EXECUTION_HAS_EXECUTION"
  | "NON_EXECUTION_OUTCOME_INVALID"
  | "NON_EXECUTION_REASON_REQUIRED";

export interface HistoricalProofValidationError {
  readonly code: HistoricalProofErrorCode;
  readonly path: string;
  /** Fixed safe text; never includes an input value or excerpt. */
  readonly message: string;
}

export type HistoricalProofValidation =
  | { readonly ok: true; readonly proof: JudgeProof }
  | { readonly ok: false; readonly errors: readonly HistoricalProofValidationError[] };

const ERROR_MESSAGES: Readonly<Record<HistoricalProofErrorCode, string>> = {
  IMPORT_SOURCE_REQUIRED: "Import source is required.",
  IMPORT_SOURCE_TOO_LONG: "Import source is too long.",
  ROOT_NOT_OBJECT: "Historical proof must be a plain object.",
  SCHEMA_INVALID: "Historical proof does not match the canonical proof schema.",
  UNSUPPORTED_VERSION: "Proof version is not supported.",
  UNKNOWN_KIND: "Proof kind is not recognized.",
  UNEXPECTED_FIELD: "Unexpected proof field is not permitted.",
  INVALID_TIMESTAMP: "Created timestamp is invalid.",
  FUTURE_TIMESTAMP: "Created timestamp is too far in the future.",
  INVALID_IDENTIFIER: "Proof identifier is invalid.",
  FAKE_OR_PLACEHOLDER_ID: "Fixture or placeholder identifiers are not permitted.",
  PROOF_ID_MISMATCH: "Proof identifier does not match the source event.",
  SECRET_FIELD: "Secret-like fields are not permitted.",
  SECRET_VALUE: "Secret-like values are not permitted.",
  DRY_RUN_EVIDENCE: "Dry-run evidence is not accepted as historical proof.",
  SUCCESS_CODE_WITHOUT_FILL: "A success code without corroborating fill evidence is not accepted.",
  EXECUTION_REQUIRED: "Execution evidence is required for a filled proof.",
  EXECUTION_FIELD_REQUIRED: "Required execution evidence is missing.",
  EXECUTION_NOT_FILLED: "Execution evidence does not prove a filled order.",
  EXECUTION_ENVIRONMENT_INVALID: "Execution environment is not the required demo environment.",
  DEMO_FUNDS_REQUIRED: "Demo virtual-funds evidence is required.",
  EXECUTED_VALUE_INVALID: "Executed value must be a finite positive number.",
  VERIFIED_OUTCOME_REQUIRED: "The filled proof must use the verified outcome.",
  RECEIPT_REQUIRED: "A receipt reference is required for a filled proof.",
  OPEN_POSITION_CLAIM: "Open-position claims are not permitted.",
  PNL_CLAIM: "Profit and loss claims are not permitted.",
  NON_EXECUTION_HAS_EXECUTION: "Non-execution proofs cannot contain execution evidence.",
  NON_EXECUTION_OUTCOME_INVALID: "Non-execution outcome does not match its proof kind.",
  NON_EXECUTION_REASON_REQUIRED: "This non-execution proof requires a reason code.",
};

const ROOT_FIELDS: Record<string, true> = {
  id: true,
  version: true,
  kind: true,
  flowId: true,
  subject: true,
  symbol: true,
  createdAt: true,
  outcome: true,
  authority: true,
  proposal: true,
  mandateSnapshot: true,
  execution: true,
  receiptId: true,
  reasonCodes: true,
  sourceActivityEventId: true,
  provenance: true,
};

const ALLOWED_FIELDS: Record<string, Record<string, true>> = {
  "": ROOT_FIELDS,
  authority: { source: true, mode: true, mandateId: true, mandateHash: true },
  proposal: { protectionPct: true, notionalUsd: true, side: true, action: true },
  mandateSnapshot: {
    mandateId: true,
    mode: true,
    maxProtectionPct: true,
    maxNotionalUsdt: true,
    maxExecutions: true,
    mandateHash: true,
  },
  execution: {
    environment: true,
    provider: true,
    providerOrderId: true,
    quantity: true,
    avgFillPrice: true,
    executedValueUsdt: true,
    status: true,
    fundsLabel: true,
  },
  provenance: { evidenceSource: true, recordedAt: true, imported: true, importSource: true },
};

const SECRET_KEYS: Record<string, true> = {
  apikey: true,
  secret: true,
  secretkey: true,
  token: true,
  passphrase: true,
  password: true,
  authorization: true,
  cookie: true,
  signature: true,
  privatekey: true,
  accesskey: true,
  chainofthought: true,
  reasoning: true,
};

const OPEN_POSITION_KEYS: Record<string, true> = {
  openposition: true,
  positionsize: true,
  currentprice: true,
  pnl: true,
  profit: true,
  loss: true,
  realized: true,
  unrealized: true,
  roi: true,
};

const PLACEHOLDER_TOKEN =
  /(?:^|[^a-z0-9])(?:test|fixture|fake|mock|stub|dummy|placeholder|sample|example|replace|todo|tbd|n\/a|null|undefined|none|nil|void)(?=$|[^a-z0-9])/i;
const CONTROL_CHARACTER = new RegExp("[" + String.fromCharCode(0) + "-" + String.fromCharCode(31) + String.fromCharCode(127) + "-" + String.fromCharCode(159) + "]");
const SECRET_VALUE_PATTERN =
  /-----BEGIN [^-]*PRIVATE KEY-----|(?:bearer|basic)\s+[a-z0-9._~+/=-]{12,}|(?:api[_ -]?key|access[_ -]?key|secret|token|password|passphrase|authorization|cookie|signature)\s*[:=]\s*\S+|\b(?:sk|pk|ak|ghp|xox)[-_][a-z0-9_-]{12,}\b|^[a-z0-9+/=_-]{80,}$/i;
const CLAIM_PATTERN =
  /\b(?:open[\s_-]+position|position[\s_-]+size|p&?l|pnl|profit|loss|realized|unrealized|roi)\b/i;
const PNL_TOKEN = /\b(?:p&?l|pnl|profit|loss|realized|unrealized|roi)\b/i;
const DRY_RUN_PATTERN = /\bdry[\s_-]?run\b/i;
const NON_EXECUTION_OUTCOMES: Readonly<Record<Exclude<ProofKind, "EXECUTION_FILLED">, string>> = {
  AUTHORITY_ESCALATED: "NO AUTONOMOUS ORDER SENT",
  AUTHORITY_REFUSED: "NO ORDER SENT",
  REVIEW_REQUIRED: "HUMAN REVIEW REQUIRED — NO AUTONOMOUS ORDER SENT",
  EXECUTION_FAILED: "FAILED — NO POSITION OPENED",
};

function report(
  errors: HistoricalProofValidationError[],
  code: HistoricalProofErrorCode,
  path: string,
): void {
  errors.push({ code, path, message: ERROR_MESSAGES[code] });
}

function scanUnsafeValues(
  value: unknown,
  path: string,
  errors: HistoricalProofValidationError[],
): void {
  if (typeof value === "string") {
    const normalizedString = value.replace(/[-_]/g, " ");
    if (DRY_RUN_PATTERN.test(value) || DRY_RUN_PATTERN.test(normalizedString)) report(errors, "DRY_RUN_EVIDENCE", path);
    if (
      (path !== "outcome" || value !== NON_EXECUTION_OUTCOMES.EXECUTION_FAILED) &&
      (CLAIM_PATTERN.test(value) || CLAIM_PATTERN.test(normalizedString))
    ) {
      report(errors, PNL_TOKEN.test(value) || PNL_TOKEN.test(normalizedString) ? "PNL_CLAIM" : "OPEN_POSITION_CLAIM", path);
    }
    if (path !== "" && SECRET_VALUE_PATTERN.test(value)) report(errors, "SECRET_VALUE", path);
    return;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      scanUnsafeValues(value[index], `${path}[${index}]`, errors);
    }
    return;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return;
  const record = value as Record<string, unknown>;
  const allowed = ALLOWED_FIELDS[path];
  for (const key of Object.keys(record)) {
    const child = record[key];
    const childPath = path ? `${path}.${key}` : key;
    const normalized = key.replace(/[-_]/g, "").toLowerCase();
    if (SECRET_KEYS[normalized]) {
      report(errors, "SECRET_FIELD", childPath);
    } else if (typeof child === "string" && SECRET_VALUE_PATTERN.test(child)) {
      report(errors, "SECRET_VALUE", childPath);
    }
    if (normalized === "dryrun" && child !== false) report(errors, "DRY_RUN_EVIDENCE", childPath);
    if (OPEN_POSITION_KEYS[normalized]) {
      report(
        errors,
        normalized === "pnl" ||
          normalized === "profit" ||
          normalized === "loss" ||
          normalized === "realized" ||
          normalized === "unrealized" ||
          normalized === "roi"
          ? "PNL_CLAIM"
          : "OPEN_POSITION_CLAIM",
        childPath,
      );
    }
    if (allowed && !allowed[key]) {
      report(
        errors,
        key === "code" && child === "00000" ? "SUCCESS_CODE_WITHOUT_FILL" : "UNEXPECTED_FIELD",
        childPath,
      );
    }
    scanUnsafeValues(child, childPath, errors);
  }
}

function rejectPlaceholderIdentifier(
  value: string,
  path: string,
  errors: HistoricalProofValidationError[],
): void {
  if (
    PLACEHOLDER_TOKEN.test(value) ||
    /^0+$/.test(value) ||
    /^x+$/i.test(value) ||
    /^<[^>]*>$/.test(value)
  ) {
    report(errors, "FAKE_OR_PLACEHOLDER_ID", path);
  }
}

function validateIdentifier(
  value: unknown,
  path: string,
  errors: HistoricalProofValidationError[],
  options: { readonly nullable?: boolean; readonly max?: number } = {},
): void {
  if (value === null && options.nullable) return;
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    value.length > (options.max ?? 64) ||
    CONTROL_CHARACTER.test(value) ||
    /\s/.test(value)
  ) {
    report(errors, "INVALID_IDENTIFIER", path);
    return;
  }
  rejectPlaceholderIdentifier(value, path, errors);
}

function validateTimestamp(value: unknown, errors: HistoricalProofValidationError[]): void {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  ) {
    report(errors, "INVALID_TIMESTAMP", "createdAt");
    return;
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    report(errors, "INVALID_TIMESTAMP", "createdAt");
  } else if (timestamp > Date.now() + 5 * 60 * 1000) {
    report(errors, "FUTURE_TIMESTAMP", "createdAt");
  }
}

function validateExecutionString(
  execution: Record<string, unknown>,
  field: string,
  errors: HistoricalProofValidationError[],
): void {
  const value = execution[field];
  const path = `execution.${field}`;
  if (typeof value !== "string" || value.trim() === "") {
    report(errors, "EXECUTION_FIELD_REQUIRED", path);
    return;
  }
  rejectPlaceholderIdentifier(value, path, errors);
}

function validateImportSource(
  importSource: string,
  errors: HistoricalProofValidationError[],
): string {
  if (typeof importSource !== "string" || importSource.trim() === "") {
    report(errors, "IMPORT_SOURCE_REQUIRED", "importSource");
    return "";
  }
  const trimmed = importSource.trim();
  if (Array.from(trimmed).length > 200) report(errors, "IMPORT_SOURCE_TOO_LONG", "importSource");
  if (
    CONTROL_CHARACTER.test(trimmed) ||
    PLACEHOLDER_TOKEN.test(trimmed) ||
    SECRET_VALUE_PATTERN.test(trimmed)
  ) {
    report(errors, "SECRET_VALUE", "importSource");
  }
  return trimmed;
}

export function validateHistoricalProof(
  raw: unknown,
  importSource: string,
): HistoricalProofValidation {
  const errors: HistoricalProofValidationError[] = [];
  const trimmedSource = validateImportSource(importSource, errors);
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    report(errors, "ROOT_NOT_OBJECT", "root");
    return { ok: false, errors };
  }
  const prototype = Object.getPrototypeOf(raw);
  if (prototype !== Object.prototype && prototype !== null) {
    report(errors, "ROOT_NOT_OBJECT", "root");
    return { ok: false, errors };
  }
  const record = raw as Record<string, unknown>;

  scanUnsafeValues(record, "", errors);

  if (record.version !== PROOF_VERSION) report(errors, "UNSUPPORTED_VERSION", "version");
  const kind = record.kind;
  const kindKnown =
    typeof kind === "string" && (PROOF_KINDS as readonly string[]).includes(kind);
  if (!kindKnown) report(errors, "UNKNOWN_KIND", "kind");
  validateTimestamp(record.createdAt, errors);

  validateIdentifier(record.flowId, "flowId", errors);
  validateIdentifier(record.sourceActivityEventId, "sourceActivityEventId", errors);
  validateIdentifier(record.id, "id", errors, { max: 128 });
  if (typeof record.authority === "object" && record.authority !== null) {
    const authority = record.authority as Record<string, unknown>;
    validateIdentifier(authority.mandateId, "authority.mandateId", errors, { nullable: true });
    validateIdentifier(authority.mandateHash, "authority.mandateHash", errors, { nullable: true });
  }
  if (typeof record.mandateSnapshot === "object" && record.mandateSnapshot !== null) {
    const snapshot = record.mandateSnapshot as Record<string, unknown>;
    validateIdentifier(snapshot.mandateId, "mandateSnapshot.mandateId", errors);
    validateIdentifier(snapshot.mandateHash, "mandateSnapshot.mandateHash", errors, {
      nullable: true,
    });
  }
  if (record.receiptId !== null && record.receiptId !== undefined) {
    validateIdentifier(record.receiptId, "receiptId", errors);
  }

  const candidateKind = kind as ProofKind;
  if (
    kindKnown &&
    typeof record.sourceActivityEventId === "string" &&
    typeof record.id === "string" &&
    record.id === proofIdFor(candidateKind, record.sourceActivityEventId)
  ) {
    // Identity verified; no error.
  } else {
    report(errors, "PROOF_ID_MISMATCH", "id");
  }

  const execution = record.execution;
  if (candidateKind === "EXECUTION_FILLED") {
    if (execution === null || execution === undefined) {
      report(errors, "EXECUTION_REQUIRED", "execution");
    } else if (typeof execution === "object" && !Array.isArray(execution)) {
      const executionRecord = execution as Record<string, unknown>;
      if (executionRecord.environment !== "BITGET_DEMO") {
        report(errors, "EXECUTION_ENVIRONMENT_INVALID", "execution.environment");
      }
      if (executionRecord.provider !== "Bitget") {
        report(errors, "EXECUTION_FIELD_REQUIRED", "execution.provider");
      }
      if (executionRecord.status !== "FILLED") {
        report(errors, "EXECUTION_NOT_FILLED", "execution.status");
      }
      if (executionRecord.fundsLabel !== "DEMO · VIRTUAL FUNDS") {
        report(errors, "DEMO_FUNDS_REQUIRED", "execution.fundsLabel");
      }
      validateExecutionString(executionRecord, "providerOrderId", errors);
      validateExecutionString(executionRecord, "quantity", errors);
      validateExecutionString(executionRecord, "avgFillPrice", errors);
      const executedValue = executionRecord.executedValueUsdt;
      if (
        typeof executedValue !== "number" ||
        !Number.isFinite(executedValue) ||
        executedValue <= 0
      ) {
        report(errors, "EXECUTED_VALUE_INVALID", "execution.executedValueUsdt");
      }
    } else {
      report(errors, "EXECUTION_REQUIRED", "execution");
    }
    if (record.receiptId === null || record.receiptId === undefined || record.receiptId === "") {
      report(errors, "RECEIPT_REQUIRED", "receiptId");
    }
    if (record.outcome !== "FILLED · VERIFIED") {
      report(errors, "VERIFIED_OUTCOME_REQUIRED", "outcome");
    }
  } else if (kindKnown) {
    if (execution !== null) report(errors, "NON_EXECUTION_HAS_EXECUTION", "execution");
    const expectedOutcome =
      NON_EXECUTION_OUTCOMES[candidateKind as Exclude<ProofKind, "EXECUTION_FILLED">];
    if (record.outcome !== expectedOutcome) {
      report(errors, "NON_EXECUTION_OUTCOME_INVALID", "outcome");
    }
    if (
      candidateKind === "AUTHORITY_ESCALATED" ||
      candidateKind === "AUTHORITY_REFUSED" ||
      candidateKind === "EXECUTION_FAILED"
    ) {
      const reasonCodes = record.reasonCodes;
      if (
        !Array.isArray(reasonCodes) ||
        reasonCodes.length < 1 ||
        reasonCodes.some((code) => typeof code !== "string" || code.trim() === "")
      ) {
        report(errors, "NON_EXECUTION_REASON_REQUIRED", "reasonCodes");
      }
    }
  }

  const finalCandidate = {
    id: record.id,
    version: record.version,
    kind: record.kind,
    flowId: record.flowId,
    subject: record.subject,
    symbol: record.symbol,
    createdAt: record.createdAt,
    outcome: record.outcome,
    authority: record.authority,
    proposal: record.proposal,
    mandateSnapshot: record.mandateSnapshot,
    execution: record.execution,
    receiptId: record.receiptId,
    reasonCodes: record.reasonCodes,
    sourceActivityEventId: record.sourceActivityEventId,
    provenance: {
      evidenceSource: "TENAX_ACTIVITY_RECEIPT",
      recordedAt: new Date().toISOString(),
      imported: true,
      importSource: trimmedSource,
    },
  };
  const parsed = judgeProofSchema.safeParse(finalCandidate);
  if (!parsed.success) report(errors, "SCHEMA_INVALID", "root");
  if (errors.length > 0 || !parsed.success) return { ok: false, errors };
  return { ok: true, proof: parsed.data };
}

/**
 * Compatibility wrapper for existing B6.1 callers.
 */
export function parseImportedProof(input: ImportedProofInput): JudgeProof | null {
  const result = validateHistoricalProof(input.record, input.importSource);
  return result.ok ? result.proof : null;
}
