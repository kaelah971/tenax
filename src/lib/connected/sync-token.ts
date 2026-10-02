// Tenax Connected Mode — connection-scoped connector sync credential.
//
// This token is independent from the one-time pairing code. The raw value is
// returned once to the local connector; only its SHA-256 hash is persisted.
import { createHash, randomBytes } from "node:crypto";

export const CONNECTOR_SYNC_TOKEN_BYTES = 32;
export const CONNECTOR_SYNC_TOKEN_LENGTH = 43;

export function createConnectionSyncToken(): string {
  return randomBytes(CONNECTOR_SYNC_TOKEN_BYTES).toString("base64url");
}

export function normalizeConnectionSyncToken(value: string | undefined): string | null {
  if (!value || value.length !== CONNECTOR_SYNC_TOKEN_LENGTH || !/^[A-Za-z0-9_-]+$/.test(value)) {
    return null;
  }
  return value;
}

export function hashConnectionSyncToken(value: string): string {
  const normalized = normalizeConnectionSyncToken(value);
  if (!normalized) throw new Error("CONNECTED_SYNC_TOKEN_INVALID");
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}
