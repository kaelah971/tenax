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

  it("pins the personal-account boundary, stale retention, and no-invention copy", () => {
    const page = readFileSync(resolve(process.cwd(), "src", "app", "app", "connected", "page.tsx"), "utf8");
    const panel = readFileSync(resolve(process.cwd(), "src", "app", "app", "connected", "AccountSnapshotPanel.tsx"), "utf8");
    const disconnectButton = readFileSync(resolve(process.cwd(), "src", "app", "app", "connected", "DisconnectButton.tsx"), "utf8");
    const disconnectRoute = readFileSync(resolve(process.cwd(), "src", "app", "api", "connected", "disconnect", "route.ts"), "utf8");
    const repository = readFileSync(resolve(process.cwd(), "src", "lib", "connected", "repository.ts"), "utf8");
    expect(panel).toContain("CONNECTED ACCOUNT · YOUR BITGET DATA");
    expect(page).toContain("DEMO MODE");
    expect(page).toContain("This session never reads the shared Demo account.");
    expect(panel).toContain("SYNC STALE · LAST KNOWN DATA RETAINED");
    expect(disconnectButton).toContain("DISCONNECT BITGET");
    expect(panel).toContain("Tenax can no longer accept snapshots from this connection.");
    expect(disconnectRoute).toContain("isSameOrigin");
    expect(repository).toContain("sync_token_hash = NULL");
    expect(panel).toContain("No balances or positions are fabricated here.");
    expect(panel).not.toContain("$0");
  });
});
