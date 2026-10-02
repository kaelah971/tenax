import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createPairingCode,
  formatPairingCode,
  hashPairingCode,
  normalizePairingCode,
  pairingConsumeInputSchema,
  pairingExpiresAt,
} from "@/lib/connected/pairing";
import { PostgresConnectedRepository } from "@/lib/connected/repository";
import { CONNECTED_MODE_SCHEMA_SQL } from "@/lib/connected/schema";
import { isSameOrigin } from "@/lib/connected/session";

const NOW = new Date("2026-10-02T12:00:00.000Z");

function pairingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "pairing-a",
    user_id: "user-a",
    session_id: "session-a",
    secret_hash: "a".repeat(64),
    status: "PENDING",
    created_at: NOW,
    expires_at: new Date("2026-10-02T12:10:00.000Z"),
    consumed_at: null,
    connection_id: null,
    ...overrides,
  };
}

function simpleFactory(
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

class RowLock {
  private held = false;
  private readonly waiters: Array<() => void> = [];

  async acquire(): Promise<void> {
    if (!this.held) {
      this.held = true;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  release(): void {
    const next = this.waiters.shift();
    if (next) next();
    else this.held = false;
  }
}

class ConcurrentPairingDatabase {
  status = "PENDING";
  consumedAt: Date | null = null;
  connectionId: string | null = null;
  readonly connections: string[] = [];
  readonly lock = new RowLock();

  row() {
    return pairingRow({
      status: this.status,
      consumed_at: this.consumedAt,
      connection_id: this.connectionId,
    });
  }
}

function concurrentFactory(
  database: ConcurrentPairingDatabase,
  queries: Array<{ text: string; values?: unknown[] }>,
) {
  return async () => {
    let ownsLock = false;
    return {
      connect: async () => {},
      query: async (text: string, values?: unknown[]) => {
        queries.push({ text, values });
        if (text.includes("CREATE TABLE IF NOT EXISTS")) return { rows: [] };
        if (text === "BEGIN") return { rows: [] };
        if (text === "COMMIT" || text === "ROLLBACK") {
          if (ownsLock) {
            ownsLock = false;
            database.lock.release();
          }
          return { rows: [] };
        }
        if (text.includes("WHERE secret_hash = $1 FOR UPDATE")) {
          await database.lock.acquire();
          ownsLock = true;
          return database.status === "MISSING" ? { rows: [] } : { rows: [database.row()] };
        }
        if (text.includes("INSERT INTO tenax_bitget_connections")) {
          database.connections.push(String(values?.[0]));
          return { rows: [] };
        }
        if (text.includes("SET status = 'EXPIRED'")) {
          database.status = "EXPIRED";
          return { rows: [] };
        }
        if (text.includes("SET status = 'CONSUMED'")) {
          if (database.status !== "PENDING") return { rows: [] };
          database.status = "CONSUMED";
          database.consumedAt = new Date(String(values?.[1]));
          database.connectionId = String(values?.[2]);
          return { rows: [database.row()] };
        }
        return { rows: [] };
      },
      end: async () => {},
    };
  };
}

describe("Connected Mode one-time pairing", () => {
  it("creates a high-entropy display code and hashes only its normalized form", () => {
    const code = createPairingCode();
    expect(code).toMatch(/^[0-9A-F]{48}$/);
    expect(formatPairingCode(code)).toMatch(/^(?:[0-9A-F]{4}-){11}[0-9A-F]{4}$/);
    expect(normalizePairingCode(formatPairingCode(code))).toBe(code);
    expect(hashPairingCode(code)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashPairingCode(code)).not.toContain(code);
    expect(pairingExpiresAt(NOW).getTime() - NOW.getTime()).toBe(10 * 60 * 1000);
  });

  it("accepts only the pairing credential and rejects provider credentials", () => {
    expect(pairingConsumeInputSchema.safeParse({ pairingCode: "A".repeat(48) }).success).toBe(true);
    expect(
      pairingConsumeInputSchema.safeParse({ pairingCode: "A".repeat(48), apiKey: "never" }).success,
    ).toBe(false);
    expect(normalizePairingCode("not-a-code")).toBeNull();
  });

  it("creates a pending record with a hash and revokes the owner's older pending code", async () => {
    const queries: Array<{ text: string; values?: unknown[] }> = [];
    const secretHash = "b".repeat(64);
    const repository = new PostgresConnectedRepository(
      "postgres://user:password@localhost:5432/tenax",
      simpleFactory((text) => {
        if (text.includes("CREATE TABLE IF NOT EXISTS")) return { rows: [] };
        if (text.includes("RETURNING id, user_id, session_id, secret_hash")) {
          return { rows: [pairingRow({ secret_hash: secretHash })] };
        }
        return { rows: [] };
      }, queries),
    );

    const created = await repository.createPairing({
      userId: "user-a",
      sessionId: "session-a",
      secretHash,
      now: NOW,
      expiresAt: pairingExpiresAt(NOW),
    });
    expect(created.status).toBe("PENDING");
    expect(created.secretHash).toBe(secretHash);
    expect(queries.some((query) => query.text.includes("status = 'REVOKED'"))).toBe(true);
    const insert = queries.find((query) => query.text.includes("INSERT INTO tenax_connected_pairings"));
    expect(insert?.values).toContain(secretHash);
    expect(JSON.stringify(queries)).not.toContain("A".repeat(48));
  });

  it("expires a pending code and returns the same generic result as an invalid code", async () => {
    const queries: Array<{ text: string; values?: unknown[] }> = [];
    const database = new ConcurrentPairingDatabase();
    const expired = pairingRow({ expires_at: new Date("2026-10-02T11:59:00.000Z") });
    const repository = new PostgresConnectedRepository(
      "postgres://user:password@localhost:5432/tenax",
      simpleFactory((text) => {
        if (text.includes("CREATE TABLE IF NOT EXISTS")) return { rows: [] };
        if (text.includes("WHERE secret_hash = $1 FOR UPDATE")) return { rows: [expired] };
        return { rows: [] };
      }, queries),
    );

    const consumed = await repository.consumePairing({ secretHash: "a".repeat(64), now: NOW });
    expect(consumed).toBeNull();
    expect(queries.some((query) => query.text.includes("SET status = 'EXPIRED'"))).toBe(true);
    expect(database.connections).toHaveLength(0);
  });

  it("allows exactly one successful concurrent consume and rejects replay", async () => {
    const database = new ConcurrentPairingDatabase();
    const queries: Array<{ text: string; values?: unknown[] }> = [];
    const repository = new PostgresConnectedRepository(
      "postgres://user:password@localhost:5432/tenax",
      concurrentFactory(database, queries),
    );
    const secretHash = "a".repeat(64);

    const results = await Promise.all([
      repository.consumePairing({ secretHash, now: NOW }),
      repository.consumePairing({ secretHash, now: NOW }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results.filter((result) => result === null)).toHaveLength(1);
    expect(database.status).toBe("CONSUMED");
    expect(database.connections).toHaveLength(1);
    const successful = results.find(Boolean);
    expect(successful?.pairing.userId).toBe("user-a");
    expect(successful?.status).toBe("PAIRING");
    expect(successful?.accessMode).toBe("READ_ONLY");

    const replay = await repository.consumePairing({ secretHash, now: NOW });
    expect(replay).toBeNull();
  });

  it("scopes pending-pairing inspection to the authenticated session owner", async () => {
    const queries: Array<{ text: string; values?: unknown[] }> = [];
    const repository = new PostgresConnectedRepository(
      "postgres://user:password@localhost:5432/tenax",
      simpleFactory((text, values) => {
        if (text.includes("CREATE TABLE IF NOT EXISTS")) return { rows: [] };
        if (text.includes("SELECT id, user_id, session_id") && values?.[0] === "user-a") {
          return { rows: [pairingRow()] };
        }
        return { rows: [] };
      }, queries),
    );

    expect(
      await repository.getCurrentPairingForSession({ userId: "user-a", sessionId: "session-a", now: NOW }),
    ).not.toBeNull();
    expect(
      await repository.getCurrentPairingForSession({ userId: "user-b", sessionId: "session-b", now: NOW }),
    ).toBeNull();
    const lookup = queries.find((query) => query.text.includes("status = 'PENDING' AND expires_at > $3"));
    expect(lookup?.text).toContain("user_id = $1 AND session_id = $2");
  });

  it("rejects cross-origin browser mutations while allowing connector requests without Origin", () => {
    expect(
      isSameOrigin(new Request("https://tenax.test/api/connected/pair", {
        headers: { origin: "https://evil.test", host: "tenax.test" },
      })),
    ).toBe(false);
    expect(
      isSameOrigin(new Request("https://tenax.test/api/connected/pair", {
        headers: { origin: "https://tenax.test", host: "tenax.test" },
      })),
    ).toBe(true);
    expect(isSameOrigin(new Request("https://tenax.test/api/connected/pair"))).toBe(true);
  });

  it("keeps pairing state out of provider, proof, and notification surfaces", () => {
    const pairRoute = readFileSync(resolve(process.cwd(), "src", "app", "api", "connected", "pair", "route.ts"), "utf8");
    const consumeRoute = readFileSync(resolve(process.cwd(), "src", "app", "api", "connected", "pair", "consume", "route.ts"), "utf8");
    const panel = readFileSync(resolve(process.cwd(), "src", "app", "app", "connected", "PairingPanel.tsx"), "utf8");
    expect(pairRoute).toContain("getCurrentConnectedSession");
    expect(pairRoute).toContain("pairingCode: formatPairingCode(pairingCode)");
    expect(consumeRoute).not.toMatch(/BITGET_API_KEY|BITGET_SECRET_KEY|secretKey|passphrase|dataKey|authorization/i);
    expect(pairRoute).not.toMatch(/BITGET_API_KEY|BITGET_SECRET_KEY|secretKey|passphrase|dataKey|authorization/i);
    expect(panel).toContain("COPY CODE");
    expect(panel).toContain("GENERATE NEW CODE");
    expect(panel).not.toContain("/api/notifications");
    expect(panel).not.toContain("/api/proof");
    expect(pairRoute).toContain("expiresAt: expiresAt.toISOString()");
    expect(CONNECTED_MODE_SCHEMA_SQL).toContain("tenax_connected_pairings");
    expect(CONNECTED_MODE_SCHEMA_SQL).toContain("secret_hash TEXT NOT NULL UNIQUE");
    expect(CONNECTED_MODE_SCHEMA_SQL).toContain("status IN ('PENDING', 'CONSUMED', 'EXPIRED', 'REVOKED')");
  });

  it("uses no Bitget provider client or Demo credential path in this slice", () => {
    const connectedRoot = resolve(process.cwd(), "src", "lib", "connected");
    const files = ["pairing.ts", "repository.ts", "session.ts"].map((file) =>
      readFileSync(resolve(connectedRoot, file), "utf8"),
    );
    expect(files.join("\n")).not.toMatch(/BITGET_API_KEY|BITGET_SECRET_KEY|secretKey|passphrase|dataKey|place-order|executeProtection/i);
  });
});

