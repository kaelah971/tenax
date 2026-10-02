// Tenax Connected Mode — server-owned identity and sanitized account contracts.
//
// This module deliberately contains no Bitget credentials and no execution
// fields. Account snapshots are provider data reduced to the read-only DTO
// that Tenax is allowed to retain.
import { z } from "zod";

const nonEmptyText = z.string().trim().min(1);
const isoDate = z.string().datetime({ offset: true });
const decimalText = z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/);
const nullableDecimalText = decimalText.nullable();
const nullableProviderUserId = nonEmptyText.max(200).nullable();

export const CONNECTED_PROVIDER = "BITGET" as const;
export const CONNECTED_ACCESS_MODE = "READ_ONLY" as const;

export const connectionStatusSchema = z.enum([
  "NOT_CONNECTED",
  "PAIRING",
  "CONNECTED",
  "STALE",
  "DISCONNECTED",
  "ERROR",
]);

export const storedConnectionStatusSchema = z.enum([
  "PAIRING",
  "CONNECTED",
  "STALE",
  "DISCONNECTED",
  "ERROR",
]);

export const pairingStatusSchema = z.enum([
  "PENDING",
  "CONSUMED",
  "EXPIRED",
  "REVOKED",
]);

export const connectedUserSchema = z
  .object({
    id: nonEmptyText.max(128),
    createdAt: isoDate,
  })
  .strict();

export const pairingRecordSchema = z
  .object({
    id: nonEmptyText.max(128),
    userId: nonEmptyText.max(128),
    sessionId: nonEmptyText.max(128),
    secretHash: z.string().regex(/^[a-f0-9]{64}$/),
    status: pairingStatusSchema,
    createdAt: isoDate,
    expiresAt: isoDate,
    consumedAt: isoDate.nullable(),
    connectionId: nonEmptyText.max(128).nullable(),
  })
  .strict();

export const connectedSessionSchema = z
  .object({
    id: nonEmptyText.max(128),
    userId: nonEmptyText.max(128),
    createdAt: isoDate,
    expiresAt: isoDate,
    lastSeenAt: isoDate,
    revokedAt: isoDate.nullable(),
  })
  .strict();

export const accountAssetSchema = z
  .object({
    asset: nonEmptyText.max(64),
    available: nullableDecimalText,
    frozen: nullableDecimalText,
    equity: nullableDecimalText,
    usdValue: nullableDecimalText,
  })
  .strict();

export const accountPositionSchema = z
  .object({
    symbol: nonEmptyText.max(128),
    side: nonEmptyText.max(32).nullable(),
    size: nullableDecimalText,
    entryPrice: nullableDecimalText,
    markPrice: nullableDecimalText,
    leverage: nullableDecimalText,
    unrealizedPnl: nullableDecimalText,
  })
  .strict();

/** The only account payload Connected Mode may retain or render. */
export const accountSnapshotSchema = z
  .object({
    connectionId: nonEmptyText.max(128),
    provider: z.literal(CONNECTED_PROVIDER),
    providerUserId: nullableProviderUserId,
    connectionStatus: connectionStatusSchema,
    accessMode: z.literal(CONNECTED_ACCESS_MODE),
    syncedAt: isoDate,
    assets: z.array(accountAssetSchema).max(500),
    positions: z.array(accountPositionSchema).max(500),
  })
  .strict();

export const bitgetConnectionRecordSchema = z
  .object({
    id: nonEmptyText.max(128),
    userId: nonEmptyText.max(128),
    provider: z.literal(CONNECTED_PROVIDER),
    providerUserId: nullableProviderUserId,
    status: storedConnectionStatusSchema,
    accessMode: z.literal(CONNECTED_ACCESS_MODE),
    createdAt: isoDate,
    updatedAt: isoDate,
    disconnectedAt: isoDate.nullable(),
  })
  .strict();

/** Safe DTO: ownership internals never cross the server/client boundary. */
export const bitgetConnectionPublicSchema = z
  .object({
    id: nonEmptyText.max(128),
    provider: z.literal(CONNECTED_PROVIDER),
    providerUserId: nullableProviderUserId,
    status: storedConnectionStatusSchema,
    accessMode: z.literal(CONNECTED_ACCESS_MODE),
    createdAt: isoDate,
    updatedAt: isoDate,
    disconnectedAt: isoDate.nullable(),
  })
  .strict();

export const connectedAccountOverviewSchema = z
  .object({
    connection: bitgetConnectionPublicSchema.nullable(),
    latestSnapshot: accountSnapshotSchema.nullable(),
  })
  .strict();

export type ConnectedUser = z.infer<typeof connectedUserSchema>;
export type PairingRecord = z.infer<typeof pairingRecordSchema>;
export type PairingStatus = z.infer<typeof pairingStatusSchema>;
export type ConnectedSession = z.infer<typeof connectedSessionSchema>;
export type AccountSnapshot = z.infer<typeof accountSnapshotSchema>;
export type BitgetConnectionRecord = z.infer<typeof bitgetConnectionRecordSchema>;
export type BitgetConnectionPublic = z.infer<typeof bitgetConnectionPublicSchema>;
export type ConnectedAccountOverview = z.infer<typeof connectedAccountOverviewSchema>;
export type ConnectionStatus = z.infer<typeof connectionStatusSchema>;
