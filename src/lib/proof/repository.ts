// Tenax Phase 4B-B6.2 — production proof repository.
//
// This module is server-only. It keeps Postgres access behind a narrow,
// parameterized, serverless-safe boundary and never exposes connection errors.

import { judgeProofSchema, type JudgeProof, type ProofKind } from "./model.ts";
import { PROOF_LEDGER_SCHEMA_SQL } from "./schema.ts";

if (typeof window !== "undefined") {
  throw new Error("Proof repository is server-only");
}

export type DurabilityState = "DURABLE" | "EPHEMERAL" | "UNAVAILABLE";

export interface ProofRepository {
  readonly backend: "POSTGRES" | "MEMORY";
  readonly durabilityState: DurabilityState;
  /** Compatibility getter; use durabilityState for the full truth state. */
  readonly durable: boolean;
  saveProof(record: JudgeProof): Promise<JudgeProof>;
  getProof(id: string): Promise<JudgeProof | null>;
  listProofs(filter?: {
    readonly kind?: ProofKind;
    readonly flowId?: string;
    readonly limit?: number;
  }): Promise<JudgeProof[]>;
  findProofByReceiptId(receiptId: string): Promise<JudgeProof | null>;
  findProofByFlowId(flowId: string): Promise<JudgeProof | null>;
}

export class InMemoryProofRepository implements ProofRepository {
  readonly backend = "MEMORY" as const;
  get durabilityState(): DurabilityState {
    return "EPHEMERAL";
  }
  get durable(): boolean {
    return false;
  }
  private readonly rows = new Map<string, JudgeProof>();
  private readonly eventRows = new Map<string, string>();

  async saveProof(record: JudgeProof): Promise<JudgeProof> {
    let proof: JudgeProof;
    try {
      proof = judgeProofSchema.parse(record);
    } catch {
      throw new Error("PROOF_RECORD_INVALID");
    }
    const existing = this.rows.get(proof.id);
    if (existing) return existing;
    if (proof.sourceActivityEventId) {
      const existingId = this.eventRows.get(proof.sourceActivityEventId);
      if (existingId) {
        const existingByEvent = this.rows.get(existingId);
        if (existingByEvent) return existingByEvent;
      }
    }
    this.rows.set(proof.id, proof);
    if (proof.sourceActivityEventId) {
      this.eventRows.set(proof.sourceActivityEventId, proof.id);
    }
    return proof;
  }

  async getProof(id: string): Promise<JudgeProof | null> {
    return this.rows.get(id) ?? null;
  }

  async listProofs(filter: { readonly kind?: ProofKind; readonly flowId?: string; readonly limit?: number } = {}): Promise<JudgeProof[]> {
    const limit = Math.min(Math.max(filter.limit ?? 100, 1), 200);
    return [...this.rows.values()]
      .filter((r) => (filter.kind ? r.kind === filter.kind : true))
      .filter((r) => (filter.flowId ? r.flowId === filter.flowId : true))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
      .slice(0, limit);
  }

  async findProofByReceiptId(receiptId: string): Promise<JudgeProof | null> {
    const matches = [...this.rows.values()]
      .filter((r) => r.receiptId === receiptId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    return matches[0] ?? null;
  }

  async findProofByFlowId(flowId: string): Promise<JudgeProof | null> {
    const matches = [...this.rows.values()]
      .filter((r) => r.flowId === flowId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    return matches[0] ?? null;
  }
}


// ---- Postgres backend --------------------------------------------------------

type PgRows = Array<Record<string, unknown>>;

export interface PgClientLike {
  query(text: string, values?: unknown[]): Promise<{ rows: PgRows }>;
}

export type PgClientFactory = (connectionString: string) => Promise<{
  connect(): Promise<void>;
  query(text: string, values?: unknown[]): Promise<{ rows: PgRows }>;
  end(): Promise<void>;
}>;

type PostgresConfigIssue =
  | "UNSUPPORTED_SCHEME"
  | "MISSING_HOST"
  | "MISSING_DATABASE"
  | "MISSING_USER"
  | "SSL_DISABLED_FOR_HOSTED"
  | "MALFORMED_URL";

const POSTGRES_CONFIG_REASONS: Record<PostgresConfigIssue, string> = {
  UNSUPPORTED_SCHEME: "DATABASE_URL must use postgres:// or postgresql://",
  MISSING_HOST: "DATABASE_URL is missing its host",
  MISSING_DATABASE: "DATABASE_URL is missing its database",
  MISSING_USER: "DATABASE_URL is missing its user",
  SSL_DISABLED_FOR_HOSTED: "DATABASE_URL requires SSL for hosted databases",
  MALFORMED_URL: "DATABASE_URL is malformed",
};

interface ParsedPostgresConfig {
  readonly isNeon: boolean;
  readonly sslRequired: boolean;
}

function parsePostgresConfig(connectionString: string): ParsedPostgresConfig {
  const trimmed = connectionString.trim();
  const lower = trimmed.toLowerCase();
  const hasScheme =
    lower.startsWith("postgres://") || lower.startsWith("postgresql://");
  if (!hasScheme) {
    throw new Error(POSTGRES_CONFIG_REASONS.UNSUPPORTED_SCHEME);
  }
  if (/%(?![0-9A-Fa-f]{2})/.test(trimmed)) {
    throw new Error(POSTGRES_CONFIG_REASONS.MALFORMED_URL);
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(POSTGRES_CONFIG_REASONS.MALFORMED_URL);
  }
  const host = url.hostname.trim();
  if (host === "") {
    throw new Error(POSTGRES_CONFIG_REASONS.MISSING_HOST);
  }
  const database = url.pathname.replace(/^\/+/, "").split("/")[0] ?? "";
  if (database === "") {
    throw new Error(POSTGRES_CONFIG_REASONS.MISSING_DATABASE);
  }
  let decodedUser: string;
  try {
    decodedUser = decodeURIComponent(url.username);
  } catch {
    throw new Error(POSTGRES_CONFIG_REASONS.MALFORMED_URL);
  }
  if (decodedUser.trim() === "") {
    throw new Error(POSTGRES_CONFIG_REASONS.MISSING_USER);
  }
  const hostLower = host.toLowerCase();
  const isNeon = hostLower === "neon.tech" || hostLower.includes("neon.tech");
  const sslMode = (url.searchParams.get("sslmode") ?? "").toLowerCase();
  if (isNeon && sslMode === "disable") {
    throw new Error(POSTGRES_CONFIG_REASONS.SSL_DISABLED_FOR_HOSTED);
  }
  return { isNeon, sslRequired: isNeon || sslMode === "require" };
}

export function getPostgresConfigReason(connectionString: string): string | null {
  try {
    parsePostgresConfig(connectionString);
    return null;
  } catch (error) {
    if (error instanceof Error) {
      const known = Object.values(POSTGRES_CONFIG_REASONS) as string[];
      if (known.includes(error.message)) return error.message;
    }
    return POSTGRES_CONFIG_REASONS.MALFORMED_URL;
  }
}

// The pg driver remains server-only and is loaded lazily so builds and
// tests without DATABASE_URL never touch the driver.
export async function defaultPgClientFactory(connectionString: string) {
  const config = parsePostgresConfig(connectionString);
  const pg = await import("pg");
  return new pg.Client({
    connectionString,
    connectionTimeoutMillis: 8_000,
    statement_timeout: 10_000,
    query_timeout: 10_000,
    keepAlive: true,
    ...(config.sslRequired ? { ssl: { rejectUnauthorized: true } } : {}),
  });
}

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "");
}

function asJson(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  return value;
}

/** Map a ledger row to a validated proof; null when the row is corrupt. */
function rowToProof(row: Record<string, unknown>): JudgeProof | null {
  try {
    return judgeProofSchema.parse({
      id: row.id,
      version: row.version,
      kind: row.kind,
      flowId: row.flow_id,
      subject: row.subject,
      symbol: row.symbol,
      createdAt: asIso(row.created_at),
      outcome: row.outcome,
      authority: asJson(row.authority),
      proposal: asJson(row.proposal),
      mandateSnapshot: asJson(row.mandate_snapshot),
      execution: asJson(row.execution),
      receiptId: row.receipt_id ?? null,
      reasonCodes: asJson(row.reason_codes) ?? [],
      sourceActivityEventId: row.source_activity_event_id,
      provenance: asJson(row.provenance),
    });
  } catch {
    return null;
  }
}

const PROOF_COLUMNS =
  "id, version, kind, flow_id, subject, symbol, created_at, outcome, " +
  "authority, proposal, mandate_snapshot, execution, receipt_id, " +
  "reason_codes, source_activity_event_id, provenance";

function proofValues(proof: JudgeProof): unknown[] {
  return [
    proof.id,
    proof.version,
    proof.kind,
    proof.flowId,
    proof.subject,
    proof.symbol,
    proof.createdAt,
    proof.outcome,
    JSON.stringify(proof.authority),
    JSON.stringify(proof.proposal),
    proof.mandateSnapshot === null ? null : JSON.stringify(proof.mandateSnapshot),
    proof.execution === null ? null : JSON.stringify(proof.execution),
    proof.receiptId,
    JSON.stringify(proof.reasonCodes),
    proof.sourceActivityEventId,
    JSON.stringify(proof.provenance),
  ];
}

export class PostgresProofRepository implements ProofRepository {
  readonly backend = "POSTGRES" as const;
  private _durabilityState: DurabilityState = "UNAVAILABLE";
  private schemaReady = false;
  private schemaPromise: Promise<void> | null = null;
  private connectionString: string;
  private clientFactory: PgClientFactory;

  constructor(connectionString: string, clientFactory: PgClientFactory = defaultPgClientFactory) {
    const reason = getPostgresConfigReason(connectionString);
    if (reason !== null) {
      throw new Error(reason);
    }
    this.connectionString = connectionString;
    this.clientFactory = clientFactory;
  }

  get durabilityState(): DurabilityState {
    return this._durabilityState;
  }

  get durable(): boolean {
    return this._durabilityState === "DURABLE";
  }

  private markDurable(): void {
    this._durabilityState = "DURABLE";
  }

  private markUnavailable(): void {
    this._durabilityState = "UNAVAILABLE";
    this.schemaReady = false;
    this.schemaPromise = null;
  }

  private ensureSchema(
    query: (text: string, values?: unknown[]) => Promise<{ rows: PgRows }>,
  ): Promise<void> {
    if (this.schemaReady) return Promise.resolve();
    if (!this.schemaPromise) {
      this.schemaPromise = query(PROOF_LEDGER_SCHEMA_SQL).then(
        () => {
          this.schemaReady = true;
        },
        (error: unknown) => {
          this.schemaPromise = null;
          throw error;
        },
      );
    }
    return this.schemaPromise;
  }

  private async run<T>(
    op: (query: (text: string, values?: unknown[]) => Promise<{ rows: PgRows }>) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.attempt(op);
    } catch (error) {
      // One retry on a fresh connection: serverless cold starts (Neon
      // compute wake) routinely fail the first connect while the second
      // succeeds. Every operation through here is idempotent, so a retry
      // can never duplicate. Corrupt records never retry.
      if (error instanceof Error && error.message === "PROOF_STORE_UNAVAILABLE") {
        return await this.attempt(op);
      }
      throw error;
    }
  }

  private async attempt<T>(
    op: (query: (text: string, values?: unknown[]) => Promise<{ rows: PgRows }>) => Promise<T>,
  ): Promise<T> {
    let client: {
      connect(): Promise<void>;
      query(text: string, values?: unknown[]): Promise<{ rows: PgRows }>;
      end(): Promise<void>;
    };
    try {
      client = await this.clientFactory(this.connectionString);
    } catch {
      this.markUnavailable();
      throw new Error("PROOF_STORE_UNAVAILABLE");
    }
    try {
      await client.connect();
    } catch {
      await client.end().catch(() => {});
      this.markUnavailable();
      throw new Error("PROOF_STORE_UNAVAILABLE");
    }
    try {
      const query = (text: string, values?: unknown[]) => client.query(text, values);
      await this.ensureSchema(query);
      const result = await op(query);
      this.markDurable();
      return result;
    } catch (error) {
      this.markUnavailable();
      if (error instanceof Error && error.message === "PROOF_STORE_CORRUPT") {
        throw new Error("PROOF_STORE_CORRUPT");
      }
      throw new Error("PROOF_STORE_UNAVAILABLE");
    } finally {
      await client.end().catch(() => {});
    }
  }

  async saveProof(record: JudgeProof): Promise<JudgeProof> {
    let proof: JudgeProof;
    try {
      proof = judgeProofSchema.parse(record);
    } catch {
      throw new Error("PROOF_RECORD_INVALID");
    }
    return this.run(async (query) => {
      const inserted = await query(
        `INSERT INTO tenax_judge_proofs (${PROOF_COLUMNS}) VALUES ` +
          `($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ` +
          `ON CONFLICT (id) DO NOTHING RETURNING *`,
        proofValues(proof),
      );
      const row =
        inserted.rows[0] ??
        (
          await query(`SELECT * FROM tenax_judge_proofs WHERE id = $1`, [proof.id])
        ).rows[0];
      if (!row) throw new Error("PROOF_STORE_CORRUPT");
      const stored = rowToProof(row);
      if (!stored) throw new Error("PROOF_STORE_CORRUPT");
      return stored;
    });
  }

  async getProof(id: string): Promise<JudgeProof | null> {
    return this.run(async (query) => {
      const res = await query(`SELECT * FROM tenax_judge_proofs WHERE id = $1`, [id]);
      const row = res.rows[0];
      if (!row) return null;
      const parsed = rowToProof(row);
      if (!parsed) throw new Error("PROOF_STORE_CORRUPT");
      return parsed;
    });
  }


  async listProofs(filter: { readonly kind?: ProofKind; readonly flowId?: string; readonly limit?: number } = {}): Promise<JudgeProof[]> {
    const limit = Math.min(Math.max(filter.limit ?? 100, 1), 200);
    const clauses: string[] = [];
    const values: unknown[] = [];
    if (filter.kind) {
      values.push(filter.kind);
      clauses.push(`kind = $${values.length}`);
    }
    if (filter.flowId) {
      values.push(filter.flowId);
      clauses.push(`flow_id = $${values.length}`);
    }
    values.push(limit);
    return this.run(async (query) => {
      const res = await query(
        `SELECT * FROM tenax_judge_proofs` +
          (clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "") +
          ` ORDER BY created_at DESC LIMIT $${values.length}`,
        values,
      );
      const proofs: JudgeProof[] = [];
      for (const row of res.rows) {
        const parsed = rowToProof(row);
        if (!parsed) throw new Error("PROOF_STORE_CORRUPT");
        proofs.push(parsed);
      }
      return proofs;
    });
  }

  async findProofByReceiptId(receiptId: string): Promise<JudgeProof | null> {
    return this.run(async (query) => {
      const res = await query(
        `SELECT * FROM tenax_judge_proofs WHERE receipt_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [receiptId],
      );
      const row = res.rows[0];
      if (!row) return null;
      const parsed = rowToProof(row);
      if (!parsed) throw new Error("PROOF_STORE_CORRUPT");
      return parsed;
    });
  }

  async findProofByFlowId(flowId: string): Promise<JudgeProof | null> {
    return this.run(async (query) => {
      const res = await query(
        `SELECT * FROM tenax_judge_proofs WHERE flow_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [flowId],
      );
      const row = res.rows[0];
      if (!row) return null;
      const parsed = rowToProof(row);
      if (!parsed) throw new Error("PROOF_STORE_CORRUPT");
      return parsed;
    });
  }
}

// ---- Resolution --------------------------------------------------------------

export interface ProofRepositoryHandle {
  readonly repo: ProofRepository;
  readonly backend: "POSTGRES" | "MEMORY";
  readonly durabilityState: DurabilityState;
  /** Compatibility getter; use durabilityState for the full truth state. */
  readonly durable: boolean;
  /** Human-readable reason when not durable (never a secret). */
  readonly reason: string | null;
}

let memorySingleton: InMemoryProofRepository | null = null;

/**
 * Resolve the proof repository for this deployment. DATABASE_URL selects
 * durable Postgres; anything else yields the explicitly non-durable
 * process-local memory store (local development and tests only — judge
 * UI labels it as such). Postgres starts UNAVAILABLE until its first
 * successful operation proves durable connectivity.
 */
export function getProofRepository(
  env: Record<string, string | undefined> = process.env,
): ProofRepositoryHandle {
  const url = (env.DATABASE_URL ?? "").trim();
  if (url === "") {
    if (!memorySingleton) memorySingleton = new InMemoryProofRepository();
    const repo = memorySingleton;
    return {
      get repo(): ProofRepository {
        return repo;
      },
      backend: "MEMORY",
      get durabilityState(): DurabilityState {
        return repo.durabilityState;
      },
      get durable(): boolean {
        return false;
      },
      reason: "DATABASE_URL is not configured",
    };
  }
  const reason = getPostgresConfigReason(url);
  if (reason !== null) {
    const repo: ProofRepository = {
      backend: "POSTGRES",
      get durabilityState(): DurabilityState {
        return "UNAVAILABLE";
      },
      get durable(): boolean {
        return false;
      },
      saveProof: async () => {
        throw new Error("PROOF_STORE_UNAVAILABLE");
      },
      getProof: async () => {
        throw new Error("PROOF_STORE_UNAVAILABLE");
      },
      listProofs: async () => {
        throw new Error("PROOF_STORE_UNAVAILABLE");
      },
      findProofByReceiptId: async () => {
        throw new Error("PROOF_STORE_UNAVAILABLE");
      },
      findProofByFlowId: async () => {
        throw new Error("PROOF_STORE_UNAVAILABLE");
      },
    };
    return {
      get repo(): ProofRepository {
        return repo;
      },
      backend: "POSTGRES",
      get durabilityState(): DurabilityState {
        return "UNAVAILABLE";
      },
      get durable(): boolean {
        return false;
      },
      reason,
    };
  }
  const repo = new PostgresProofRepository(url);
  return {
    get repo(): ProofRepository {
      return repo;
    },
    backend: "POSTGRES",
    get durabilityState(): DurabilityState {
      return repo.durabilityState;
    },
    get durable(): boolean {
      return repo.durabilityState === "DURABLE";
    },
    reason: null,
  };
}
