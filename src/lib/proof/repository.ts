// Tenax Phase 4B-B6.1 — proof repository.
//
// Two backends behind one interface:
// - InMemoryProofRepository: process-local fake for local development and
//   tests. Explicitly NON-DURABLE — the judge UI labels it as such.
// - PostgresProofRepository: durable Vercel/serverless-compatible storage
//   behind DATABASE_URL. Per-request pg clients (connect → query → end),
//   parameterized statements only, lazy `pg` import so builds and tests
//   without a database never touch the driver.
//
// Immutability is enforced by the schema (PRIMARY KEY + UNIQUE event id)
// and by writers (INSERT ... ON CONFLICT DO NOTHING, first write wins).

import { judgeProofSchema, type JudgeProof, type ProofKind } from "./model";
import { PROOF_LEDGER_SCHEMA_SQL } from "./schema";

export interface ProofRepository {
  readonly backend: "POSTGRES" | "MEMORY";
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
  readonly durable = false;
  private readonly rows = new Map<string, JudgeProof>();

  async saveProof(record: JudgeProof): Promise<JudgeProof> {
    const proof = judgeProofSchema.parse(record);
    const existing = this.rows.get(proof.id);
    if (existing) return existing;
    this.rows.set(proof.id, proof);
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

async function defaultPgClientFactory(connectionString: string) {
  const pg = await import("pg");
  return new pg.Client({
    connectionString,
    connectionTimeoutMillis: 8000,
    statement_timeout: 10000,
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
  readonly durable = true;
  private schemaReady = false;

  constructor(
    private readonly connectionString: string,
    private readonly clientFactory: PgClientFactory = defaultPgClientFactory,
  ) {}

  private async run<T>(
    op: (query: (text: string, values?: unknown[]) => Promise<{ rows: PgRows }>) => Promise<T>,
  ): Promise<T> {
    const client = await this.clientFactory(this.connectionString);
    await client.connect();
    try {
      const query = (text: string, values?: unknown[]) => client.query(text, values);
      if (!this.schemaReady) {
        await query(PROOF_LEDGER_SCHEMA_SQL);
        this.schemaReady = true;
      }
      return await op(query);
    } finally {
      await client.end().catch(() => {});
    }
  }

  async saveProof(record: JudgeProof): Promise<JudgeProof> {
    const proof = judgeProofSchema.parse(record);
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
      const stored = row ? rowToProof(row) : null;
      if (!stored) throw new Error("PROOF_STORE_FAILED: proof row unreadable after write");
      return stored;
    });
  }

  async getProof(id: string): Promise<JudgeProof | null> {
    return this.run(async (query) => {
      const res = await query(`SELECT * FROM tenax_judge_proofs WHERE id = $1`, [id]);
      const row = res.rows[0];
      return row ? rowToProof(row) : null;
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
        if (parsed) proofs.push(parsed);
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
      return row ? rowToProof(row) : null;
    });
  }

  async findProofByFlowId(flowId: string): Promise<JudgeProof | null> {
    return this.run(async (query) => {
      const res = await query(
        `SELECT * FROM tenax_judge_proofs WHERE flow_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [flowId],
      );
      const row = res.rows[0];
      return row ? rowToProof(row) : null;
    });
  }
}

// ---- Resolution --------------------------------------------------------------

export interface ProofRepositoryHandle {
  readonly repo: ProofRepository;
  readonly durable: boolean;
  readonly backend: "POSTGRES" | "MEMORY";
  /** Human-readable reason when not durable (never a secret). */
  readonly reason: string | null;
}

let memorySingleton: InMemoryProofRepository | null = null;

/**
 * Resolve the proof repository for this deployment. DATABASE_URL selects
 * durable Postgres; anything else yields the explicitly non-durable
 * process-local memory store (local development and tests only — judge
 * UI labels it as such).
 */
export function getProofRepository(
  env: Record<string, string | undefined> = process.env,
): ProofRepositoryHandle {
  const url = (env.DATABASE_URL ?? "").trim();
  if (url === "") {
    if (!memorySingleton) memorySingleton = new InMemoryProofRepository();
    return {
      repo: memorySingleton,
      durable: false,
      backend: "MEMORY",
      reason: "DATABASE_URL is not configured",
    };
  }
  return {
    repo: new PostgresProofRepository(url),
    durable: true,
    backend: "POSTGRES",
    reason: null,
  };
}
