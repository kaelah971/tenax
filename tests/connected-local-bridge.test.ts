import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  CONNECTOR_READ_OPERATION_IDS,
  type ConnectorResult,
} from "@/lib/connected/connector";
import {
  createWindowsProtocolRegistration,
  TENAX_PROTOCOL_URI,
  validateProtocolLaunchUri,
} from "@/lib/connected/launch-contract";
import {
  createLocalBridgeServer,
  LOCAL_BRIDGE_HANDOFF_PATH,
  LOCAL_BRIDGE_HOST,
  LOCAL_BRIDGE_STATUS_PATH,
  type LocalBridgeConnector,
  type LocalBridgeHandle,
} from "@/lib/connected/local-bridge";

const SERVER_ORIGIN = "http://localhost:3000";
const PAIRING_CODE = "A".repeat(48);
const bridges: LocalBridgeHandle[] = [];

function connectorResult(): ConnectorResult | undefined {
  return undefined;
}

async function createBridge(runConnector: LocalBridgeConnector = async () => connectorResult()): Promise<LocalBridgeHandle> {
  const bridge = createLocalBridgeServer({
    allowedServerOrigins: [SERVER_ORIGIN],
    port: 0,
    runConnector,
  });
  await bridge.start();
  bridges.push(bridge);
  return bridge;
}

function bridgeUrl(bridge: LocalBridgeHandle, path: string): string {
  return `http://${LOCAL_BRIDGE_HOST}:${bridge.port}${path}`;
}

async function postHandoff(bridge: LocalBridgeHandle, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(bridgeUrl(bridge, LOCAL_BRIDGE_HANDOFF_PATH), {
    method: "POST",
    headers: {
      Origin: SERVER_ORIGIN,
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

async function waitFor(check: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("test state did not settle");
}

afterEach(async () => {
  await Promise.all(bridges.splice(0).map((bridge) => bridge.stop()));
});

describe("Connected Mode local bridge", () => {
  it("binds to loopback only and uses the documented production port", async () => {
    expect(LOCAL_BRIDGE_HOST).toBe("127.0.0.1");
    const bridge = createLocalBridgeServer({
      allowedServerOrigins: [SERVER_ORIGIN],
      runConnector: async () => connectorResult(),
    });
    expect(bridge.port).toBe(43127);
    await bridge.start();
    bridges.push(bridge);
    const address = bridge.server.address();
    expect(address).not.toBeNull();
    expect(typeof address).toBe("object");
    expect((address as { address: string }).address).toBe("127.0.0.1");
  });

  it("accepts only POST handoffs and rejects query-based pairing secrets", async () => {
    const bridge = await createBridge();
    const getResponse = await fetch(bridgeUrl(bridge, LOCAL_BRIDGE_HANDOFF_PATH), {
      headers: { Origin: SERVER_ORIGIN },
    });
    expect(getResponse.status).toBe(405);
    expect(await getResponse.json()).toEqual({ ok: false, code: "METHOD_NOT_ALLOWED" });

    const queryResponse = await fetch(
      `${bridgeUrl(bridge, LOCAL_BRIDGE_HANDOFF_PATH)}?pairingCode=${encodeURIComponent(PAIRING_CODE)}`,
      { method: "POST", headers: { Origin: SERVER_ORIGIN, "Content-Type": "application/json" }, body: "{}" },
    );
    expect(queryResponse.status).toBe(400);
    expect(await queryResponse.json()).toEqual({ ok: false, code: "QUERY_NOT_ALLOWED" });

    const preflight = await fetch(bridgeUrl(bridge, LOCAL_BRIDGE_HANDOFF_PATH), {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:3000",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
        "Access-Control-Request-Private-Network": "true",
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3000");
    expect(preflight.headers.get("Access-Control-Allow-Private-Network")).toBe("true");
  });

  it("rejects malformed, non-JSON, and extra-field payloads without invoking the connector", async () => {
    let calls = 0;
    const bridge = await createBridge(async () => {
      calls += 1;
      return connectorResult();
    });

    const malformed = await fetch(bridgeUrl(bridge, LOCAL_BRIDGE_HANDOFF_PATH), {
      method: "POST",
      headers: { Origin: SERVER_ORIGIN, "Content-Type": "application/json" },
      body: "not-json",
    });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ ok: false, code: "HANDOFF_INVALID" });

    const wrongContentType = await postHandoff(bridge, { serverOrigin: SERVER_ORIGIN, pairingCode: PAIRING_CODE }, { "Content-Type": "text/plain" });
    expect(wrongContentType.status).toBe(415);
    expect(await wrongContentType.json()).toEqual({ ok: false, code: "CONTENT_TYPE_INVALID" });

    const extraField = await postHandoff(bridge, { serverOrigin: SERVER_ORIGIN, pairingCode: PAIRING_CODE, secret: "no" });
    expect(extraField.status).toBe(400);
    expect(await extraField.json()).toEqual({ ok: false, code: "HANDOFF_INVALID" });
    expect(calls).toBe(0);
  });

  it("requires an explicitly allowed exact Origin and valid Tenax origin", async () => {
    let calls = 0;
    const bridge = await createBridge(async () => {
      calls += 1;
      return connectorResult();
    });

    const arbitraryOrigin = await fetch(bridgeUrl(bridge, LOCAL_BRIDGE_HANDOFF_PATH), {
      method: "POST",
      headers: { Origin: "https://malicious.example", "Content-Type": "application/json" },
      body: JSON.stringify({ serverOrigin: SERVER_ORIGIN, pairingCode: PAIRING_CODE }),
    });
    expect(arbitraryOrigin.status).toBe(403);
    expect(await arbitraryOrigin.json()).toEqual({ ok: false, code: "ORIGIN_NOT_ALLOWED" });

    const arbitraryBodyOrigin = await postHandoff(bridge, {
      serverOrigin: "https://another.example",
      pairingCode: PAIRING_CODE,
    });
    expect(arbitraryBodyOrigin.status).toBe(403);
    expect(await arbitraryBodyOrigin.json()).toEqual({ ok: false, code: "ORIGIN_NOT_ALLOWED" });
    expect(calls).toBe(0);
  });

  it("hands the pairing code to the existing connector exactly once and exposes no secret", async () => {
    let release!: () => void;
    const running = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls: Array<{ serverOrigin: string; pairingCode: string }> = [];
    const bridge = await createBridge(async (input) => {
      calls.push({ serverOrigin: input.serverOrigin, pairingCode: input.pairingCode });
      await running;
      return connectorResult();
    });

    const response = await postHandoff(bridge, { serverOrigin: SERVER_ORIGIN, pairingCode: PAIRING_CODE });
    const responseText = await response.text();
    expect(response.status).toBe(202);
    expect(responseText).toContain("HANDOFF_ACCEPTED");
    expect(responseText).not.toContain(PAIRING_CODE);
    expect(responseText).not.toMatch(/apiKey|secretKey|passphrase|credentials/i);
    expect(calls).toEqual([{ serverOrigin: SERVER_ORIGIN, pairingCode: PAIRING_CODE }]);

    const duplicate = await postHandoff(bridge, { serverOrigin: SERVER_ORIGIN, pairingCode: "second-secret" });
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toEqual({ ok: false, code: "BRIDGE_BUSY" });
    expect(calls).toHaveLength(1);

    release();
    await waitFor(() => bridge.status().state === "CONNECTED");
  });

  it("reports safe progress states and opens only the injected validated OAuth URL", async () => {
    const opened: string[] = [];
    const bridge = createLocalBridgeServer({
      allowedServerOrigins: [SERVER_ORIGIN],
      port: 0,
      openAuthorizeUrl: (url) => opened.push(url),
      runConnector: async (input) => {
        input.onProgress("OAUTH_PENDING");
        input.onAuthorizeUrl("https://bitget.com/oauth/authorize");
        input.onProgress("SYNCING");
        return connectorResult();
      },
    });
    await bridge.start();
    bridges.push(bridge);

    const response = await postHandoff(bridge, { serverOrigin: SERVER_ORIGIN, pairingCode: PAIRING_CODE });
    expect(response.status).toBe(202);
    await waitFor(() => bridge.status().state === "CONNECTED");
    expect(opened).toEqual(["https://bitget.com/oauth/authorize"]);

    const status = await fetch(bridgeUrl(bridge, LOCAL_BRIDGE_STATUS_PATH), {
      headers: { Origin: SERVER_ORIGIN },
    });
    expect(await status.json()).toEqual({ ok: true, state: "CONNECTED", errorCode: null });
  });

  it("keeps the custom protocol secret-free and generates a non-mutating HKCU registration fixture", () => {
    expect(validateProtocolLaunchUri(TENAX_PROTOCOL_URI)).toBe(TENAX_PROTOCOL_URI);
    expect(() => validateProtocolLaunchUri("tenax://open?pairingCode=secret")).toThrow("PROTOCOL_URI_INVALID");

    const registration = createWindowsProtocolRegistration({
      executablePath: "C:\\Program Files\\Tenax\\tenax-connector-bridge.exe",
      serverOrigin: SERVER_ORIGIN,
    });
    expect(registration.launchUri).toBe("tenax://open");
    expect(registration.registryRoot).toBe("HKCU\\Software\\Classes\\tenax");
    expect(registration.command).toContain("--protocol-uri \"%1\"");
    expect(registration.registryFile).toContain("HKEY_CURRENT_USER");
    expect(registration.registryFile).not.toContain("pairingCode");
    expect(registration.registryFile).not.toContain("secret");

    const generator = readFileSync(resolve(process.cwd(), "scripts", "generate-tenax-protocol-registration.ts"), "utf8");
    expect(generator).not.toContain("child_process");
    expect(generator).not.toContain("reg.exe");
    expect(generator).not.toContain("New-Item");
  });

  it("keeps the existing connector CLI and read-only operation boundary intact", () => {
    const cli = readFileSync(resolve(process.cwd(), "scripts", "bitget-agentic-connector.ts"), "utf8");
    const bridge = readFileSync(resolve(process.cwd(), "scripts", "tenax-connector-bridge.ts"), "utf8");
    const localBridge = readFileSync(resolve(process.cwd(), "src", "lib", "connected", "local-bridge.ts"), "utf8");
    expect(cli).toContain("runLocalConnector");
    expect(cli).toContain("retryLocalConnector");
    expect(bridge).toContain("createLocalBridgeServer");
    expect(bridge).not.toContain("pairingCode");
    expect(localBridge).toContain("runLocalConnector");
    expect(localBridge).not.toContain("console.log");
    expect(CONNECTOR_READ_OPERATION_IDS).toEqual(["getAccountInfo", "getAccountAssets", "getPositionInfo"]);
  });
});
