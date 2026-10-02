import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { POST as snapshotPost } from "../src/app/api/connected/snapshot/route";
import {
  clearLocalConnector,
  ConnectorError,
  retryLocalConnector,
  runLocalConnector,
  uploadSnapshotWithServer,
  type ConnectorDependencies,
  type ConnectorLocalStore,
  type LocalConnectorMetadata,
  type SnapshotUploadReceipt,
} from "@/lib/connected/connector";
import { accountSnapshotSchema } from "@/lib/connected/model";
import { PostgresConnectedRepository } from "@/lib/connected/repository";
import { CONNECTED_MODE_SCHEMA_SQL } from "@/lib/connected/schema";
import { hashConnectionSyncToken } from "@/lib/connected/sync-token";

const NOW = new Date("2026-10-03T12:00:00.000Z");
const SYNC_TOKEN = "s".repeat(43);
const TOKEN_HASH = hashConnectionSyncToken(SYNC_TOKEN);

function snapshot(connectionId = "connection-a") {
  return accountSnapshotSchema.parse({
    connectionId,
    provider: "BITGET",
    providerUserId: "bitget-user-a",
    connectionStatus: "CONNECTED",
    accessMode: "READ_ONLY",
    syncedAt: NOW.toISOString(),
    assets: [
      { asset: "USDT", available: "100.00", frozen: null, equity: "100.00", usdValue: "100.00" },
    ],
    positions: [],
  });
}

function fakeFactory(
  handler: (text: string, values?: unknown[]) => { rows: Array<Record<string, unknown>> },
  queries: Array<{ text: string; values?: unknown[] }>,
) {
  return async () => ({
    connect: async () => {},
    query: async (text: string, values?: unknown[]) => {
      queries.push({ text, values });
      return handler(text, values);
    },
    end: async () => {},
  });
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

function memoryStore() {
  let latest: LocalConnectorMetadata | null = null;
  const store: ConnectorLocalStore = {
    async save(metadata) {
      latest = metadata;
    },
    async loadLatest() {
      return latest;
    },
    async clear() {
      latest = null;
    },
  };
  return { store, latest: () => latest };
}

function receipt(value: { connectionId: string; providerUserId: string | null }): SnapshotUploadReceipt {
  return {
    connectionId: value.connectionId,
    provider: "BITGET",
    providerUserId: value.providerUserId,
    status: "CONNECTED",
    accessMode: "READ_ONLY",
    syncedAt: NOW.toISOString(),
  };
}

describe("Connected Mode authenticated snapshot sync", () => {
  it("stores only a hash of the one-time returned sync credential", async () => {
    const queries: Array<{ text: string; values?: unknown[] }> = [];
    const pairing = {
      id: "pairing-a",
      user_id: "user-a",
      session_id: "session-a",
      secret_hash: "a".repeat(64),
      status: "PENDING",
      created_at: NOW,
      expires_at: new Date("2026-10-03T12:10:00.000Z"),
      consumed_at: null,
      connection_id: null,
    };
    const repository = new PostgresConnectedRepository(
      "postgres://user:password@localhost:5432/tenax",
      fakeFactory((text, values) => {
        if (text.includes("CREATE TABLE IF NOT EXISTS")) return { rows: [] };
        if (text.includes("WHERE secret_hash = $1 FOR UPDATE")) return { rows: [pairing] };
        if (text.includes("INSERT INTO tenax_bitget_connections")) return { rows: [] };
        if (text.includes("SET status = 'CONSUMED'")) {
          return {
            rows: [{ ...pairing, status: "CONSUMED", consumed_at: NOW, connection_id: values?.[2] }],
          };
        }
        return { rows: [] };
      }, queries),
    );

    const consumed = await repository.consumePairing({ secretHash: pairing.secret_hash, now: NOW });
    expect(consumed?.syncToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(consumed?.syncToken).not.toBe(pairing.secret_hash);
    const insert = queries.find((query) => query.text.includes("INSERT INTO tenax_bitget_connections"));
    expect(insert?.text).toContain("sync_token_hash");
    expect(insert?.values?.[2]).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(queries)).not.toContain(consumed?.syncToken);
  });

  it("upserts only the token-owned connection and moves it to CONNECTED", async () => {
    const queries: Array<{ text: string; values?: unknown[] }> = [];
    const repository = new PostgresConnectedRepository(
      "postgres://user:password@localhost:5432/tenax",
      fakeFactory((text) => {
        if (text.includes("CREATE TABLE IF NOT EXISTS")) return { rows: [] };
        if (text.includes("WHERE sync_token_hash = $1 FOR UPDATE")) {
          return {
            rows: [{ id: "connection-a", user_id: "user-a", provider: "BITGET", provider_user_id: null, status: "PAIRING", access_mode: "READ_ONLY" }],
          };
        }
        if (text.includes("INSERT INTO tenax_connected_account_snapshots")) return { rows: [{ id: "snapshot-a" }] };
        if (text.includes("UPDATE tenax_bitget_connections SET provider_user_id")) return { rows: [{ id: "connection-a" }] };
        return { rows: [] };
      }, queries),
    );

    const synced = await repository.syncSnapshotByTokenHash({
      syncTokenHash: TOKEN_HASH,
      snapshot: snapshot(),
      now: NOW,
    });
    expect(synced).toEqual({
      snapshotId: "snapshot-a",
      connectionId: "connection-a",
      provider: "BITGET",
      providerUserId: "bitget-user-a",
      status: "CONNECTED",
      accessMode: "READ_ONLY",
      syncedAt: NOW.toISOString(),
    });
    const payloadQuery = queries.find((query) => query.text.includes("INSERT INTO tenax_connected_account_snapshots"));
    expect(payloadQuery?.text).toContain("ON CONFLICT (user_id, connection_id)");
    expect(payloadQuery?.values?.[3]).not.toContain("apiKey");
    const payload = JSON.parse(String(payloadQuery?.values?.[3])) as Record<string, unknown>;
    expect(payload.connectionId).toBe("connection-a");
    expect(payload.connectionStatus).toBe("CONNECTED");
    expect(queries.some((query) => query.text.includes("status = 'CONNECTED'"))).toBe(true);
  });

  it("rejects mismatched connection identity, disconnected tokens, and invalid hashes without writes", async () => {
    const queries: Array<{ text: string; values?: unknown[] }> = [];
    const repository = new PostgresConnectedRepository(
      "postgres://user:password@localhost:5432/tenax",
      fakeFactory((text) => {
        if (text.includes("CREATE TABLE IF NOT EXISTS")) return { rows: [] };
        if (text.includes("WHERE sync_token_hash = $1 FOR UPDATE")) {
          return {
            rows: [{ id: "connection-a", user_id: "user-a", provider: "BITGET", provider_user_id: "bitget-user-a", status: "CONNECTED", access_mode: "READ_ONLY" }],
          };
        }
        return { rows: [] };
      }, queries),
    );

    expect(
      await repository.syncSnapshotByTokenHash({
        syncTokenHash: TOKEN_HASH,
        snapshot: snapshot("connection-b"),
        now: NOW,
      }),
    ).toBeNull();
    expect(queries.some((query) => query.text.includes("INSERT INTO tenax_connected_account_snapshots"))).toBe(false);
    expect(await repository.syncSnapshotByTokenHash({ syncTokenHash: "invalid", snapshot: snapshot(), now: NOW })).toBeNull();

    const disconnectedQueries: Array<{ text: string; values?: unknown[] }> = [];
    const disconnected = new PostgresConnectedRepository(
      "postgres://user:password@localhost:5432/tenax",
      fakeFactory((text) => {
        if (text.includes("CREATE TABLE IF NOT EXISTS")) return { rows: [] };
        if (text.includes("WHERE sync_token_hash = $1 FOR UPDATE")) {
          return {
            rows: [{ id: "connection-a", user_id: "user-a", provider: "BITGET", provider_user_id: "bitget-user-a", status: "DISCONNECTED", access_mode: "READ_ONLY" }],
          };
        }
        return { rows: [] };
      }, disconnectedQueries),
    );
    expect(await disconnected.syncSnapshotByTokenHash({ syncTokenHash: TOKEN_HASH, snapshot: snapshot(), now: NOW })).toBeNull();
    expect(disconnectedQueries.some((query) => query.text.includes("INSERT INTO tenax_connected_account_snapshots"))).toBe(false);
  });

  it("uploads the DTO with the sync bearer and never puts the token in the URL or body", async () => {
    let capturedUrl = "";
    let capturedHeaders: Record<string, string> = {};
    let capturedBody = "";
    const result = await uploadSnapshotWithServer({
      serverOrigin: "http://localhost:3000",
      syncToken: SYNC_TOKEN,
      snapshot: snapshot(),
      fetchImpl: async (url, init) => {
        capturedUrl = url;
        capturedHeaders = init.headers;
        capturedBody = init.body;
        return jsonResponse({
          ok: true,
          connectionId: "connection-a",
          provider: "BITGET",
          providerUserId: "bitget-user-a",
          status: "CONNECTED",
          accessMode: "READ_ONLY",
          syncedAt: NOW.toISOString(),
        });
      },
    });
    expect(result.status).toBe("CONNECTED");
    expect(capturedUrl).toBe("http://localhost:3000/api/connected/snapshot");
    expect(capturedUrl).not.toContain(SYNC_TOKEN);
    expect(capturedHeaders.Authorization).toBe(`Bearer ${SYNC_TOKEN}`);
    expect(capturedHeaders.Origin).toBeUndefined();
    expect(capturedBody).not.toContain(SYNC_TOKEN);
    expect(JSON.parse(capturedBody)).toEqual(snapshot());
  });

  it("retains local sync metadata so upload retry does not repeat OAuth", async () => {
    const local = memoryStore();
    let oauthStarts = 0;
    let uploadAttempts = 0;
    const base: ConnectorDependencies = {
      fetchImpl: async () => jsonResponse({}),
      oauth: {
        async start() {
          oauthStarts += 1;
          return { authorizeUrl: "https://www.bitget.com/authorize", session: {} };
        },
        async wait() {
          return { providerUserId: "bitget-user-a" };
        },
      },
      createProviderReader: async () => ({
        readOnly: true,
        async read() {
          return { assets: [{ coin: "USDT", available: "1" }], positions: [] };
        },
      }),
      localStore: local.store,
      uploadSnapshot: async () => {
        uploadAttempts += 1;
        if (uploadAttempts === 1) throw new ConnectorError("SYNC_UNAVAILABLE");
        return receipt({ connectionId: "connection-a", providerUserId: "bitget-user-a" });
      },
      now: () => NOW,
    };

    // The initial consume is injected separately from the upload boundary.
    const initial = {
      ...base,
      fetchImpl: async () =>
        jsonResponse({
          ok: true,
          status: "PAIRING",
          connectionId: "connection-a",
          provider: "BITGET",
          accessMode: "READ_ONLY",
          syncToken: SYNC_TOKEN,
        }),
    };
    await expect(runLocalConnector({ serverOrigin: "http://localhost:3000", pairingCode: "A".repeat(48) }, initial)).rejects.toMatchObject({ code: "SYNC_UNAVAILABLE" });
    expect(local.latest()?.syncToken).toBe(SYNC_TOKEN);
    expect(local.latest()?.lastSuccessfulLocalSync).toBeNull();

    const retried = await retryLocalConnector(base);
    expect(retried.summary.connectionStatus).toBe("CONNECTED");
    expect(oauthStarts).toBe(1);
    expect(uploadAttempts).toBe(2);
  });

  it("returns a generic unauthorized result without revealing connection existence", async () => {
    const response = await snapshotPost(
      new Request("https://tenax.test/api/connected/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot()),
      }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      code: "SYNC_UNAUTHORIZED",
      message: "Snapshot sync authorization was rejected.",
    });
  });

  it("clears only local Tenax metadata and does not claim provider revocation", async () => {
    const local = memoryStore();
    await local.store.save({
      version: 1,
      serverOrigin: "http://localhost:3000",
      connectionId: "connection-a",
      syncToken: SYNC_TOKEN,
      provider: "BITGET",
      providerUserId: "bitget-user-a",
      accessMode: "READ_ONLY",
      createdAt: NOW.toISOString(),
      lastSuccessfulLocalSync: NOW.toISOString(),
    });
    const result = await clearLocalConnector({
      fetchImpl: async () => jsonResponse({}),
      oauth: { async start() { return { authorizeUrl: "https://www.bitget.com/authorize", session: {} }; }, async wait() { return { providerUserId: "bitget-user-a" }; } },
      createProviderReader: async () => ({ readOnly: true, async read() { return { assets: [], positions: [] }; } }),
      localStore: local.store,
      now: () => NOW,
    });
    expect(result).toEqual({
      status: "LOCAL_METADATA_CLEARED",
      providerCredentials: "UNCHANGED",
      remoteBitgetRevocation: "NOT_REQUESTED",
    });
    expect(local.latest()).toBeNull();
  });

  it("keeps the schema and CLI free of provider credential output", () => {
    expect(CONNECTED_MODE_SCHEMA_SQL).toContain("sync_token_hash");
    expect(CONNECTED_MODE_SCHEMA_SQL).toContain("tenax_connected_snapshots_connection_idx");
    expect(CONNECTED_MODE_SCHEMA_SQL).not.toMatch(/apiKey|secretKey|passphrase|dataKey|signature|authorization/i);
    const cli = readFileSync(resolve(process.cwd(), "scripts", "bitget-agentic-connector.ts"), "utf8");
    expect(cli).not.toContain("syncToken");
    expect(cli).not.toMatch(/BITGET_API_KEY|BITGET_SECRET_KEY|BITGET_PASSPHRASE/);
  });
});
