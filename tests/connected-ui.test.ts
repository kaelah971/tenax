import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { accountSnapshotSchema } from "@/lib/connected/model";
import {
  CONNECTED_SNAPSHOT_STALE_MS,
  connectedAccountStateLabel,
  connectedAccountViewState,
} from "@/lib/connected/presentation";

const NOW = new Date("2026-10-03T12:00:00.000Z");

describe("Connected Account UI truth states", () => {
  it("keeps a fresh last-known snapshot connected and marks old data stale", () => {
    expect(
      connectedAccountViewState({
        connectionStatus: "CONNECTED",
        hasSnapshot: true,
        syncedAt: new Date(NOW.getTime() - 1_000).toISOString(),
        now: NOW,
      }),
    ).toBe("CONNECTED");
    expect(
      connectedAccountViewState({
        connectionStatus: "CONNECTED",
        hasSnapshot: true,
        syncedAt: new Date(NOW.getTime() - CONNECTED_SNAPSHOT_STALE_MS - 1).toISOString(),
        now: NOW,
      }),
    ).toBe("SYNC_STALE");
    expect(connectedAccountStateLabel("SYNC_STALE")).toBe("SYNC STALE");
  });

  it("renders honest waiting, disconnected, and error states without fake balances", () => {
    expect(
      connectedAccountViewState({ connectionStatus: "PAIRING", hasSnapshot: false, syncedAt: null, now: NOW }),
    ).toBe("AWAITING_FIRST_SYNC");
    expect(
      connectedAccountViewState({ connectionStatus: "NOT_CONNECTED", hasSnapshot: false, syncedAt: null, now: NOW }),
    ).toBe("NOT_CONNECTED");
    expect(
      connectedAccountViewState({ connectionStatus: "DISCONNECTED", hasSnapshot: true, syncedAt: NOW.toISOString(), now: NOW }),
    ).toBe("DISCONNECTED");
    expect(
      connectedAccountViewState({ connectionStatus: "ERROR", hasSnapshot: true, syncedAt: NOW.toISOString(), now: NOW }),
    ).toBe("ERROR");

    const snapshot = accountSnapshotSchema.parse({
      connectionId: "connection-a",
      provider: "BITGET",
      providerUserId: "bitget-user-a",
      connectionStatus: "CONNECTED",
      accessMode: "READ_ONLY",
      syncedAt: NOW.toISOString(),
      assets: [],
      positions: [],
    });
    expect(snapshot.assets).toHaveLength(0);
    expect(snapshot.positions).toHaveLength(0);
  });

  it("shows hosted personal-account connection as coming soon and keeps Demo entry available", () => {
    const page = readFileSync(resolve(process.cwd(), "src", "app", "app", "connected", "page.tsx"), "utf8");
    expect(page).toContain("PERSONAL BITGET ACCOUNTS");
    expect(page).toContain("Bring your own portfolio into Tenax.");
    expect(page).toContain("COMING SOON — HOSTED CONNECTION");
    expect(page).toContain("No installation is required for the main Tenax experience.");
    expect(page).toContain("Personal-account trading is not enabled.");
    expect(page).toContain('href="/app/protect/nvidia"');
    expect(page).toContain("LAUNCH NVIDIA PROTECTION");
    expect(page).not.toContain("CONNECT BITGET");
    expect(page).not.toContain("INSTALL TENAX CONNECTOR");
    expect(page).not.toContain("TRY AGAIN");
    expect(page).not.toContain("PAIRING CODE");
    expect(page).not.toContain("127.0.0.1");
    expect(page).not.toContain("TENAX CONNECTOR NOT DETECTED");
  });
});
