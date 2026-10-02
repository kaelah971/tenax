// Tenax Connected Mode — server-only durable repository boundary.
//
// The repository accepts only a hash of the opaque session cookie. Account
// reads join through that session's server-owned user_id; callers never
// provide a userId or connectionId as an authorization decision.
import { randomUUID } from "node:crypto";

import {
  getPostgresConfigReason,
  type PgClientFactory,
} from "../proof/repository.ts";
import {
  accountSnapshotSchema,
  bitgetConnectionPublicSchema,
  connectedAccountOverviewSchema,
  connectedSessionSchema,
  pairingRecordSchema,
  type AccountSnapshot,
  type ConnectedAccountOverview,
  type ConnectedSession,
  type PairingRecord,
} from "./model.ts";
import { CONNECTED_MODE_SCHEMA_SQL } from "./schema.ts";
import { createConnectionSyncToken, hashConnectionSyncToken } from "./sync-token.ts";

if (typeof window !== "undefined") {
  throw new Error("Connected repository is server-only");
}

type PgRows = Array<Record<string, unknown>>;
type PgQuery = (text: string, values?: unknown[]) => Promise<{ rows: PgRows }>;

type ConnectedDurabilityState = "DURABLE" | "UNAVAILABLE";

export interface ConsumedPairing {
  readonly pairing: PairingRecord;
  readonly connectionId: string;
  readonly provider: "BITGET";
  readonly status: "PAIRING";
  readonly accessMode: "READ_ONLY";
  /** Raw value returned once to the local connector; never persisted. */
  readonly syncToken: string;
}

export interface ConnectedSnapshotSyncResult {
  readonly snapshotId: string;
  readonly connectionId: string;
  readonly provider: "BITGET";
  readonly providerUserId: string | null;
  readonly status: "CONNECTED";
  readonly accessMode: "READ_ONLY";
  readonly syncedAt: string;
}

export interface DisconnectedConnection {
  readonly status: "DISCONNECTED";
}

export interface ConnectedRepository {
  readonly backend: "POSTGRES";
  readonly durabilityState: ConnectedDurabilityState;
  readonly durable: boolean;
  createSession(input: { tokenHash: string; now?: Date }): Promise<ConnectedSession>;
  getSessionByTokenHash(tokenHash: string, now?: Date): Promise<ConnectedSession | null>;
  createPairing(input: {
    userId: string;
    sessionId: string;
    secretHash: string;
    now?: Date;
    expiresAt: Date;
  }): Promise<PairingRecord>;
  getCurrentPairingForSession(input: {
    userId: string;
    sessionId: string;
    now?: Date;
  }): Promise<PairingRecord | null>;
  consumePairing(input: { secretHash: string; now?: Date }): Promise<ConsumedPairing | null>;
  syncSnapshotByTokenHash(input: {
    syncTokenHash: string;
    snapshot: AccountSnapshot;
    now?: Date;
  }): Promise<ConnectedSnapshotSyncResult | null>;
  disconnectConnectionBySessionTokenHash(input: {
    sessionTokenHash: string;
    now?: Date;
  }): Promise<DisconnectedConnection | null>;
  getAccountOverviewByTokenHash(tokenHash: string, now?: Date): Promise<ConnectedAccountOverview | null>;
}

export interface ConnectedRepositoryHandle {
  readonly repo: ConnectedRepository;
  readonly backend: "POSTGRES";
  readonly durabilityState: ConnectedDurabilityState;
  readonly durable: boolean;
  /** Safe configuration text only; never a connection string or provider error. */
  readonly reason: string | null;
}

function asIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value ?? "");
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

function storeCorrupt(): never {
  throw new Error("CONNECTED_STORE_CORRUPT");
}

function rowToSession(row: Record<string, unknown>): ConnectedSession {
  const parsed = connectedSessionSchema.safeParse({
    id: row.id,
    userId: row.user_id,
    createdAt: asIso(row.created_at),
    expiresAt: asIso(row.expires_at),
    lastSeenAt: asIso(row.last_seen_at),
    revokedAt: row.revoked_at === null || row.revoked_at === undefined ? null : asIso(row.revoked_at),
  });
  if (!parsed.success) return storeCorrupt();
  return parsed.data;
}

function rowToPairing(row: Record<string, unknown>): PairingRecord {
  const parsed = pairingRecordSchema.safeParse({
    id: row.id,
    userId: row.user_id,
    sessionId: row.session_id,
    secretHash: row.secret_hash,
    status: row.status,
    createdAt: asIso(row.created_at),
    expiresAt: asIso(row.expires_at),
    consumedAt: row.consumed_at === null || row.consumed_at === undefined ? null : asIso(row.consumed_at),
    connectionId: row.connection_id === null || row.connection_id === undefined ? null : String(row.connection_id),
  });
  if (!parsed.success) return storeCorrupt();
  return parsed.data;
}

function rowToOverview(row: Record<string, unknown>): ConnectedAccountOverview {
  const hasConnection = row.connection_id !== null && row.connection_id !== undefined;
  const hasSnapshot = row.snapshot_payload !== null && row.snapshot_payload !== undefined;
  if (!hasConnection && hasSnapshot) return storeCorrupt();

  const connection = hasConnection
    ? bitgetConnectionPublicSchema.safeParse({
        id: row.connection_id,
        provider: row.provider,
        providerUserId: row.provider_user_id ?? null,
        status: row.connection_status,
        accessMode: row.access_mode,
        createdAt: asIso(row.connection_created_at),
        updatedAt: asIso(row.connection_updated_at),
        disconnectedAt:
          row.disconnected_at === null || row.disconnected_at === undefined
            ? null
            : asIso(row.disconnected_at),
      })
    : { success: true as const, data: null };
  if (!connection.success) return storeCorrupt();

  const snapshot = hasSnapshot ? accountSnapshotSchema.safeParse(asJson(row.snapshot_payload)) : { success: true as const, data: null };
  if (!snapshot.success) return storeCorrupt();

  const parsed = connectedAccountOverviewSchema.safeParse({
    connection: connection.data,
    latestSnapshot: snapshot.data,
  });
  if (!parsed.success) return storeCorrupt();
  return parsed.data;
}

async function defaultConnectedPgClientFactory(connectionString: string) {
  const url = new URL(connectionString);
  const sslMode = (url.searchParams.get("sslmode") ?? "").toLowerCase();
  const hosted = url.hostname.toLowerCase().includes("neon.tech");
  const pg = await import("pg");
  return new pg.Client({
    connectionString,
    connectionTimeoutMillis: 8_000,
    statement_timeout: 10_000,
    query_timeout: 10_000,
    keepAlive: true,
    ...(hosted || sslMode === "require" ? { ssl: { rejectUnauthorized: true } } : {}),
  });
}

export class PostgresConnectedRepository implements ConnectedRepository {
  readonly backend = "POSTGRES" as const;
  private _durabilityState: ConnectedDurabilityState = "UNAVAILABLE";
  private schemaReady = false;
  private schemaPromise: Promise<void> | null = null;
  private readonly connectionString: string;
  private readonly clientFactory: PgClientFactory;

  constructor(
    connectionString: string,
    clientFactory: PgClientFactory = defaultConnectedPgClientFactory,
  ) {
    const reason = getPostgresConfigReason(connectionString);
    if (reason !== null) throw new Error(reason);
    this.connectionString = connectionString;
    this.clientFactory = clientFactory;
  }

  get durabilityState(): ConnectedDurabilityState {
    return this._durabilityState;
  }

  get durable(): boolean {
    return this._durabilityState === "DURABLE";
  }

  private markUnavailable(): void {
    this._durabilityState = "UNAVAILABLE";
    this.schemaReady = false;
    this.schemaPromise = null;
  }

  private markDurable(): void {
    this._durabilityState = "DURABLE";
  }

  private ensureSchema(query: PgQuery): Promise<void> {
    if (this.schemaReady) return Promise.resolve();
    if (!this.schemaPromise) {
      this.schemaPromise = query(CONNECTED_MODE_SCHEMA_SQL).then(
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

  private async run<T>(operation: (query: PgQuery) => Promise<T>): Promise<T> {
    let client: Awaited<ReturnType<PgClientFactory>>;
    try {
      client = await this.clientFactory(this.connectionString);
      await client.connect();
    } catch {
      this.markUnavailable();
      throw new Error("CONNECTED_STORE_UNAVAILABLE");
    }

    try {
      const query: PgQuery = (text, values) => client.query(text, values);
      await this.ensureSchema(query);
      const result = await operation(query);
      this.markDurable();
      return result;
    } catch (error) {
      this.markUnavailable();
      if (error instanceof Error && error.message === "CONNECTED_STORE_CORRUPT") {
        throw error;
      }
      throw new Error("CONNECTED_STORE_UNAVAILABLE");
    } finally {
      await client.end().catch(() => {});
    }
  }

  async createSession(input: { tokenHash: string; now?: Date }): Promise<ConnectedSession> {
    if (!/^[a-f0-9]{64}$/.test(input.tokenHash)) {
      throw new Error("CONNECTED_SESSION_TOKEN_INVALID");
    }
    const now = input.now ?? new Date();
    const userId = randomUUID();
    const sessionId = randomUUID();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    return this.run(async (query) => {
      await query("BEGIN");
      try {
        await query(
          "INSERT INTO tenax_connected_users (id, created_at) VALUES ($1, $2)",
          [userId, now.toISOString()],
        );
        const inserted = await query(
          "INSERT INTO tenax_connected_sessions (id, user_id, token_hash, created_at, expires_at, last_seen_at, revoked_at) VALUES ($1, $2, $3, $4, $5, $6, NULL) RETURNING id, user_id, created_at, expires_at, last_seen_at, revoked_at",
          [sessionId, userId, input.tokenHash, now.toISOString(), expiresAt.toISOString(), now.toISOString()],
        );
        const row = inserted.rows[0];
        if (!row) return storeCorrupt();
        const session = rowToSession(row);
        await query("COMMIT");
        return session;
      } catch (error) {
        await query("ROLLBACK").catch(() => {});
        throw error;
      }
    });
  }

  async getSessionByTokenHash(tokenHash: string, now = new Date()): Promise<ConnectedSession | null> {
    if (!/^[a-f0-9]{64}$/.test(tokenHash)) return null;
    return this.run(async (query) => {
      const result = await query(
        "UPDATE tenax_connected_sessions SET last_seen_at = $2 WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > $2 RETURNING id, user_id, created_at, expires_at, last_seen_at, revoked_at",
        [tokenHash, now.toISOString()],
      );
      const row = result.rows[0];
      return row ? rowToSession(row) : null;
    });
  }

  async createPairing(input: {
    userId: string;
    sessionId: string;
    secretHash: string;
    now?: Date;
    expiresAt: Date;
  }): Promise<PairingRecord> {
    if (!/^[a-f0-9]{64}$/.test(input.secretHash)) {
      throw new Error("PAIRING_SECRET_HASH_INVALID");
    }
    const now = input.now ?? new Date();
    const pairingId = randomUUID();
    return this.run(async (query) => {
      await query("BEGIN");
      try {
        // A fresh code invalidates an older pending code for this owner.
        await query(
          "UPDATE tenax_connected_pairings SET status = 'REVOKED' WHERE user_id = $1 AND status = 'PENDING'",
          [input.userId],
        );
        const inserted = await query(
          "INSERT INTO tenax_connected_pairings (id, user_id, session_id, secret_hash, status, created_at, expires_at, consumed_at, connection_id) VALUES ($1, $2, $3, $4, 'PENDING', $5, $6, NULL, NULL) RETURNING id, user_id, session_id, secret_hash, status, created_at, expires_at, consumed_at, connection_id",
          [pairingId, input.userId, input.sessionId, input.secretHash, now.toISOString(), input.expiresAt.toISOString()],
        );
        const row = inserted.rows[0];
        if (!row) return storeCorrupt();
        const pairing = rowToPairing(row);
        await query("COMMIT");
        return pairing;
      } catch (error) {
        await query("ROLLBACK").catch(() => {});
        throw error;
      }
    });
  }

  async getCurrentPairingForSession(input: {
    userId: string;
    sessionId: string;
    now?: Date;
  }): Promise<PairingRecord | null> {
    const now = input.now ?? new Date();
    return this.run(async (query) => {
      await query(
        "UPDATE tenax_connected_pairings SET status = 'EXPIRED' WHERE user_id = $1 AND session_id = $2 AND status = 'PENDING' AND expires_at <= $3",
        [input.userId, input.sessionId, now.toISOString()],
      );
      const result = await query(
        "SELECT id, user_id, session_id, secret_hash, status, created_at, expires_at, consumed_at, connection_id FROM tenax_connected_pairings WHERE user_id = $1 AND session_id = $2 AND status = 'PENDING' AND expires_at > $3 ORDER BY created_at DESC LIMIT 1",
        [input.userId, input.sessionId, now.toISOString()],
      );
      const row = result.rows[0];
      return row ? rowToPairing(row) : null;
    });
  }

  async consumePairing(input: { secretHash: string; now?: Date }): Promise<ConsumedPairing | null> {
    if (!/^[a-f0-9]{64}$/.test(input.secretHash)) return null;
    const now = input.now ?? new Date();
    const connectionId = randomUUID();
    const syncToken = createConnectionSyncToken();
    const syncTokenHash = hashConnectionSyncToken(syncToken);
    return this.run(async (query) => {
      await query("BEGIN");
      try {
        const locked = await query(
          "SELECT id, user_id, session_id, secret_hash, status, created_at, expires_at, consumed_at, connection_id FROM tenax_connected_pairings WHERE secret_hash = $1 FOR UPDATE",
          [input.secretHash],
        );
        const lockedRow = locked.rows[0];
        if (!lockedRow) {
          await query("COMMIT");
          return null;
        }

        const pending = rowToPairing(lockedRow);
        if (pending.status !== "PENDING") {
          await query("COMMIT");
          return null;
        }
        if (new Date(pending.expiresAt).getTime() <= now.getTime()) {
          await query(
            "UPDATE tenax_connected_pairings SET status = 'EXPIRED' WHERE id = $1 AND status = 'PENDING'",
            [pending.id],
          );
          await query("COMMIT");
          return null;
        }

        await query(
          "INSERT INTO tenax_bitget_connections (id, user_id, provider, provider_user_id, status, access_mode, sync_token_hash, created_at, updated_at, disconnected_at) VALUES ($1, $2, 'BITGET', NULL, 'PAIRING', 'READ_ONLY', $3, $4, $4, NULL)",
          [connectionId, pending.userId, syncTokenHash, now.toISOString()],
        );
        const consumed = await query(
          "UPDATE tenax_connected_pairings SET status = 'CONSUMED', consumed_at = $2, connection_id = $3 WHERE id = $1 AND status = 'PENDING' AND expires_at > $2 RETURNING id, user_id, session_id, secret_hash, status, created_at, expires_at, consumed_at, connection_id",
          [pending.id, now.toISOString(), connectionId],
        );
        const consumedRow = consumed.rows[0];
        if (!consumedRow) {
          await query("ROLLBACK");
          return null;
        }
        const pairing = rowToPairing(consumedRow);
        await query("COMMIT");
        return {
          pairing,
          connectionId,
          provider: "BITGET" as const,
          status: "PAIRING" as const,
          accessMode: "READ_ONLY" as const,
          syncToken,
        };
      } catch (error) {
        await query("ROLLBACK").catch(() => {});
        throw error;
      }
    });
  }

  async syncSnapshotByTokenHash(input: {
    syncTokenHash: string;
    snapshot: AccountSnapshot;
    now?: Date;
  }): Promise<ConnectedSnapshotSyncResult | null> {
    if (!/^[a-f0-9]{64}$/.test(input.syncTokenHash)) return null;
    const parsed = accountSnapshotSchema.safeParse(input.snapshot);
    if (!parsed.success) return null;
    const now = input.now ?? new Date();

    return this.run(async (query) => {
      await query("BEGIN");
      try {
        const connectionResult = await query(
          "SELECT id, user_id, provider, provider_user_id, status, access_mode FROM tenax_bitget_connections WHERE sync_token_hash = $1 FOR UPDATE",
          [input.syncTokenHash],
        );
        const connection = connectionResult.rows[0];
        if (!connection || connection.status === "DISCONNECTED") {
          await query("COMMIT");
          return null;
        }
        if (
          connection.provider !== "BITGET" ||
          connection.access_mode !== "READ_ONLY" ||
          parsed.data.connectionId !== String(connection.id) ||
          parsed.data.provider !== "BITGET" ||
          parsed.data.accessMode !== "READ_ONLY" ||
          parsed.data.connectionStatus !== "CONNECTED"
        ) {
          await query("COMMIT");
          return null;
        }

        const storedProviderUserId =
          connection.provider_user_id === null || connection.provider_user_id === undefined
            ? parsed.data.providerUserId
            : String(connection.provider_user_id);
        if (
          connection.provider_user_id !== null &&
          connection.provider_user_id !== undefined &&
          parsed.data.providerUserId !== null &&
          String(connection.provider_user_id) !== parsed.data.providerUserId
        ) {
          await query("COMMIT");
          return null;
        }

        const syncedAt = now.toISOString();
        const storedSnapshot = {
          ...parsed.data,
          connectionId: String(connection.id),
          providerUserId: storedProviderUserId,
          connectionStatus: "CONNECTED" as const,
          accessMode: "READ_ONLY" as const,
          syncedAt,
        };
        const validatedStoredSnapshot = accountSnapshotSchema.safeParse(storedSnapshot);
        if (!validatedStoredSnapshot.success) {
          await query("COMMIT");
          return null;
        }

        const snapshotId = randomUUID();
        const snapshotResult = await query(
          `INSERT INTO tenax_connected_account_snapshots
             (id, user_id, connection_id, payload, synced_at, created_at)
           VALUES ($1, $2, $3, $4, $5, $5)
           ON CONFLICT (user_id, connection_id)
           DO UPDATE SET payload = EXCLUDED.payload, synced_at = EXCLUDED.synced_at
           RETURNING id`,
          [
            snapshotId,
            String(connection.user_id),
            String(connection.id),
            JSON.stringify(validatedStoredSnapshot.data),
            syncedAt,
          ],
        );
        const storedRow = snapshotResult.rows[0];
        if (!storedRow?.id) {
          await query("ROLLBACK");
          return storeCorrupt();
        }
        const updated = await query(
          "UPDATE tenax_bitget_connections SET provider_user_id = COALESCE(provider_user_id, $2), status = 'CONNECTED', updated_at = $3 WHERE id = $1 AND user_id = $4 AND status <> 'DISCONNECTED' RETURNING id",
          [String(connection.id), storedProviderUserId, syncedAt, String(connection.user_id)],
        );
        if (!updated.rows[0]) {
          await query("ROLLBACK");
          return null;
        }
        await query("COMMIT");
        return {
          snapshotId: String(storedRow.id),
          connectionId: String(connection.id),
          provider: "BITGET" as const,
          providerUserId: storedProviderUserId === null ? null : String(storedProviderUserId),
          status: "CONNECTED" as const,
          accessMode: "READ_ONLY" as const,
          syncedAt,
        };
      } catch (error) {
        await query("ROLLBACK").catch(() => {});
        throw error;
      }
    });
  }

  async disconnectConnectionBySessionTokenHash(input: {
    sessionTokenHash: string;
    now?: Date;
  }): Promise<DisconnectedConnection | null> {
    if (!/^[a-f0-9]{64}$/.test(input.sessionTokenHash)) return null;
    const now = input.now ?? new Date();
    return this.run(async (query) => {
      await query("BEGIN");
      try {
        const current = await query(
          `SELECT c.id, c.user_id, c.status
             FROM tenax_connected_sessions AS s
             JOIN tenax_bitget_connections AS c ON c.user_id = s.user_id
            WHERE s.token_hash = $1
              AND s.revoked_at IS NULL
              AND s.expires_at > $2
              AND c.status <> 'DISCONNECTED'
            ORDER BY c.updated_at DESC
            LIMIT 1
            FOR UPDATE OF c`,
          [input.sessionTokenHash, now.toISOString()],
        );
        const connection = current.rows[0];
        if (!connection) {
          await query("COMMIT");
          return null;
        }

        const disconnected = await query(
          "UPDATE tenax_bitget_connections SET status = 'DISCONNECTED', sync_token_hash = NULL, updated_at = $2, disconnected_at = $2 WHERE id = $1 AND user_id = $3 AND status <> 'DISCONNECTED' RETURNING id",
          [String(connection.id), now.toISOString(), String(connection.user_id)],
        );
        if (!disconnected.rows[0]) {
          await query("ROLLBACK");
          return null;
        }
        // Pending pairings are owner-scoped and must not survive a disconnect.
        await query(
          "UPDATE tenax_connected_pairings SET status = 'REVOKED' WHERE user_id = $1 AND status = 'PENDING'",
          [String(connection.user_id)],
        );
        await query("COMMIT");
        return { status: "DISCONNECTED" as const };
      } catch (error) {
        await query("ROLLBACK").catch(() => {});
        throw error;
      }
    });
  }

  async getAccountOverviewByTokenHash(tokenHash: string, now = new Date()): Promise<ConnectedAccountOverview | null> {
    if (!/^[a-f0-9]{64}$/.test(tokenHash)) return null;
    return this.run(async (query) => {
      const result = await query(
        `SELECT
           c.id AS connection_id,
           c.provider,
           c.provider_user_id,
           c.status AS connection_status,
           c.access_mode,
           c.created_at AS connection_created_at,
           c.updated_at AS connection_updated_at,
           c.disconnected_at,
           latest.payload AS snapshot_payload
         FROM tenax_connected_sessions AS s
         LEFT JOIN tenax_bitget_connections AS c
           ON c.user_id = s.user_id
         LEFT JOIN LATERAL (
           SELECT snapshot.payload
           FROM tenax_connected_account_snapshots AS snapshot
           WHERE snapshot.connection_id = c.id
             AND snapshot.user_id = s.user_id
             AND c.status <> 'DISCONNECTED'
           ORDER BY snapshot.synced_at DESC
           LIMIT 1
         ) AS latest ON TRUE
         WHERE s.token_hash = $1
           AND s.revoked_at IS NULL
           AND s.expires_at > $2
         ORDER BY c.updated_at DESC NULLS LAST
         LIMIT 1`,
        [tokenHash, now.toISOString()],
      );
      const row = result.rows[0];
      return row ? rowToOverview(row) : null;
    });
  }
}

function unavailableRepository(): ConnectedRepository {
  const unavailable = async (): Promise<never> => {
    throw new Error("CONNECTED_STORE_UNAVAILABLE");
  };
  return {
    backend: "POSTGRES",
    durabilityState: "UNAVAILABLE",
    durable: false,
    createSession: unavailable,
    getSessionByTokenHash: unavailable,
    createPairing: unavailable,
    getCurrentPairingForSession: unavailable,
    consumePairing: unavailable,
    syncSnapshotByTokenHash: unavailable,
    disconnectConnectionBySessionTokenHash: unavailable,
    getAccountOverviewByTokenHash: unavailable,
  };
}

export function getConnectedRepository(
  env: Record<string, string | undefined> = process.env,
): ConnectedRepositoryHandle {
  const connectionString = (env.DATABASE_URL ?? "").trim();
  if (connectionString === "") {
    const repo = unavailableRepository();
    return {
      repo,
      backend: "POSTGRES",
      durabilityState: "UNAVAILABLE",
      durable: false,
      reason: "DATABASE_URL is not configured",
    };
  }

  const reason = getPostgresConfigReason(connectionString);
  if (reason !== null) {
    const repo = unavailableRepository();
    return {
      repo,
      backend: "POSTGRES",
      durabilityState: "UNAVAILABLE",
      durable: false,
      reason,
    };
  }

  const repo = new PostgresConnectedRepository(connectionString);
  return {
    repo,
    backend: "POSTGRES",
    get durabilityState() {
      return repo.durabilityState;
    },
    get durable() {
      return repo.durable;
    },
    reason: null,
  };
}
