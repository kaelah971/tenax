// Tenax Phase 1D — demo-reliability snapshot cache (server use only).
//
// The 8-endpoint Reality fetch costs ~10s sequentially. This opt-in cache
// keeps the judge demo navigable while preserving honest provenance: every
// snapshot carries its own fetchedAt, and the UI labels data age from it.
// Default 60s TTL. Unit tests inject stub providers — no network here.

import { fetchRealityBundle, type PublicHttpClient, type RealityPublicBundle } from "./reality";
import { normalizeNvidiaSnapshot, type NvidiaMarketSnapshot } from "../intelligence/snapshot";

export interface SnapshotCache {
  getBundle(): Promise<RealityPublicBundle>;
  getSnapshot(): Promise<NvidiaMarketSnapshot>;
  clear(): void;
}

export function createSnapshotCache(
  ttlMs = 60_000,
  client?: PublicHttpClient,
  fetchOptions?: { gapMs?: number },
): SnapshotCache {
  let bundle: RealityPublicBundle | null = null;
  let cachedAtMs = 0;
  async function getBundle(): Promise<RealityPublicBundle> {
    const now = Date.now();
    if (bundle && now - cachedAtMs < ttlMs) return bundle;
    bundle = await fetchRealityBundle(client, fetchOptions ?? {});
    cachedAtMs = now;
    return bundle;
  }
  return {
    getBundle,
    async getSnapshot(): Promise<NvidiaMarketSnapshot> {
      return normalizeNvidiaSnapshot(await getBundle());
    },
    clear() {
      bundle = null;
      cachedAtMs = 0;
    },
  };
}

/** Shared demo cache for pages and API routes (single-process). */
const demoSnapshotCache = createSnapshotCache(60_000);

export function getDemoBundle(): Promise<RealityPublicBundle> {
  return demoSnapshotCache.getBundle();
}

export function getDemoSnapshot(): Promise<NvidiaMarketSnapshot> {
  return demoSnapshotCache.getSnapshot();
}
