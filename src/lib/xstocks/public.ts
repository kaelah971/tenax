// Tenax Phase 3B-A — xStocks public read-only adapter (NVDAx discovery).
//
// Safety contract (do not weaken without owner approval):
// - Public GET only, no API key, no auth headers, no secrets, no signatures.
//   The xStocks public surface (docs.xstocks.fi) explicitly serves these
//   endpoints without authentication; authenticated client/trade endpoints
//   are out of scope and must never be added here.
// - Exactly five allowed requests, all GET, enforced by
//   assertXstocksPublicAllowed: asset details, price-data, multiplier
//   (requires ?network=), system status, oracles. No mint, no redeem, no
//   bridge, no swap, no signing, no transaction submission.
// - Sequential requests with a conservative gap, single attempt each
//   (no retries). Per-request timeout. Typed, validated responses: raw
//   provider shapes never leave this module unnormalized.
// - Never guess: absent fields stay null, unrecognized shapes yield null,
//   and anything unverified reports UNAVAILABLE — never a community value.
//   In particular the Solana mint address is retained EXACTLY as the
//   official API returns it, or null when the API omits it.
//
// Authority: https://docs.xstocks.fi/apis/openapi (v2, production
// https://api.xstocks.fi/api/v2). Verified live 2026-09-21: asset,
// price-data, multiplier?network=Solana, system/status, oracles all 200.

import type { GraphRepresentation } from "../tenax/exposure-graph.ts";

export const XSTOCKS_BASE_URL = "https://api.xstocks.fi/api/v2";
export const XSTOCKS_NVDAX_SYMBOL = "NVDAx";
export const XSTOCKS_SOLANA_NETWORK = "Solana";
/** Canonical Tenax subject NVDAx must map to. Compared exactly — no prefix logic. */
export const NVDA_SUBJECT_SYMBOL = "NVDA";

export const DEFAULT_XSTOCKS_TIMEOUT_MS = 15_000;
export const DEFAULT_XSTOCKS_GAP_MS = 500;
const USER_AGENT = "tenax-xstocks-3b-a";

/**
 * Token standard for Solana xStocks, per the official developer docs
 * (SPL Token-2022 with the Scaled UI extension). Platform-level documented
 * fact — NOT a per-asset API field, never attached to the graph as
 * API-verified data. Display context only.
 */
export const SOLANA_TOKEN_STANDARD_DOC = {
  standard: "SPL Token-2022",
  extension: "Scaled UI",
  source: "xStocks developer docs (platform standard)",
} as const;

/** Injectable fetch boundary — tests stub this, product code never touches network directly. */
export interface XstocksJsonResponse {
  readonly httpStatus: number;
  readonly body: unknown;
}

export interface XstocksPublicClient {
  getJson(url: string): Promise<XstocksJsonResponse>;
}

export function createDefaultXstocksClient(
  timeoutMs: number = DEFAULT_XSTOCKS_TIMEOUT_MS,
): XstocksPublicClient {
  return {
    async getJson(url: string): Promise<XstocksJsonResponse> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          method: "GET",
          headers: { Accept: "application/json", "User-Agent": USER_AGENT },
          signal: controller.signal,
        });
        const text = await res.text();
        let body: unknown = null;
        try {
          body = JSON.parse(text) as unknown;
        } catch {
          body = { _nonJson: text.slice(0, 300) };
        }
        return { httpStatus: res.status, body };
      } finally {
        clearTimeout(timer);
      }
      // NOTE: transport failures throw; fetchNvdaxDiscovery classifies them
      // as endpoint failures. Nothing is retried.
    },
  };
}

/** Exact allowlist — the five documented public GET paths used here. */
export const XSTOCKS_PUBLIC_ALLOWLIST: readonly string[] = [
  `/public/assets/${XSTOCKS_NVDAX_SYMBOL}`,
  `/public/assets/${XSTOCKS_NVDAX_SYMBOL}/price-data`,
  `/public/assets/${XSTOCKS_NVDAX_SYMBOL}/multiplier`,
  `/public/system/status/${XSTOCKS_NVDAX_SYMBOL}`,
  `/public/oracles/${XSTOCKS_NVDAX_SYMBOL}`,
];

/**
 * Enforce the read-only boundary. Throws on anything that is not exactly
 * GET against an allowlisted public path. No network, no secrets involved.
 */
export function assertXstocksPublicAllowed(method: string, requestPath: string): void {
  const path = requestPath.split("?")[0] ?? requestPath;
  const allowed =
    method.toUpperCase() === "GET" &&
    XSTOCKS_PUBLIC_ALLOWLIST.some((entry) => entry === path);
  if (!allowed) {
    throw new Error(
      `refused: xStocks ${method} ${requestPath} is not an allowlisted public GET`,
    );
  }
}

// ---- Small coercion helpers (never throw, never guess) --------------------

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  return null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

// ---- Normalized shapes ----------------------------------------------------

export interface XstocksDeployment {
  readonly network: string;
  /** Provider address retained exactly (trimmed only), or null when absent. */
  readonly address: string | null;
}

export interface NvdaxAsset {
  readonly symbol: string;
  readonly name: string | null;
  readonly isin: string | null;
  /** Explicit official underlying symbol (underlying.symbol preferred, deprecated underlyingSymbol fallback). */
  readonly underlyingSymbol: string | null;
  readonly underlyingName: string | null;
  readonly isTradingHalted: boolean | null;
  readonly tradingHalted: boolean | null;
  readonly deployments: readonly XstocksDeployment[];
}

export interface NvdaxPrice {
  /** Latest indicative quote in USD. Positive finite only. */
  readonly quote: number;
}

export interface NvdaxMultiplier {
  readonly currentMultiplier: number | null;
  readonly newMultiplier: number | null;
  readonly activationDateTime: number | null;
  readonly reason: string | null;
}

export interface NvdaxSystemStatus {
  readonly symbol: string;
  readonly isMarketTradingHalted: boolean | null;
  readonly isAtomicTradingHalted: boolean | null;
}

export interface NvdaxOracleRef {
  readonly network: string;
  readonly managedBy: string | null;
  /** First available feed reference (feedId / hermesId / verifier), else null. */
  readonly reference: string | null;
}

/** Normalize GET /public/assets/{symbol}. Null on unrecognized shapes. */
export function normalizeNvdaxAsset(body: unknown): NvdaxAsset | null {
  const root = asRecord(body);
  if (!root) return null;
  const symbol = asTrimmedString(root.symbol);
  if (symbol === null) return null;
  const underlying = asRecord(root.underlying);
  const underlyingSymbol =
    asTrimmedString(underlying?.symbol) ?? asTrimmedString(root.underlyingSymbol);
  const rawDeployments = Array.isArray(root.deployments) ? root.deployments : [];
  const deployments: XstocksDeployment[] = [];
  for (const entry of rawDeployments) {
    const row = asRecord(entry);
    if (!row) continue;
    const network = asTrimmedString(row.network);
    if (network === null) continue;
    deployments.push({ network, address: asTrimmedString(row.address) });
  }
  const trading = asRecord(root.trading);
  return {
    symbol,
    name: asTrimmedString(root.name),
    isin: asTrimmedString(root.isin),
    underlyingSymbol,
    underlyingName: asTrimmedString(underlying?.symbol) ?? null,
    isTradingHalted: asBoolean(root.isTradingHalted),
    tradingHalted: asBoolean(trading?.isTradingHalted),
    deployments,
  };
}

/** Pick the preferred-network deployment. Address kept exactly, else null. */
export function normalizeSolanaDeployment(
  asset: NvdaxAsset | null,
  network: string = XSTOCKS_SOLANA_NETWORK,
): XstocksDeployment | null {
  if (!asset) return null;
  const want = network.toUpperCase();
  const found =
    asset.deployments.find((d) => d.network.toUpperCase() === want) ?? null;
  if (!found) return null;
  return { network: found.network, address: found.address };
}

/** Normalize GET /public/assets/{symbol}/price-data. Null unless a positive finite quote. */
export function normalizeNvdaxPrice(body: unknown): NvdaxPrice | null {
  const root = asRecord(body);
  if (!root) return null;
  const quote = asFiniteNumber(root.quote);
  if (quote === null || quote <= 0) return null;
  return { quote };
}

/** Normalize GET /public/assets/{symbol}/multiplier?network=. Null on unrecognized shapes. */
export function normalizeNvdaxMultiplier(body: unknown): NvdaxMultiplier | null {
  const root = asRecord(body);
  if (!root) return null;
  if (!("currentMultiplier" in root)) return null;
  return {
    currentMultiplier: asFiniteNumber(root.currentMultiplier),
    newMultiplier: asFiniteNumber(root.newMultiplier),
    activationDateTime: asFiniteNumber(root.activationDateTime),
    reason: asTrimmedString(root.reason),
  };
}

/** Normalize GET /public/system/status/{symbol}. Null on unrecognized shapes. */
export function normalizeNvdaxSystemStatus(body: unknown): NvdaxSystemStatus | null {
  const root = asRecord(body);
  if (!root) return null;
  const symbol = asTrimmedString(root.symbol);
  if (symbol === null) return null;
  return {
    symbol,
    isMarketTradingHalted: asBoolean(root.isMarketTradingHalted),
    isAtomicTradingHalted: asBoolean(root.isAtomicTradingHalted),
  };
}

/** Normalize GET /public/oracles/{symbol}, filtered to one network. Never throws. */
export function normalizeNvdaxOracles(
  body: unknown,
  network: string = XSTOCKS_SOLANA_NETWORK,
): readonly NvdaxOracleRef[] {
  const root = asRecord(body);
  if (!root || !Array.isArray(root.nodes)) return [];
  const want = network.toUpperCase();
  const out: NvdaxOracleRef[] = [];
  for (const entry of root.nodes) {
    const row = asRecord(entry);
    if (!row) continue;
    const nodeNetwork = asTrimmedString(row.network);
    if (nodeNetwork === null || nodeNetwork.toUpperCase() !== want) continue;
    const metadata = asRecord(row.metadata);
    out.push({
      network: nodeNetwork,
      managedBy: asTrimmedString(row.managedBy),
      reference:
        asTrimmedString(metadata?.feedId) ??
        asTrimmedString(metadata?.hermesId) ??
        asTrimmedString(metadata?.verifierContract),
    });
  }
  return out;
}

// ---- Identity check (explicit metadata only — no ticker heuristics) --------

export interface NvdaxIdentity {
  readonly mapping: "PASS" | "FAIL";
  /** Canonical subject when PASS, else null. */
  readonly subjectId: "NVDA" | null;
  readonly detail: string;
}

/**
 * NVDAx may map to canonical subject NVDA only when the official asset
 * metadata carries the explicit underlying symbol NVDA — via
 * underlying.symbol (preferred) or the deprecated underlyingSymbol field.
 * Symbol-prefix resemblance is never consulted: an unrelated ticker with
 * a different underlying FAILs even if its symbol starts with NVDA.
 */
export function evaluateNvdaxIdentity(asset: NvdaxAsset | null): NvdaxIdentity {
  if (!asset) {
    return { mapping: "FAIL", subjectId: null, detail: "asset metadata unavailable" };
  }
  if (asset.underlyingSymbol !== null && asset.underlyingSymbol === NVDA_SUBJECT_SYMBOL) {
    return {
      mapping: "PASS",
      subjectId: "NVDA",
      detail: `official underlyingSymbol=${asset.underlyingSymbol} for ${asset.symbol}`,
    };
  }
  return {
    mapping: "FAIL",
    subjectId: null,
    detail: `official underlyingSymbol=${asset.underlyingSymbol ?? "absent"} does not map to NVDA`,
  };
}

// ---- Discovery bundle ------------------------------------------------------

export type DiscoveryOverall = "PASS" | "PARTIAL" | "FAIL";

export interface NvdaxDiscovery {
  readonly symbol: string;
  readonly network: string;
  readonly asset: NvdaxAsset | null;
  readonly solana: XstocksDeployment | null;
  readonly price: NvdaxPrice | null;
  readonly multiplier: NvdaxMultiplier | null;
  readonly systemStatus: NvdaxSystemStatus | null;
  readonly oracles: readonly NvdaxOracleRef[];
  readonly identity: NvdaxIdentity;
  /** FAIL = asset missing/unparseable or identity FAIL. PARTIAL = asset ok, ≥1 aux missing. PASS = all five present. */
  readonly overall: DiscoveryOverall;
  readonly failedEndpoints: readonly string[];
}

async function getAllowed(
  client: XstocksPublicClient,
  baseUrl: string,
  path: string,
): Promise<XstocksJsonResponse | null> {
  assertXstocksPublicAllowed("GET", path);
  try {
    const res = await client.getJson(`${baseUrl}${path}`);
    return res.httpStatus === 200 ? res : null;
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch the five documented public endpoints sequentially (single attempt
 * each, conservative gap). Read-only. Overall semantics: asset or identity
 * failure is FAIL; a complete asset with any auxiliary gap is PARTIAL;
 * all five normalized is PASS.
 */
export async function fetchNvdaxDiscovery(
  client: XstocksPublicClient,
  options?: {
    readonly baseUrl?: string;
    readonly symbol?: string;
    readonly network?: string;
    readonly gapMs?: number;
  },
): Promise<NvdaxDiscovery> {
  const baseUrl = (options?.baseUrl ?? XSTOCKS_BASE_URL).replace(/\/+$/, "");
  const symbol = (options?.symbol ?? XSTOCKS_NVDAX_SYMBOL).trim() || XSTOCKS_NVDAX_SYMBOL;
  const network = (options?.network ?? XSTOCKS_SOLANA_NETWORK).trim() || XSTOCKS_SOLANA_NETWORK;
  const gapMs = options?.gapMs ?? DEFAULT_XSTOCKS_GAP_MS;
  const failedEndpoints: string[] = [];

  const assetPath = `/public/assets/${symbol}`;
  const assetRes = await getAllowed(client, baseUrl, assetPath);
  const asset = assetRes ? normalizeNvdaxAsset(assetRes.body) : null;
  if (!assetRes || !asset) failedEndpoints.push("asset");
  await sleep(gapMs);

  const pricePath = `/public/assets/${symbol}/price-data`;
  const priceRes = await getAllowed(client, baseUrl, pricePath);
  const price = priceRes ? normalizeNvdaxPrice(priceRes.body) : null;
  if (!priceRes || !price) failedEndpoints.push("price-data");
  await sleep(gapMs);

  const multiplierPath = `/public/assets/${symbol}/multiplier?network=${encodeURIComponent(network)}`;
  const multiplierRes = await getAllowed(client, baseUrl, multiplierPath);
  const multiplier = multiplierRes ? normalizeNvdaxMultiplier(multiplierRes.body) : null;
  if (!multiplierRes || !multiplier) failedEndpoints.push("multiplier");
  await sleep(gapMs);

  const statusPath = `/public/system/status/${symbol}`;
  const statusRes = await getAllowed(client, baseUrl, statusPath);
  const systemStatus = statusRes ? normalizeNvdaxSystemStatus(statusRes.body) : null;
  if (!statusRes || !systemStatus) failedEndpoints.push("system-status");
  await sleep(gapMs);

  const oraclesPath = `/public/oracles/${symbol}`;
  const oraclesRes = await getAllowed(client, baseUrl, oraclesPath);
  const oracles = oraclesRes ? normalizeNvdaxOracles(oraclesRes.body, network) : [];
  if (!oraclesRes || oracles.length === 0) failedEndpoints.push("oracles");

  const identity = evaluateNvdaxIdentity(asset);
  const overall: DiscoveryOverall =
    !asset || identity.mapping === "FAIL"
      ? "FAIL"
      : failedEndpoints.length === 0
        ? "PASS"
        : "PARTIAL";

  return {
    symbol,
    network,
    asset,
    solana: normalizeSolanaDeployment(asset, network),
    price,
    multiplier,
    systemStatus,
    oracles,
    identity,
    overall,
    failedEndpoints,
  };
}

// ---- Graph bridge (availability, NOT ownership) -----------------------------

/**
 * Map verified discovery to an AVAILABLE external representation leaf.
 * This is deliberately NOT an owned exposure and NOT a protective action:
 * quantity and usdValue stay null (nothing is held), direction stays null,
 * and the note states availability without ownership. The metadata itself
 * is REAL (official API); the leaf's role keeps that fact from ever
 * reading as a user position. Returns null when identity FAILs or the
 * preferred-network deployment is absent — availability must be proven,
 * never assumed.
 */
export function toAvailableRepresentation(
  discovery: NvdaxDiscovery,
): GraphRepresentation | null {
  if (discovery.identity.mapping !== "PASS") return null;
  const deployment = discovery.solana;
  if (!deployment || !deployment.address) return null;
  const halted =
    discovery.asset?.isTradingHalted === true ||
    discovery.asset?.tradingHalted === true ||
    discovery.systemStatus?.isMarketTradingHalted === true;
  const unknownHalt =
    discovery.asset?.isTradingHalted == null &&
    discovery.asset?.tradingHalted == null &&
    discovery.systemStatus?.isMarketTradingHalted == null;
  return {
    representationId: discovery.symbol,
    subjectId: "NVDA",
    symbol: deployment.address,
    venue: `xStocks · ${deployment.network}`,
    ecosystem: "unknown",
    instrumentType: "unknown",
    role: "available",
    direction: null,
    quantity: null,
    usdValue: null,
    leverage: null,
    marginMode: null,
    status: unknownHalt ? "unknown" : halted ? "offline" : "online",
    provenance: "REAL",
    note: "AVAILABLE — NOT OWNED · NOT A POSITION",
  };
}
