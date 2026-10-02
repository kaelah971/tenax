// Tenax Connected Mode — one-time pairing credential primitives.
//
// Pairing codes are displayable, high-entropy, case-insensitive hex values.
// Only the normalized hash crosses into the repository. The raw value is
// returned by the creation route once and is never logged or persisted.
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

export const PAIRING_TTL_SECONDS = 10 * 60;
export const PAIRING_CODE_LENGTH = 48;

export const pairingConsumeInputSchema = z
  .object({
    pairingCode: z.string().trim().min(1).max(128),
  })
  .strict();

export function createPairingCode(): string {
  return randomBytes(PAIRING_CODE_LENGTH / 2).toString("hex").toUpperCase();
}

export function normalizePairingCode(value: string): string | null {
  const normalized = value.replace(/[\s-]/g, "").toUpperCase();
  return /^[0-9A-F]{48}$/.test(normalized) ? normalized : null;
}

export function formatPairingCode(value: string): string {
  const normalized = normalizePairingCode(value);
  if (!normalized) throw new Error("PAIRING_CODE_INVALID");
  return normalized.match(/.{1,4}/g)?.join("-") ?? normalized;
}

export function hashPairingCode(value: string): string {
  const normalized = normalizePairingCode(value);
  if (!normalized) throw new Error("PAIRING_CODE_INVALID");
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

export function pairingExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + PAIRING_TTL_SECONDS * 1000);
}
