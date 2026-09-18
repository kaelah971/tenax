// Tenax Phase 1A — Zod validation for externally sourced / user-entered
// domain objects. Minimal by design; domain.ts remains the type authority.

import { z } from "zod";

export const exposureRepresentationSchema = z.object({
  symbol: z.literal("RNVDAUSDT"),
  provider: z.literal("Bitget"),
  venue: z.literal("Bitget Reality"),
  baseCoin: z.literal("rNVDA"),
  quoteCoin: z.literal("USDT"),
  category: z.literal("SPOT"),
  status: z.literal("online"),
  isReality: z.literal(true),
  minOrderQty: z.literal(0.0001),
  minOrderAmount: z.literal(10),
  pricePrecision: z.literal(2),
  quantityPrecision: z.literal(4),
});

export const exposureSchema = z.object({
  id: z.string().min(1),
  underlying: z.string().min(1),
  representation: exposureRepresentationSchema,
  exposureValueUsdt: z.number().positive(),
  valueSource: z.enum(["fixture", "live"]),
});

export const protectionIntentSchema = z.object({
  id: z.string().min(1),
  type: z.literal("PROTECT_EVENT_RISK"),
  exposureId: z.string().min(1),
  eventId: z.string().nullable(),
  rawText: z.string().min(1),
  createdAt: z.string().min(1),
});

export const protectionProposalSchema = z.object({
  underlying: z.string().min(1),
  protectionPct: z.number().min(0).max(100),
  proposedTradeValueUsdt: z.number().nonnegative(),
  leverageUsed: z.boolean(),
});

export const mandateSchema = z.object({
  allowedUnderlying: z.string().min(1),
  maxProtectionPct: z.number().min(0).max(100),
  maxTradeValueUsdt: z.number().positive(),
  leverageAllowed: z.boolean(),
  approvalRequired: z.boolean(),
});

export const executionModeSchema = z.enum(["DRY_RUN", "BITGET_DEMO"]);

export const approvalStateSchema = z.enum([
  "REQUIRED",
  "APPROVED",
  "NOT_REQUIRED",
]);
