// Tenax — development-only in-memory flow store.
//
// NON-DURABLE BY DESIGN. This storage is suitable ONLY for local/demo
// development: it lives as long as the current server process, resets on
// restart, is NOT safe across users, and Vercel/serverless durability is
// NOT guaranteed (instances are ephemeral and may serve a request each).
// Durable persistence remains a later task (build plan Phase 4); no product
// decision may assume a flow survives a redeploy.
//
// WHY globalThis: under Next.js dev/Turbopack, route handlers and server
// pages can evaluate this module in separate chunk realms, so a
// module-level `const store = ...` is NOT reliably shared between the API
// route that creates a flow and the page that reads it (observed: analyze
// POST succeeds, /app/analysis/<id> 404s in the same process). globalThis
// is process-wide, so getTenaxDevStore() is the ONE canonical accessor —
// every route and page must call it per invocation, never cache a
// module-level singleton of their own.
//
// Product logic must never import this module — only route handlers,
// server pages, and tests may.

import { ProtectionFlow } from "./orchestrator";

export interface TenaxDevStore {
  readonly flows: Map<string, ProtectionFlow>;
  counter: number;
}

export function createDevStore(): TenaxDevStore {
  return { flows: new Map<string, ProtectionFlow>(), counter: 0 };
}

export function nextFlowId(store: TenaxDevStore): string {
  store.counter += 1;
  return `flow-${String(store.counter).padStart(4, "0")}`;
}

declare global {
  var __tenaxDevStore: TenaxDevStore | undefined;
}

/**
 * Canonical development store handle. Same instance for every caller in
 * this server process, regardless of which chunk realm evaluates this
 * module. Non-durable: see module header.
 */
export function getTenaxDevStore(): TenaxDevStore {
  if (!globalThis.__tenaxDevStore) {
    globalThis.__tenaxDevStore = createDevStore();
  }
  return globalThis.__tenaxDevStore;
}
