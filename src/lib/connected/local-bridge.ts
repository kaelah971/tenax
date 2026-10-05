// Tenax Connected Mode — loopback-only local connector bridge.
//
// The bridge receives pairing data only in a strict POST body from an
// explicitly allowed Tenax origin. The custom tenax:// launch URI never
// carries pairing data, and responses expose only safe bridge state.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { z } from "zod";

import {
  createDefaultConnectorDependencies,
  runLocalConnector,
  validateServerOrigin,
  type ConnectorProgressState,
  type ConnectorResult,
} from "./connector.ts";
import { normalizePairingCode } from "./pairing.ts";
import {
  LOCAL_BRIDGE_HANDOFF_PATH,
  LOCAL_BRIDGE_HOST,
  LOCAL_BRIDGE_MAX_BODY_BYTES,
  LOCAL_BRIDGE_PORT,
  LOCAL_BRIDGE_STATUS_PATH,
} from "./local-bridge-contract.ts";

export {
  LOCAL_BRIDGE_HANDOFF_PATH,
  LOCAL_BRIDGE_HOST,
  LOCAL_BRIDGE_MAX_BODY_BYTES,
  LOCAL_BRIDGE_PORT,
  LOCAL_BRIDGE_STATUS_PATH,
} from "./local-bridge-contract.ts";

export type LocalBridgeState =
  | "CONNECTOR_READY"
  | "HANDOFF_ACCEPTED"
  | "OAUTH_PENDING"
  | "SYNCING"
  | "CONNECTED"
  | "FAILED";

export type LocalBridgeErrorCode =
  | "ORIGIN_REQUIRED"
  | "ORIGIN_NOT_ALLOWED"
  | "QUERY_NOT_ALLOWED"
  | "METHOD_NOT_ALLOWED"
  | "CONTENT_TYPE_INVALID"
  | "BODY_TOO_LARGE"
  | "HANDOFF_INVALID"
  | "BRIDGE_BUSY"
  | "CONNECTOR_FAILED";

export interface LocalBridgeStatus {
  readonly state: LocalBridgeState;
  readonly errorCode: LocalBridgeErrorCode | null;
}

export interface LocalBridgeConnectorInput {
  readonly serverOrigin: string;
  readonly pairingCode: string;
  readonly onAuthorizeUrl: (authorizeUrl: string) => void;
  readonly onProgress: (state: ConnectorProgressState) => void;
}

export type LocalBridgeConnector = (
  input: LocalBridgeConnectorInput,
) => Promise<ConnectorResult | unknown>;

export interface LocalBridgeOptions {
  /** Explicit Tenax origins. The bridge never trusts Host or arbitrary Origin values. */
  readonly allowedServerOrigins: readonly string[];
  /** Port 0 is supported only for injected tests; production defaults to the fixed port. */
  readonly port?: number;
  readonly runConnector?: LocalBridgeConnector;
  /** Opens an already validated Bitget authorization URL on the local device. */
  readonly openAuthorizeUrl?: (authorizeUrl: string) => void;
}

export interface LocalBridgeHandle {
  readonly host: typeof LOCAL_BRIDGE_HOST;
  readonly server: Server;
  readonly port: number;
  start(): Promise<{ readonly host: typeof LOCAL_BRIDGE_HOST; readonly port: number }>;
  stop(): Promise<void>;
  status(): LocalBridgeStatus;
}

const handoffSchema = z
  .object({
    serverOrigin: z.string().trim().min(1).max(2048),
    pairingCode: z.string().trim().min(1).max(128),
  })
  .strict();

class BodyTooLargeError extends Error {
  constructor() {
    super("BODY_TOO_LARGE");
    this.name = "BodyTooLargeError";
  }
}

function headerValue(request: IncomingMessage, name: string): string | null {
  const value = request.headers[name];
  return typeof value === "string" ? value : null;
}

function requestOrigin(request: IncomingMessage): string | null {
  const rawOrigin = headerValue(request, "origin");
  if (!rawOrigin || rawOrigin === "null") return null;
  try {
    return validateServerOrigin(rawOrigin);
  } catch {
    return null;
  }
}

function hasQuery(url: string): boolean {
  return url.includes("?");
}

function writeJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  origin: string | null,
): void {
  const serialized = JSON.stringify(body);
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    ...(origin
      ? {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "GET, OPTIONS, POST",
          Vary: "Origin",
        }
      : {}),
  });
  response.end(serialized);
}

function writeEmpty(
  response: ServerResponse,
  status: number,
  origin: string | null,
  allowPrivateNetwork = false,
): void {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    ...(origin
      ? {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "GET, OPTIONS, POST",
          ...(allowPrivateNetwork ? { "Access-Control-Allow-Private-Network": "true" } : {}),
          Vary: "Origin",
        }
      : {}),
  });
  response.end();
}

function bridgeFailure(
  response: ServerResponse,
  status: number,
  code: LocalBridgeErrorCode,
  origin: string | null,
): void {
  writeJson(response, status, { ok: false, code }, origin);
}

function readJsonBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    const rejectOnce = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    request.on("data", (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.byteLength;
      if (total > LOCAL_BRIDGE_MAX_BODY_BYTES) {
        request.resume();
        rejectOnce(new BodyTooLargeError());
        return;
      }
      chunks.push(buffer);
    });
    request.on("error", () => rejectOnce(new Error("BODY_INVALID")));
    request.on("end", () => {
      if (settled) return;
      settled = true;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown);
      } catch {
        reject(new Error("BODY_INVALID"));
      }
    });
  });
}

function validatePort(port: number): number {
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error("LOCAL_BRIDGE_PORT_INVALID");
  }
  return port;
}

function normalizeAllowedOrigins(origins: readonly string[]): ReadonlySet<string> {
  const normalized = origins.map((origin) => validateServerOrigin(origin));
  if (normalized.length === 0 || new Set(normalized).size !== normalized.length) {
    throw new Error("LOCAL_BRIDGE_ORIGIN_CONFIG_INVALID");
  }
  return new Set(normalized);
}

function safeConnectorRunner(): LocalBridgeConnector {
  const dependencies = createDefaultConnectorDependencies();
  return (input) =>
    runLocalConnector(
      {
        serverOrigin: input.serverOrigin,
        pairingCode: input.pairingCode,
        onAuthorizeUrl: input.onAuthorizeUrl,
        onProgress: input.onProgress,
      },
      dependencies,
    );
}

export function createLocalBridgeServer(options: LocalBridgeOptions): LocalBridgeHandle {
  const allowedOrigins = normalizeAllowedOrigins(options.allowedServerOrigins);
  const configuredPort = validatePort(options.port ?? LOCAL_BRIDGE_PORT);
  const runConnector = options.runConnector ?? safeConnectorRunner();
  let currentStatus: LocalBridgeStatus = { state: "CONNECTOR_READY", errorCode: null };
  let active = false;
  let boundPort = configuredPort;

  const setStatus = (state: LocalBridgeState, errorCode: LocalBridgeErrorCode | null = null): void => {
    currentStatus = { state, errorCode };
  };

  const server = createServer((request, response) => {
    void (async () => {
      const requestUrl = request.url ?? "/";
      const origin = requestOrigin(request);
      const canonicalOrigin = origin && allowedOrigins.has(origin) ? origin : null;
      const parsedUrl = new URL(requestUrl, `http://${LOCAL_BRIDGE_HOST}`);

      if (!origin) {
        bridgeFailure(response, 403, "ORIGIN_REQUIRED", null);
        return;
      }
      if (!canonicalOrigin) {
        bridgeFailure(response, 403, "ORIGIN_NOT_ALLOWED", null);
        return;
      }
      if (hasQuery(requestUrl)) {
        bridgeFailure(response, 400, "QUERY_NOT_ALLOWED", canonicalOrigin);
        return;
      }

      if (parsedUrl.pathname === LOCAL_BRIDGE_HANDOFF_PATH) {
        if (request.method === "OPTIONS") {
          writeEmpty(
            response,
            204,
            canonicalOrigin,
            headerValue(request, "access-control-request-private-network") === "true",
          );
          return;
        }
        if (request.method !== "POST") {
          bridgeFailure(response, 405, "METHOD_NOT_ALLOWED", canonicalOrigin);
          return;
        }
        if (headerValue(request, "content-type") !== "application/json") {
          bridgeFailure(response, 415, "CONTENT_TYPE_INVALID", canonicalOrigin);
          return;
        }
        if (active) {
          bridgeFailure(response, 409, "BRIDGE_BUSY", canonicalOrigin);
          return;
        }

        let body: unknown;
        try {
          body = await readJsonBody(request);
        } catch (error) {
          bridgeFailure(
            response,
            error instanceof BodyTooLargeError ? 413 : 400,
            error instanceof BodyTooLargeError ? "BODY_TOO_LARGE" : "HANDOFF_INVALID",
            canonicalOrigin,
          );
          return;
        }
        const parsedBody = handoffSchema.safeParse(body);
        if (!parsedBody.success) {
          bridgeFailure(response, 400, "HANDOFF_INVALID", canonicalOrigin);
          return;
        }

        let serverOrigin: string;
        const pairingCode = normalizePairingCode(parsedBody.data.pairingCode);
        try {
          serverOrigin = validateServerOrigin(parsedBody.data.serverOrigin);
        } catch {
          bridgeFailure(response, 400, "HANDOFF_INVALID", canonicalOrigin);
          return;
        }
        if (!pairingCode || serverOrigin !== canonicalOrigin || !allowedOrigins.has(serverOrigin)) {
          bridgeFailure(response, 403, "ORIGIN_NOT_ALLOWED", canonicalOrigin);
          return;
        }

        active = true;
        setStatus("HANDOFF_ACCEPTED");
        writeJson(response, 202, { ok: true, state: "HANDOFF_ACCEPTED" }, canonicalOrigin);

        void runConnector({
          serverOrigin,
          pairingCode,
          onAuthorizeUrl: (authorizeUrl) => {
            setStatus("OAUTH_PENDING");
            options.openAuthorizeUrl?.(authorizeUrl);
          },
          onProgress: (state) => setStatus(state),
        })
          .then(() => setStatus("CONNECTED"))
          .catch(() => setStatus("FAILED", "CONNECTOR_FAILED"))
          .finally(() => {
            active = false;
          });
        return;
      }

      if (parsedUrl.pathname === LOCAL_BRIDGE_STATUS_PATH) {
        if (request.method === "OPTIONS") {
          writeEmpty(
            response,
            204,
            canonicalOrigin,
            headerValue(request, "access-control-request-private-network") === "true",
          );
          return;
        }
        if (request.method !== "GET") {
          bridgeFailure(response, 405, "METHOD_NOT_ALLOWED", canonicalOrigin);
          return;
        }
        writeJson(response, 200, { ok: true, ...currentStatus }, canonicalOrigin);
        return;
      }

      bridgeFailure(response, 404, "HANDOFF_INVALID", canonicalOrigin);
    })().catch(() => {
      if (!response.headersSent) {
        bridgeFailure(response, 500, "CONNECTOR_FAILED", null);
      }
    });
  });

  return {
    host: LOCAL_BRIDGE_HOST,
    server,
    get port() {
      return boundPort;
    },
    async start() {
      if (server.listening) return { host: LOCAL_BRIDGE_HOST, port: boundPort };
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => {
          server.off("listening", onListening);
          reject(error);
        };
        const onListening = () => {
          server.off("error", onError);
          const address = server.address();
          if (!address || typeof address === "string") {
            reject(new Error("LOCAL_BRIDGE_BIND_FAILED"));
            return;
          }
          boundPort = address.port;
          resolve();
        };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(configuredPort, LOCAL_BRIDGE_HOST);
      });
      return { host: LOCAL_BRIDGE_HOST, port: boundPort };
    },
    async stop() {
      if (!server.listening) return;
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
    status() {
      return currentStatus;
    },
  };
}
