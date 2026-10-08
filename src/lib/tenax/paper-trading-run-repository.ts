// Server-side durable repository for the canonical paper/Demo run ledger.
// It follows the existing Postgres proof-repository boundary and keeps an
// explicit in-memory fallback for offline tests/local development.

import {
  defaultPgClientFactory,
  getPostgresConfigReason,
  type PgClientFactory,
} from "../proof/repository.ts";
import {
  paperTradingRunSchema,
  type PaperRunAuthorityOutcome,
  type PaperRunExecutionStatus,
  type PaperTradingRun,
} from "./paper-trading-run.ts";
import { PAPER_TRADING_RUN_SCHEMA_SQL } from "./paper-trading-run-schema.ts";

if (typeof window !== "undefined") {
  throw new Error("Paper trading run repository is server-only");
}

type PgRows = Array<Record<string, unknown>>;

export type PaperTradingRunDurabilityState = "DURABLE" | "EPHEMERAL" | "UNAVAILABLE";

export interface PaperTradingRunFilter {
  readonly environment?: "DRY_RUN" | "BITGET_DEMO";
  readonly status?: PaperTradingRun["status"];
  readonly authorityOutcome?: PaperRunAuthorityOutcome;
  readonly executionStatus?: PaperRunExecutionStatus;
  readonly symbol?: string;
  readonly limit?: number;
}

export interface PaperTradingRunSummary {
  readonly totalRuns: number;
  readonly executes: number;
  readonly escalations: number;
  readonly refusals: number;
  readonly failedExecutions: number;
}

export interface PaperTradingRunRepository {
  readonly backend: "POSTGRES" | "MEMORY";
  readonly durabilityState: PaperTradingRunDurabilityState;
  readonly durable: boolean;
  saveRun(run: PaperTradingRun): Promise<PaperTradingRun>;
  updateRun(run: PaperTradingRun): Promise<PaperTradingRun | null>;
  getRun(runId: string): Promise<PaperTradingRun | null>;
  listRuns(filter?: PaperTradingRunFilter): Promise<PaperTradingRun[]>;
  summarizeRuns(filter?: Omit<PaperTradingRunFilter, "limit">): Promise<PaperTradingRunSummary>;
}

function sortRuns(runs: Iterable<PaperTradingRun>): PaperTradingRun[] {
  return [...runs].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function summarize(runs: readonly PaperTradingRun[]): PaperTradingRunSummary {
  return {
    totalRuns: runs.length,
    executes: runs.filter((run) => run.authority.outcome === "EXECUTE").length,
    escalations: runs.filter((run) => run.authority.outcome === "ESCALATE").length,
    refusals: runs.filter((run) => run.authority.outcome === "REFUSE").length,
    failedExecutions: runs.filter((run) => run.execution.status === "FAILED" || run.status === "FAILED").length,
  };
}

export class InMemoryPaperTradingRunRepository implements PaperTradingRunRepository {
  readonly backend = "MEMORY" as const;
  readonly durabilityState = "EPHEMERAL" as const;
  readonly durable = false;
  private readonly rows = new Map<string, PaperTradingRun>();
  private readonly flowRows = new Map<string, string>();

  async saveRun(input: PaperTradingRun): Promise<PaperTradingRun> {
    const run = paperTradingRunSchema.parse(input);
    const existingId = this.flowRows.get(run.flowId) ?? run.runId;
    const existing = this.rows.get(existingId);
    if (existing) return existing;
    this.rows.set(run.runId, run);
    this.flowRows.set(run.flowId, run.runId);
    return run;
  }

  async updateRun(input: PaperTradingRun): Promise<PaperTradingRun | null> {
    const run = paperTradingRunSchema.parse(input);
    if (!this.rows.has(run.runId)) return null;
    this.rows.set(run.runId, run);
    this.flowRows.set(run.flowId, run.runId);
    return run;
  }

  async getRun(runId: string): Promise<PaperTradingRun | null> {
    return this.rows.get(runId) ?? null;
  }

  async listRuns(filter: PaperTradingRunFilter = {}): Promise<PaperTradingRun[]> {
    const limit = Math.min(Math.max(filter.limit ?? 500, 1), 5000);
    return sortRuns(this.rows.values())
      .filter((run) => (filter.environment ? run.environment === filter.environment : true))
      .filter((run) => (filter.status ? run.status === filter.status : true))
      .filter((run) => (filter.authorityOutcome ? run.authority.outcome === filter.authorityOutcome : true))
      .filter((run) => (filter.executionStatus ? run.execution.status === filter.executionStatus : true))
      .filter((run) => (filter.symbol ? run.symbol === filter.symbol : true))
      .slice(0, limit);
  }

  async summarizeRuns(filter: Omit<PaperTradingRunFilter, "limit"> = {}): Promise<PaperTradingRunSummary> {
    const runs = await this.listRuns({ ...filter, limit: 5000 });
    return summarize(runs);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function rowToRun(row: Record<string, unknown>): PaperTradingRun | null {
  try {
    return paperTradingRunSchema.parse(asRecord(row.record));
  } catch {
    return null;
  }
}

export class PostgresPaperTradingRunRepository implements PaperTradingRunRepository {
  readonly backend = "POSTGRES" as const;
  private _durabilityState: PaperTradingRunDurabilityState = "UNAVAILABLE";
  private schemaReady = false;
  private schemaPromise: Promise<void> | null = null;
  private readonly connectionString: string;
  private readonly clientFactory: PgClientFactory;

  constructor(connectionString: string, clientFactory: PgClientFactory = defaultPgClientFactory) {
    const reason = getPostgresConfigReason(connectionString);
    if (reason !== null) throw new Error(reason);
    this.connectionString = connectionString;
    this.clientFactory = clientFactory;
  }

  get durabilityState(): PaperTradingRunDurabilityState {
    return this._durabilityState;
  }

  get durable(): boolean {
    return this._durabilityState === "DURABLE";
  }

  private ensureSchema(query: (text: string, values?: unknown[]) => Promise<{ rows: PgRows }>): Promise<void> {
    if (this.schemaReady) return Promise.resolve();
    if (!this.schemaPromise) {
      this.schemaPromise = query(PAPER_TRADING_RUN_SCHEMA_SQL).then(
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
    operation: (query: (text: string, values?: unknown[]) => Promise<{ rows: PgRows }>) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.attempt(operation);
    } catch (error) {
      // One retry on a fresh connection: serverless cold starts (Neon
      // compute wake) routinely fail the first connect while the second
      // succeeds. Every operation through here is idempotent (INSERT ...
      // ON CONFLICT DO NOTHING, keyed UPDATEs, reads), so a retry can
      // never duplicate. Corruption and validation errors never retry.
      if (error instanceof Error && error.message === "PAPER_RUN_STORE_UNAVAILABLE") {
        return await this.attempt(operation);
      }
      throw error;
    }
  }

  private async attempt<T>(
    operation: (query: (text: string, values?: unknown[]) => Promise<{ rows: PgRows }>) => Promise<T>,
  ): Promise<T> {
    let client: Awaited<ReturnType<PgClientFactory>>;
    try {
      client = await this.clientFactory(this.connectionString);
      await client.connect();
    } catch {
      this._durabilityState = "UNAVAILABLE";
      throw new Error("PAPER_RUN_STORE_UNAVAILABLE");
    }
    try {
      const query = (text: string, values?: unknown[]) => client.query(text, values);
      await this.ensureSchema(query);
      const result = await operation(query);
      this._durabilityState = "DURABLE";
      return result;
    } catch {
      this._durabilityState = "UNAVAILABLE";
      throw new Error("PAPER_RUN_STORE_UNAVAILABLE");
    } finally {
      await client.end().catch(() => {});
    }
  }

  async saveRun(input: PaperTradingRun): Promise<PaperTradingRun> {
    const run = paperTradingRunSchema.parse(input);
    return this.run(async (query) => {
      const inserted = await query(
        `INSERT INTO tenax_paper_trading_runs ` +
          `(run_id, flow_id, created_at, environment, symbol, status, authority_outcome, execution_status, source_activity_event_id, source_proof_id, record) ` +
          `VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ` +
          `ON CONFLICT DO NOTHING RETURNING record`,
        [
          run.runId,
          run.flowId,
          run.createdAt,
          run.environment,
          run.symbol,
          run.status,
          run.authority.outcome,
          run.execution.status,
          run.sourceActivityEventId,
          run.sourceProofId,
          JSON.stringify(run),
        ],
      );
      const row = inserted.rows[0] ?? (await query(
        `SELECT record FROM tenax_paper_trading_runs WHERE run_id = $1 OR flow_id = $2 LIMIT 1`,
        [run.runId, run.flowId],
      )).rows[0];
      const stored = row ? rowToRun(row) : null;
      if (!stored) throw new Error("PAPER_RUN_STORE_CORRUPT");
      return stored;
    });
  }

  async updateRun(input: PaperTradingRun): Promise<PaperTradingRun | null> {
    const run = paperTradingRunSchema.parse(input);
    return this.run(async (query) => {
      const row = (await query(
        `UPDATE tenax_paper_trading_runs SET record = $2, status = $3, authority_outcome = $4, execution_status = $5 WHERE run_id = $1 RETURNING record`,
        [run.runId, JSON.stringify(run), run.status, run.authority.outcome, run.execution.status],
      )).rows[0];
      return row ? rowToRun(row) : null;
    });
  }

  async getRun(runId: string): Promise<PaperTradingRun | null> {
    return this.run(async (query) => {
      const row = (await query(`SELECT record FROM tenax_paper_trading_runs WHERE run_id = $1`, [runId])).rows[0];
      return row ? rowToRun(row) : null;
    });
  }

  async listRuns(filter: PaperTradingRunFilter = {}): Promise<PaperTradingRun[]> {
    const limit = Math.min(Math.max(filter.limit ?? 500, 1), 5000);
    const clauses: string[] = [];
    const values: unknown[] = [];
    if (filter.environment) {
      values.push(filter.environment);
      clauses.push(`environment = $${values.length}`);
    }
    if (filter.status) {
      values.push(filter.status);
      clauses.push(`status = $${values.length}`);
    }
    if (filter.authorityOutcome) {
      values.push(filter.authorityOutcome);
      clauses.push(`authority_outcome = $${values.length}`);
    }
    if (filter.executionStatus) {
      values.push(filter.executionStatus);
      clauses.push(`execution_status = $${values.length}`);
    }
    if (filter.symbol) {
      values.push(filter.symbol);
      clauses.push(`symbol = $${values.length}`);
    }
    values.push(limit);
    return this.run(async (query) => {
      const rows = (await query(
        `SELECT record FROM tenax_paper_trading_runs` +
          (clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "") +
          ` ORDER BY created_at ASC LIMIT $${values.length}`,
        values,
      )).rows;
      const runs = rows.map(rowToRun);
      if (runs.some((run) => run === null)) throw new Error("PAPER_RUN_STORE_CORRUPT");
      return runs.filter((run): run is PaperTradingRun => run !== null);
    });
  }

  async summarizeRuns(filter: Omit<PaperTradingRunFilter, "limit"> = {}): Promise<PaperTradingRunSummary> {
    const clauses: string[] = [];
    const values: unknown[] = [];
    if (filter.environment) {
      values.push(filter.environment);
      clauses.push(`environment = $${values.length}`);
    }
    if (filter.status) {
      values.push(filter.status);
      clauses.push(`status = $${values.length}`);
    }
    if (filter.authorityOutcome) {
      values.push(filter.authorityOutcome);
      clauses.push(`authority_outcome = $${values.length}`);
    }
    if (filter.executionStatus) {
      values.push(filter.executionStatus);
      clauses.push(`execution_status = $${values.length}`);
    }
    if (filter.symbol) {
      values.push(filter.symbol);
      clauses.push(`symbol = $${values.length}`);
    }
    return this.run(async (query) => {
      const row = (await query(
        `SELECT COUNT(*)::int AS total_runs, ` +
          `COUNT(*) FILTER (WHERE authority_outcome = 'EXECUTE')::int AS executes, ` +
          `COUNT(*) FILTER (WHERE authority_outcome = 'ESCALATE')::int AS escalations, ` +
          `COUNT(*) FILTER (WHERE authority_outcome = 'REFUSE')::int AS refusals, ` +
          `COUNT(*) FILTER (WHERE execution_status = 'FAILED' OR status = 'FAILED')::int AS failed_executions ` +
          `FROM tenax_paper_trading_runs` +
          (clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : ""),
        values,
      )).rows[0] ?? {};
      return {
        totalRuns: Number(row.total_runs ?? 0),
        executes: Number(row.executes ?? 0),
        escalations: Number(row.escalations ?? 0),
        refusals: Number(row.refusals ?? 0),
        failedExecutions: Number(row.failed_executions ?? 0),
      };
    });
  }
}

class UnavailablePaperTradingRunRepository implements PaperTradingRunRepository {
  readonly backend = "POSTGRES" as const;
  readonly durabilityState = "UNAVAILABLE" as const;
  readonly durable = false;
  private unavailable(): never {
    throw new Error("PAPER_RUN_STORE_UNAVAILABLE");
  }
  saveRun(): Promise<PaperTradingRun> {
    return Promise.reject(this.unavailable());
  }
  updateRun(): Promise<PaperTradingRun | null> {
    return Promise.reject(this.unavailable());
  }
  getRun(): Promise<PaperTradingRun | null> {
    return Promise.reject(this.unavailable());
  }
  listRuns(): Promise<PaperTradingRun[]> {
    return Promise.reject(this.unavailable());
  }
  summarizeRuns(): Promise<PaperTradingRunSummary> {
    return Promise.reject(this.unavailable());
  }
}

let memorySingleton: InMemoryPaperTradingRunRepository | null = null;

export function resetPaperTradingRunRepositoryForTests(): void {
  memorySingleton = null;
}

export function getPaperTradingRunRepository(
  env: Record<string, string | undefined> = process.env,
): PaperTradingRunRepository {
  const connectionString = (env.DATABASE_URL ?? "").trim();
  if (connectionString === "") {
    if (!memorySingleton) memorySingleton = new InMemoryPaperTradingRunRepository();
    return memorySingleton;
  }
  const reason = getPostgresConfigReason(connectionString);
  if (reason !== null) return new UnavailablePaperTradingRunRepository();
  return new PostgresPaperTradingRunRepository(connectionString);
}
