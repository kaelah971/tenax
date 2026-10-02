import { describe, expect, it } from "vitest";

import {
  assertReadOnlySdkConfig,
  CONNECTOR_READ_OPERATION_IDS,
  ConnectorError,
  runLocalConnector,
  safeConnectorMessage,
  consumePairingWithServer,
  validateAuthorizeUrl,
  validateServerOrigin,
  type ConnectorDependencies,
  type ConnectorLocalStore,
  type LocalConnectorMetadata,
  type SnapshotUploadReceipt,
} from "@/lib/connected/connector";
import { accountSnapshotSchema } from "@/lib/connected/model";

const PAIRING_CODE = "A".repeat(48);
const NOW = new Date("2026-10-03T12:00:00.000Z");
const SECRET = "provider-secret-must-not-escape";

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

function uploadReceipt(snapshot: { connectionId: string; providerUserId: string | null }): SnapshotUploadReceipt {
  return {
    connectionId: snapshot.connectionId,
    provider: "BITGET",
    providerUserId: snapshot.providerUserId,
    status: "CONNECTED",
    accessMode: "READ_ONLY",
    syncedAt: NOW.toISOString(),
  };
}

function dependencies(overrides: Partial<ConnectorDependencies> = {}): ConnectorDependencies {
  const local = memoryStore();
  return {
    fetchImpl: async () =>
      jsonResponse({
        ok: true,
        status: "PAIRING",
        connectionId: "connection-1",
        provider: "BITGET",
        accessMode: "READ_ONLY",
        syncToken: "s".repeat(43),
      }),
    oauth: {
      async start() {
        return { authorizeUrl: "https://www.bitget.com/authorize", session: { local: true } };
      },
      async wait() {
        return { providerUserId: "bitget-user-1" };
      },
    },
    createProviderReader: async () => ({
      readOnly: true,
      async read() {
        return {
          assets: [
            { coin: "USDT", available: "100.25", frozen: "0", equity: "100.25", usdtValue: "100.25", secret: SECRET },
          ],
          positions: [
            {
              symbol: "NVDAUSDT",
              holdSide: "short",
              total: "0.5",
              avgPrice: "100.00",
              markPrice: "101.00",
              leverage: "1",
              unrealizedPnl: "-0.50",
              apiKey: SECRET,
            },
          ],
        };
      },
    }),
    uploadSnapshot: async ({ snapshot }) => uploadReceipt(snapshot),
    localStore: local.store,
    now: () => NOW,
    ...overrides,
  };
}

describe("local Bitget Agentic connector", () => {
  it("validates an origin and consumes pairing only through a POST body", async () => {
    expect(validateServerOrigin("http://localhost:3000/")).toBe("http://localhost:3000");
    expect(() => validateServerOrigin("https://tenax.test/app?pair=${PAIRING_CODE}")).toThrow(ConnectorError);
    expect(() => validateServerOrigin("http://remote.test")).toThrow(ConnectorError);

    let capturedUrl = "";
    let capturedInit: { method: string; headers: Record<string, string>; body: string } | undefined;
    const result = await consumePairingWithServer({
      serverOrigin: "http://localhost:3000",
      pairingCode: PAIRING_CODE,
      fetchImpl: async (url, init) => {
        capturedUrl = url;
        capturedInit = init;
        return jsonResponse({
          ok: true,
          status: "PAIRING",
          connectionId: "connection-1",
          provider: "BITGET",
          accessMode: "READ_ONLY",
          syncToken: "s".repeat(43),
        });
      },
    });

    expect(result.connectionId).toBe("connection-1");
    expect(capturedUrl).toBe("http://localhost:3000/api/connected/pair/consume");
    expect(capturedUrl).not.toContain(PAIRING_CODE);
    expect(capturedInit?.method).toBe("POST");
    expect(JSON.parse(capturedInit?.body ?? "{}")).toEqual({ pairingCode: PAIRING_CODE });
  });

  it("does not start OAuth when pairing is rejected", async () => {
    let oauthStarted = false;
    const deps = dependencies({
      fetchImpl: async () => jsonResponse({ ok: false, error: "PAIRING_INVALID_OR_EXPIRED" }, 400),
      oauth: {
        async start() {
          oauthStarted = true;
          return { authorizeUrl: "https://www.bitget.com/authorize", session: {} };
        },
        async wait() {
          return { providerUserId: "never" };
        },
      },
    });

    await expect(
      runLocalConnector({ serverOrigin: "http://localhost:3000", pairingCode: PAIRING_CODE }, deps),
    ).rejects.toMatchObject({ code: "PAIRING_REJECTED" });
    expect(oauthStarted).toBe(false);
  });

  it("runs fake OAuth and provider boundaries, then returns a strict safe snapshot", async () => {
    let authorizeUrl = "";
    const result = await runLocalConnector(
      {
        serverOrigin: "http://localhost:3000",
        pairingCode: PAIRING_CODE,
        onAuthorizeUrl: (value) => {
          authorizeUrl = value;
        },
      },
      dependencies(),
    );

    expect(authorizeUrl).toBe("https://www.bitget.com/authorize");
    expect(result.bootstrap?.status).toBe("PAIRING");
    expect(result.summary).toEqual({
      connectionStatus: "CONNECTED",
      provider: "BITGET",
      providerUserId: "bitget-user-1",
      assetCount: 1,
      positionCount: 1,
      accessMode: "READ_ONLY",
      syncedAt: NOW.toISOString(),
    });
    expect(accountSnapshotSchema.safeParse(result.snapshot).success).toBe(true);
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(result.snapshot.assets[0]).not.toHaveProperty("secret");
    expect(result.snapshot.positions[0]).not.toHaveProperty("apiKey");
    expect(result.metadata.accessMode).toBe("READ_ONLY");
  });

  it("fails closed for malformed provider data and leaves the consumed connection awaiting sync", async () => {
    let consumeCalls = 0;
    let oauthWaited = false;
    const deps = dependencies({
      fetchImpl: async () => {
        consumeCalls += 1;
        return jsonResponse({
          ok: true,
          status: "PAIRING",
          connectionId: "connection-1",
          provider: "BITGET",
          accessMode: "READ_ONLY",
          syncToken: "s".repeat(43),
        });
      },
      oauth: {
        async start() {
          return { authorizeUrl: "https://www.bitget.com/authorize", session: {} };
        },
        async wait() {
          oauthWaited = true;
          return { providerUserId: "bitget-user-1" };
        },
      },
      createProviderReader: async () => ({
        readOnly: true,
        async read() {
          return { assets: [{ coin: "USDT", available: "not-a-decimal" }], positions: [] };
        },
      }),
    });

    await expect(
      runLocalConnector({ serverOrigin: "http://localhost:3000", pairingCode: PAIRING_CODE }, deps),
    ).rejects.toMatchObject({ code: "SANITIZATION_FAILED" });
    expect(consumeCalls).toBe(1);
    expect(oauthWaited).toBe(true);
  });

  it("does not contact Tenax again when local OAuth fails", async () => {
    let consumeCalls = 0;
    const deps = dependencies({
      fetchImpl: async () => {
        consumeCalls += 1;
        return jsonResponse({
          ok: true,
          status: "PAIRING",
          connectionId: "connection-1",
          provider: "BITGET",
          accessMode: "READ_ONLY",
          syncToken: "s".repeat(43),
        });
      },
      oauth: {
        async start() {
          return { authorizeUrl: "https://www.bitget.com/authorize", session: {} };
        },
        async wait() {
          throw new Error(SECRET);
        },
      },
    });

    await expect(
      runLocalConnector({ serverOrigin: "http://localhost:3000", pairingCode: PAIRING_CODE }, deps),
    ).rejects.toMatchObject({ code: "OAUTH_FAILED" });
    expect(consumeCalls).toBe(1);
  });

  it("pins the SDK path to read-only private GET operations", () => {
    expect(CONNECTOR_READ_OPERATION_IDS).toEqual(["getAccountInfo", "getAccountAssets", "getPositionInfo"]);
    expect(CONNECTOR_READ_OPERATION_IDS).not.toContain("placeOrder");
    expect(() => assertReadOnlySdkConfig({ readOnly: true, paperTrading: false })).not.toThrow();
    expect(() => assertReadOnlySdkConfig({ readOnly: false, paperTrading: false })).toThrow(
      "READ_ONLY_CONFIG_FAILED",
    );
    expect(() => assertReadOnlySdkConfig({ readOnly: true, paperTrading: true })).toThrow(
      "READ_ONLY_CONFIG_FAILED",
    );
  });

  it("rejects credential-bearing OAuth URLs and exposes only safe error text", () => {
    expect(validateAuthorizeUrl("https://www.bitget.com/authorize?publicKey=abc")).toContain("publicKey=abc");
    expect(() => validateAuthorizeUrl("https://www.bitget.com/authorize?apiKey=secret")).toThrow(
      "OAUTH_URL_UNSAFE",
    );
    expect(safeConnectorMessage("OAUTH_FAILED")).not.toContain(SECRET);
  });
});
