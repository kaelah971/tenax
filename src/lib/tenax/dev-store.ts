// Tenax Phase 1C — development-only in-memory flow store.
//
// WARNING: non-durable, single-process, NOT session-safe across users and
// NOT persistence. Acceptable only as isolated demo state until a real
// persistence layer lands (build plan Phase 4). Product logic must never
// import this module — only route handlers and tests may.
//
// Each createDevStore() call is an isolated namespace: flows created in one
// store are invisible to all others (proven by test).

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
