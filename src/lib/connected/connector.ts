// Tenax Connected Mode — local Bitget Agentic connector boundary.
//
// The official SDK OAuth flow and credential file stay on the connector
// machine. Tenax receives only the one-time pairing bootstrap and sanitized
// snapshots. A separate connection-scoped sync token is retained locally so
// a failed upload can be retried without repeating OAuth.
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import {
  BitgetRestClient,
  getOperation,
  loadConfig,
  loadCredentials,
  startOAuthFlow,
  waitForOAuthFlow,
} from "@bitget-ai/bitget-agent-sdk";
import type {
  BitgetConfig,
  OAuthSession,
  StartOAuthFlowResult,
} from "@bitget-ai/bitget-agent-sdk";
import { z } from "zod";

import { accountSnapshotSchema, type AccountSnapshot } from "./model.ts";
import { normalizePairingCode } from "./pairing.ts";
import { normalizeConnectionSyncToken } from "./sync-token.ts";
import {
  sanitizeConnectedSnapshot,
  summarizeConnectedSnapshot,
  type ConnectedProviderRead,
  type ConnectorSummary,
} from "./snapshot.ts";

export const CONNECTOR_READ_OPERATION_IDS = [
  "getAccountInfo",
  "getAccountAssets",
  "getPositionInfo",
] as const;

const pairingBootstrapSchema = z
  .object({
    ok: z.literal(true),
    status: z.literal("PAIRING"),
    connectionId: z.string().trim().min(1).max(128),
    provider: z.literal("BITGET"),
    accessMode: z.literal("READ_ONLY"),
    syncToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict();

const snapshotUploadResponseSchema = z
  .object({
    ok: z.literal(true),
    connectionId: z.string().trim().min(1).max(128),
    provider: z.literal("BITGET"),
    providerUserId: z.string().trim().min(1).max(200).nullable(),
    status: z.literal("CONNECTED"),
    accessMode: z.literal("READ_ONLY"),
    syncedAt: z.string().datetime({ offset: true }),
  })
  .strict();

const localConnectorMetadataSchema = z
  .object({
    version: z.literal(1),
    serverOrigin: z.string().url(),
    connectionId: z.string().trim().min(1).max(128),
    syncToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    provider: z.literal("BITGET"),
    providerUserId: z.string().trim().min(1).max(200).nullable(),
    accessMode: z.literal("READ_ONLY"),
    createdAt: z.string().datetime({ offset: true }),
    lastSuccessfulLocalSync: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();

export type ConnectorErrorCode =
  | "USAGE_INVALID"
  | "SERVER_ORIGIN_INVALID"
  | "PAIRING_INPUT_INVALID"
  | "PAIRING_REJECTED"
  | "PAIRING_RESPONSE_INVALID"
  | "SERVER_UNAVAILABLE"
  | "OAUTH_START_FAILED"
  | "OAUTH_URL_UNSAFE"
  | "OAUTH_FAILED"
  | "PROVIDER_IDENTITY_INVALID"
  | "LOCAL_CREDENTIALS_UNAVAILABLE"
  | "READ_ONLY_CONFIG_FAILED"
  | "ACCOUNT_READ_FAILED"
  | "SANITIZATION_FAILED"
  | "SYNC_TOKEN_INVALID"
  | "SYNC_UNAUTHORIZED"
  | "SYNC_UNAVAILABLE"
  | "SNAPSHOT_UPLOAD_REJECTED"
  | "LOCAL_METADATA_FAILED"
  | "LOCAL_METADATA_UNAVAILABLE";

const SAFE_ERROR_MESSAGES: Record<ConnectorErrorCode, string> = {
  USAGE_INVALID: "Connector arguments are invalid.",
  SERVER_ORIGIN_INVALID: "Server origin is invalid.",
  PAIRING_INPUT_INVALID: "Pairing code is invalid.",
  PAIRING_REJECTED: "Pairing code was rejected or has expired.",
  PAIRING_RESPONSE_INVALID: "Pairing response was not a safe read-only bootstrap.",
  SERVER_UNAVAILABLE: "Tenax server is unavailable.",
  OAUTH_START_FAILED: "Local Bitget authorization could not start.",
  OAUTH_URL_UNSAFE: "Bitget authorization URL was rejected as unsafe.",
  OAUTH_FAILED: "Local Bitget authorization was cancelled, timed out, or failed.",
  PROVIDER_IDENTITY_INVALID: "Bitget provider identity could not be verified.",
  LOCAL_CREDENTIALS_UNAVAILABLE: "Local Bitget OAuth credentials are unavailable.",
  READ_ONLY_CONFIG_FAILED: "Bitget read-only configuration could not be established.",
  ACCOUNT_READ_FAILED: "Bitget account read failed.",
  SANITIZATION_FAILED: "Provider account data failed strict sanitization.",
  SYNC_TOKEN_INVALID: "Connector sync authorization is invalid.",
  SYNC_UNAUTHORIZED: "Connector sync authorization was rejected.",
  SYNC_UNAVAILABLE: "Tenax snapshot sync is unavailable.",
  SNAPSHOT_UPLOAD_REJECTED: "Tenax rejected the sanitized snapshot.",
  LOCAL_METADATA_FAILED: "Local connector metadata could not be saved.",
  LOCAL_METADATA_UNAVAILABLE: "Local connector sync metadata is unavailable.",
};

export class ConnectorError extends Error {
  readonly code: ConnectorErrorCode;

  constructor(code: ConnectorErrorCode) {
    super(code);
    this.name = "ConnectorError";
    this.code = code;
  }
}

export function safeConnectorMessage(code: ConnectorErrorCode): string {
  return SAFE_ERROR_MESSAGES[code];
}

export function validateServerOrigin(value: string): string {
  try {
    const url = new URL(value);
    const localHttpHost = new Set(["localhost", "127.0.0.1", "[::1]"]);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && localHttpHost.has(url.hostname))) {
      throw new ConnectorError("SERVER_ORIGIN_INVALID");
    }
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      throw new ConnectorError("SERVER_ORIGIN_INVALID");
    }
    return url.origin;
  } catch (error) {
    if (error instanceof ConnectorError) throw error;
    throw new ConnectorError("SERVER_ORIGIN_INVALID");
  }
}

export function validateAuthorizeUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new ConnectorError("OAUTH_URL_UNSAFE");
    }
    if (url.username || url.password) throw new ConnectorError("OAUTH_URL_UNSAFE");
    if (/(api[_-]?key|secret(?:key)?|passphrase|data[_-]?key|signature|authorization)/i.test(`${url.search}${url.hash}`)) {
      throw new ConnectorError("OAUTH_URL_UNSAFE");
    }
    return url.toString();
  } catch (error) {
    if (error instanceof ConnectorError) throw error;
    throw new ConnectorError("OAUTH_URL_UNSAFE");
  }
}

export interface ConnectorHttpResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export type ConnectorFetch = (
  url: string,
  init: {
    readonly method: "POST";
    readonly headers: Record<string, string>;
    readonly body: string;
  },
) => Promise<ConnectorHttpResponse>;

export interface PairingBootstrap {
  readonly connectionId: string;
  readonly provider: "BITGET";
  readonly status: "PAIRING";
  readonly accessMode: "READ_ONLY";
  /** Raw value returned once; callers must keep it local and never log it. */
  readonly syncToken: string;
}

export interface SafePairingBootstrap {
  readonly connectionId: string;
  readonly provider: "BITGET";
  readonly status: "PAIRING";
  readonly accessMode: "READ_ONLY";
}

function safePairingBootstrap(bootstrap: PairingBootstrap): SafePairingBootstrap {
  return {
    connectionId: bootstrap.connectionId,
    provider: bootstrap.provider,
    status: bootstrap.status,
    accessMode: bootstrap.accessMode,
  };
}

export async function consumePairingWithServer(input: {
  readonly serverOrigin: string;
  readonly pairingCode: string;
  readonly fetchImpl?: ConnectorFetch;
}): Promise<PairingBootstrap> {
  const origin = validateServerOrigin(input.serverOrigin);
  const pairingCode = normalizePairingCode(input.pairingCode);
  if (!pairingCode) throw new ConnectorError("PAIRING_INPUT_INVALID");
  const fetchImpl: ConnectorFetch = input.fetchImpl ?? (globalThis.fetch as ConnectorFetch);

  let response: ConnectorHttpResponse;
  try {
    response = await fetchImpl(`${origin}/api/connected/pair/consume`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ pairingCode }),
    });
  } catch {
    throw new ConnectorError("SERVER_UNAVAILABLE");
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    if (response.status >= 500) throw new ConnectorError("SERVER_UNAVAILABLE");
    throw new ConnectorError("PAIRING_REJECTED");
  }
  const parsed = pairingBootstrapSchema.safeParse(body);
  if (!parsed.success) throw new ConnectorError("PAIRING_RESPONSE_INVALID");
  return parsed.data;
}

export interface SnapshotUploadReceipt {
  readonly connectionId: string;
  readonly provider: "BITGET";
  readonly providerUserId: string | null;
  readonly status: "CONNECTED";
  readonly accessMode: "READ_ONLY";
  readonly syncedAt: string;
}

export async function uploadSnapshotWithServer(input: {
  readonly serverOrigin: string;
  readonly syncToken: string;
  readonly snapshot: AccountSnapshot;
  readonly fetchImpl?: ConnectorFetch;
}): Promise<SnapshotUploadReceipt> {
  const origin = validateServerOrigin(input.serverOrigin);
  const syncToken = normalizeConnectionSyncToken(input.syncToken);
  if (!syncToken) throw new ConnectorError("SYNC_TOKEN_INVALID");
  const parsedSnapshot = accountSnapshotSchema.safeParse(input.snapshot);
  if (!parsedSnapshot.success) throw new ConnectorError("SNAPSHOT_UPLOAD_REJECTED");
  const fetchImpl: ConnectorFetch = input.fetchImpl ?? (globalThis.fetch as ConnectorFetch);

  let response: ConnectorHttpResponse;
  try {
    response = await fetchImpl(`${origin}/api/connected/snapshot`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${syncToken}`,
      },
      body: JSON.stringify(parsedSnapshot.data),
    });
  } catch {
    throw new ConnectorError("SYNC_UNAVAILABLE");
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new ConnectorError("SYNC_UNAUTHORIZED");
    }
    if (response.status >= 500) throw new ConnectorError("SYNC_UNAVAILABLE");
    throw new ConnectorError("SNAPSHOT_UPLOAD_REJECTED");
  }
  const parsed = snapshotUploadResponseSchema.safeParse(body);
  if (!parsed.success) throw new ConnectorError("SNAPSHOT_UPLOAD_REJECTED");
  if (parsed.data.connectionId !== parsedSnapshot.data.connectionId) {
    throw new ConnectorError("SNAPSHOT_UPLOAD_REJECTED");
  }
  return parsed.data;
}

export interface LocalConnectorMetadata {
  readonly version: 1;
  readonly serverOrigin: string;
  readonly connectionId: string;
  readonly syncToken: string;
  readonly provider: "BITGET";
  readonly providerUserId: string | null;
  readonly accessMode: "READ_ONLY";
  readonly createdAt: string;
  readonly lastSuccessfulLocalSync: string | null;
}

export interface ConnectorLocalStore {
  save(metadata: LocalConnectorMetadata): Promise<void>;
  loadLatest(): Promise<LocalConnectorMetadata | null>;
  clear(): Promise<void>;
}

export function createFileConnectorStore(
  filePath = join(homedir(), ".tenax", "connected-sync.json"),
): ConnectorLocalStore {
  return {
    async save(metadata) {
      const parsed = localConnectorMetadataSchema.safeParse(metadata);
      if (!parsed.success) throw new ConnectorError("LOCAL_METADATA_FAILED");
      validateServerOrigin(parsed.data.serverOrigin);
      const directory = dirname(filePath);
      const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
      try {
        await mkdir(directory, { recursive: true, mode: 0o700 });
        await writeFile(temporaryPath, JSON.stringify(parsed.data), { encoding: "utf8", mode: 0o600 });
        await chmod(temporaryPath, 0o600);
        await rename(temporaryPath, filePath);
      } catch {
        await unlink(temporaryPath).catch(() => {});
        throw new ConnectorError("LOCAL_METADATA_FAILED");
      }
    },
    async loadLatest() {
      try {
        const parsed = localConnectorMetadataSchema.safeParse(
          JSON.parse(await readFile(filePath, "utf8")) as unknown,
        );
        if (!parsed.success) return null;
        const serverOrigin = validateServerOrigin(parsed.data.serverOrigin);
        return { ...parsed.data, serverOrigin };
      } catch {
        return null;
      }
    },
    async clear() {
      try {
        await unlink(filePath);
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
        throw new ConnectorError("LOCAL_METADATA_FAILED");
      }
    },
  };
}

export interface LocalOAuthIdentity {
  readonly providerUserId: string;
}

export interface LocalOAuthAdapter {
  start(): Promise<{ authorizeUrl: string; session: unknown }>;
  wait(session: unknown, timeoutMs?: number): Promise<LocalOAuthIdentity>;
}

export interface ReadOnlyProviderReader {
  readonly readOnly: true;
  read(): Promise<ConnectedProviderRead>;
}

export function assertReadOnlySdkConfig(config: Pick<BitgetConfig, "readOnly" | "paperTrading">): void {
  if (config.readOnly !== true || config.paperTrading === true) {
    throw new ConnectorError("READ_ONLY_CONFIG_FAILED");
  }
  for (const operationId of CONNECTOR_READ_OPERATION_IDS) {
    const operation = getOperation(operationId);
    if (!operation || operation.method !== "GET" || operation.auth !== "private" || operation.isWrite) {
      throw new ConnectorError("READ_ONLY_CONFIG_FAILED");
    }
  }
}

export function createOfficialOAuthAdapter(): LocalOAuthAdapter {
  return {
    async start() {
      let flow: StartOAuthFlowResult;
      try {
        flow = await startOAuthFlow();
      } catch {
        throw new ConnectorError("OAUTH_START_FAILED");
      }
      return {
        authorizeUrl: validateAuthorizeUrl(flow.authorizeUrl),
        session: flow.session,
      };
    },
    async wait(session, timeoutMs) {
      try {
        const result = await waitForOAuthFlow(session as OAuthSession, { timeoutMs });
        if (typeof result.credentials?.userId !== "string") {
          throw new ConnectorError("PROVIDER_IDENTITY_INVALID");
        }
        const providerUserId = result.credentials.userId.trim();
        if (providerUserId === "" || providerUserId.length > 200) {
          throw new ConnectorError("PROVIDER_IDENTITY_INVALID");
        }
        return { providerUserId };
      } catch (error) {
        if (error instanceof ConnectorError) throw error;
        throw new ConnectorError("OAUTH_FAILED");
      }
    },
  };
}

export async function createOfficialReadOnlyProviderReader(
  identity: LocalOAuthIdentity,
): Promise<ReadOnlyProviderReader> {
  let credentials;
  try {
    credentials = await loadCredentials();
  } catch {
    throw new ConnectorError("LOCAL_CREDENTIALS_UNAVAILABLE");
  }
  if (!credentials || credentials.userId !== identity.providerUserId) {
    throw new ConnectorError("PROVIDER_IDENTITY_INVALID");
  }

  let config: BitgetConfig;
  try {
    // Explicit local OAuth credentials take precedence over inherited repo/.env values.
    // They never leave this local process.
    config = loadConfig({
      apiKey: credentials.apiKey,
      secretKey: credentials.secretKey,
      passphrase: credentials.passphrase,
      modules: "account,trade",
      surface: "intent",
      readOnly: true,
    });
    assertReadOnlySdkConfig(config);
  } catch (error) {
    if (error instanceof ConnectorError) throw error;
    throw new ConnectorError("READ_ONLY_CONFIG_FAILED");
  }

  const client = new BitgetRestClient(config);
  return {
    readOnly: true,
    async read() {
      try {
        const [, assets, positions] = await Promise.all([
          client.callOperation("getAccountInfo"),
          client.callOperation("getAccountAssets"),
          client.callOperation("getPositionInfo", { category: "USDT-FUTURES" }),
        ]);
        return { assets: assets.data, positions: positions.data };
      } catch {
        throw new ConnectorError("ACCOUNT_READ_FAILED");
      }
    },
  };
}

export interface ConnectorSafeMetadata {
  readonly serverOrigin: string;
  readonly connectionId: string;
  readonly provider: "BITGET";
  readonly providerUserId: string;
  readonly accessMode: "READ_ONLY";
  readonly lastSuccessfulLocalSync: string;
}

export interface ConnectorResult {
  readonly bootstrap: SafePairingBootstrap | null;
  readonly snapshot: AccountSnapshot;
  readonly upload: SnapshotUploadReceipt;
  readonly summary: ConnectorSummary;
  readonly metadata: ConnectorSafeMetadata;
}

export interface ConnectorDependencies {
  readonly fetchImpl: ConnectorFetch;
  readonly oauth: LocalOAuthAdapter;
  readonly createProviderReader: (identity: LocalOAuthIdentity) => Promise<ReadOnlyProviderReader>;
  readonly uploadSnapshot?: (input: {
    readonly serverOrigin: string;
    readonly syncToken: string;
    readonly snapshot: AccountSnapshot;
  }) => Promise<SnapshotUploadReceipt>;
  readonly localStore?: ConnectorLocalStore;
  readonly now: () => Date;
}

const defaultConnectorFetch: ConnectorFetch = async (url, init) => fetch(url, init);

function defaultUploader(fetchImpl: ConnectorFetch) {
  return (input: {
    readonly serverOrigin: string;
    readonly syncToken: string;
    readonly snapshot: AccountSnapshot;
  }) => uploadSnapshotWithServer({ ...input, fetchImpl });
}

function initialLocalMetadata(input: {
  readonly serverOrigin: string;
  readonly bootstrap: PairingBootstrap;
  readonly now: Date;
}): LocalConnectorMetadata {
  return {
    version: 1,
    serverOrigin: input.serverOrigin,
    connectionId: input.bootstrap.connectionId,
    syncToken: input.bootstrap.syncToken,
    provider: "BITGET",
    providerUserId: null,
    accessMode: "READ_ONLY",
    createdAt: input.now.toISOString(),
    lastSuccessfulLocalSync: null,
  };
}

function safeMetadata(
  serverOrigin: string,
  connectionId: string,
  providerUserId: string,
  syncedAt: string,
): ConnectorSafeMetadata {
  return {
    serverOrigin,
    connectionId,
    provider: "BITGET",
    providerUserId,
    accessMode: "READ_ONLY",
    lastSuccessfulLocalSync: syncedAt,
  };
}

function syncedSnapshot(snapshot: AccountSnapshot, receipt: SnapshotUploadReceipt): AccountSnapshot {
  if (
    receipt.connectionId !== snapshot.connectionId ||
    receipt.provider !== "BITGET" ||
    receipt.accessMode !== "READ_ONLY" ||
    receipt.status !== "CONNECTED"
  ) {
    throw new ConnectorError("SNAPSHOT_UPLOAD_REJECTED");
  }
  const parsed = accountSnapshotSchema.safeParse({
    ...snapshot,
    connectionId: receipt.connectionId,
    providerUserId: receipt.providerUserId ?? snapshot.providerUserId,
    connectionStatus: receipt.status,
    accessMode: receipt.accessMode,
    syncedAt: receipt.syncedAt,
  });
  if (!parsed.success) throw new ConnectorError("SNAPSHOT_UPLOAD_REJECTED");
  return parsed.data;
}

async function saveLocalMetadata(store: ConnectorLocalStore, metadata: LocalConnectorMetadata): Promise<void> {
  try {
    await store.save(metadata);
  } catch (error) {
    if (error instanceof ConnectorError) throw error;
    throw new ConnectorError("LOCAL_METADATA_FAILED");
  }
}

async function readProviderAndSanitize(input: {
  readonly reader: ReadOnlyProviderReader;
  readonly connectionId: string;
  readonly providerUserId: string;
  readonly now: Date;
}): Promise<AccountSnapshot> {
  if (input.reader.readOnly !== true) throw new ConnectorError("READ_ONLY_CONFIG_FAILED");
  let providerRead: ConnectedProviderRead;
  try {
    providerRead = await input.reader.read();
  } catch (error) {
    if (error instanceof ConnectorError) throw error;
    throw new ConnectorError("ACCOUNT_READ_FAILED");
  }
  try {
    return sanitizeConnectedSnapshot({
      connectionId: input.connectionId,
      providerUserId: input.providerUserId,
      providerRead,
      syncedAt: input.now,
    });
  } catch {
    throw new ConnectorError("SANITIZATION_FAILED");
  }
}

export function createDefaultConnectorDependencies(): ConnectorDependencies {
  const fetchImpl = defaultConnectorFetch;
  return {
    fetchImpl,
    oauth: createOfficialOAuthAdapter(),
    createProviderReader: createOfficialReadOnlyProviderReader,
    uploadSnapshot: defaultUploader(fetchImpl),
    localStore: createFileConnectorStore(),
    now: () => new Date(),
  };
}

export async function runLocalConnector(
  input: {
    readonly serverOrigin: string;
    readonly pairingCode: string;
    readonly oauthTimeoutMs?: number;
    readonly onAuthorizeUrl?: (authorizeUrl: string) => void;
  },
  dependencies: ConnectorDependencies,
): Promise<ConnectorResult> {
  const origin = validateServerOrigin(input.serverOrigin);
  const bootstrap = await consumePairingWithServer({
    serverOrigin: origin,
    pairingCode: input.pairingCode,
    fetchImpl: dependencies.fetchImpl,
  });
  const localStore = dependencies.localStore ?? createFileConnectorStore();
  const uploadSnapshot = dependencies.uploadSnapshot ?? defaultUploader(dependencies.fetchImpl);
  await saveLocalMetadata(
    localStore,
    initialLocalMetadata({ serverOrigin: origin, bootstrap, now: dependencies.now() }),
  );

  let oauthStart: { authorizeUrl: string; session: unknown };
  try {
    oauthStart = await dependencies.oauth.start();
    const safeAuthorizeUrl = validateAuthorizeUrl(oauthStart.authorizeUrl);
    input.onAuthorizeUrl?.(safeAuthorizeUrl);
  } catch (error) {
    if (error instanceof ConnectorError) throw error;
    throw new ConnectorError("OAUTH_START_FAILED");
  }

  let identity: LocalOAuthIdentity;
  try {
    identity = await dependencies.oauth.wait(oauthStart.session, input.oauthTimeoutMs);
  } catch (error) {
    if (error instanceof ConnectorError) throw error;
    throw new ConnectorError("OAUTH_FAILED");
  }
  await saveLocalMetadata(
    localStore,
    {
      ...initialLocalMetadata({ serverOrigin: origin, bootstrap, now: dependencies.now() }),
      providerUserId: identity.providerUserId,
    },
  );

  let reader: ReadOnlyProviderReader;
  try {
    reader = await dependencies.createProviderReader(identity);
  } catch (error) {
    if (error instanceof ConnectorError) throw error;
    throw new ConnectorError("READ_ONLY_CONFIG_FAILED");
  }
  const snapshot = await readProviderAndSanitize({
    reader,
    connectionId: bootstrap.connectionId,
    providerUserId: identity.providerUserId,
    now: dependencies.now(),
  });

  const upload = await uploadSnapshot({
    serverOrigin: origin,
    syncToken: bootstrap.syncToken,
    snapshot,
  });
  const finalSnapshot = syncedSnapshot(snapshot, upload);
  await saveLocalMetadata(localStore, {
    ...initialLocalMetadata({ serverOrigin: origin, bootstrap, now: dependencies.now() }),
    providerUserId: upload.providerUserId ?? identity.providerUserId,
    lastSuccessfulLocalSync: upload.syncedAt,
  });
  const providerUserId = upload.providerUserId ?? identity.providerUserId;
  return {
    bootstrap: safePairingBootstrap(bootstrap),
    snapshot: finalSnapshot,
    upload,
    summary: summarizeConnectedSnapshot(finalSnapshot),
    metadata: safeMetadata(origin, upload.connectionId, providerUserId, upload.syncedAt),
  };
}

export interface LocalConnectorCleanupResult {
  readonly status: "LOCAL_METADATA_CLEARED";
  readonly providerCredentials: "UNCHANGED";
  readonly remoteBitgetRevocation: "NOT_REQUESTED";
}

export async function clearLocalConnector(
  dependencies: ConnectorDependencies,
): Promise<LocalConnectorCleanupResult> {
  const localStore = dependencies.localStore ?? createFileConnectorStore();
  try {
    await localStore.clear();
  } catch (error) {
    if (error instanceof ConnectorError) throw error;
    throw new ConnectorError("LOCAL_METADATA_FAILED");
  }
  return {
    status: "LOCAL_METADATA_CLEARED",
    providerCredentials: "UNCHANGED",
    remoteBitgetRevocation: "NOT_REQUESTED",
  };
}

export async function retryLocalConnector(
  dependencies: ConnectorDependencies,
): Promise<ConnectorResult> {
  const localStore = dependencies.localStore ?? createFileConnectorStore();
  let metadata: LocalConnectorMetadata | null;
  try {
    metadata = await localStore.loadLatest();
  } catch {
    throw new ConnectorError("LOCAL_METADATA_UNAVAILABLE");
  }
  if (!metadata || !metadata.providerUserId) {
    throw new ConnectorError("LOCAL_METADATA_UNAVAILABLE");
  }
  const uploadSnapshot = dependencies.uploadSnapshot ?? defaultUploader(dependencies.fetchImpl);
  let reader: ReadOnlyProviderReader;
  try {
    reader = await dependencies.createProviderReader({ providerUserId: metadata.providerUserId });
  } catch (error) {
    if (error instanceof ConnectorError) throw error;
    throw new ConnectorError("READ_ONLY_CONFIG_FAILED");
  }
  const snapshot = await readProviderAndSanitize({
    reader,
    connectionId: metadata.connectionId,
    providerUserId: metadata.providerUserId,
    now: dependencies.now(),
  });
  const upload = await uploadSnapshot({
    serverOrigin: validateServerOrigin(metadata.serverOrigin),
    syncToken: metadata.syncToken,
    snapshot,
  });
  const finalSnapshot = syncedSnapshot(snapshot, upload);
  await saveLocalMetadata(localStore, {
    ...metadata,
    providerUserId: upload.providerUserId ?? metadata.providerUserId,
    lastSuccessfulLocalSync: upload.syncedAt,
  });
  const providerUserId = upload.providerUserId ?? metadata.providerUserId;
  return {
    bootstrap: null,
    snapshot: finalSnapshot,
    upload,
    summary: summarizeConnectedSnapshot(finalSnapshot),
    metadata: safeMetadata(metadata.serverOrigin, upload.connectionId, providerUserId, upload.syncedAt),
  };
}
