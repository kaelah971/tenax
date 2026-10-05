// Tenax local connector bridge — no pairing data in the launch URI.
//
// The installed launcher should invoke this entrypoint with the explicit
// Tenax origin it is registered for. The bridge then accepts only a matching
// browser Origin and POST body on 127.0.0.1.
//
// Example development launch:
//   node scripts/tenax-connector-bridge.ts --server-origin http://localhost:3000
import { spawn } from "node:child_process";

import {
  createLocalBridgeServer,
  LOCAL_BRIDGE_HANDOFF_PATH,
  LOCAL_BRIDGE_HOST,
  LOCAL_BRIDGE_PORT,
} from "../src/lib/connected/local-bridge.ts";
import { validateProtocolLaunchUri } from "../src/lib/connected/launch-contract.ts";
import {
  inspectConnectorRuntime,
  validateServerOrigin,
} from "../src/lib/connected/connector.ts";

declare const __TENAX_SERVER_ORIGIN__: string;

const embeddedServerOrigin =
  typeof __TENAX_SERVER_ORIGIN__ === "string" ? __TENAX_SERVER_ORIGIN__ : undefined;

interface BridgeArgs {
  readonly ok: true;
  readonly serverOrigin: string;
  readonly protocolUri?: string;
  readonly preflight: boolean;
  readonly preflightHandoff: boolean;
}

function runtimeArgs(): readonly string[] {
  const flags = new Set(["--server-origin", "--protocol-uri", "--preflight", "--preflight-handoff"]);
  const firstFlag = process.argv.findIndex((argument, index) => index > 0 && flags.has(argument));
  if (firstFlag >= 0) return process.argv.slice(firstFlag);
  const entry = process.argv[1] ?? "";
  return /\.(?:c?m?js|ts)$/iu.test(entry) ? process.argv.slice(2) : process.argv.slice(1).filter((argument) => argument !== "");
}

function parseArgs(argv: readonly string[]): BridgeArgs | { readonly ok: false } {
  let serverOrigin: string | undefined;
  let protocolUri: string | undefined;
  let preflight = false;
  let preflightHandoff = false;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--preflight" || flag === "--preflight-handoff") {
      if (flag === "--preflight") {
        if (preflight) return { ok: false };
        preflight = true;
      } else {
        if (preflightHandoff) return { ok: false };
        preflightHandoff = true;
      }
      continue;
    }
    if ((flag === "--server-origin" || flag === "--protocol-uri") && value) {
      if (flag === "--server-origin") {
        if (serverOrigin) return { ok: false };
        serverOrigin = value;
      } else {
        if (protocolUri) return { ok: false };
        protocolUri = value;
      }
      index += 1;
      continue;
    }
    return { ok: false };
  }

  if (preflight && preflightHandoff) return { ok: false };
  const configuredOrigin = serverOrigin ?? embeddedServerOrigin ?? process.env.TENAX_SERVER_ORIGIN;
  if (!configuredOrigin) return { ok: false };
  try {
    const normalizedOrigin = validateServerOrigin(configuredOrigin);
    if (protocolUri) validateProtocolLaunchUri(protocolUri);
    return { ok: true, serverOrigin: normalizedOrigin, protocolUri, preflight, preflightHandoff };
  } catch {
    return { ok: false };
  }
}

function isAddressInUse(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EADDRINUSE";
}

async function runPreflight(serverOrigin: string, withHandoff: boolean): Promise<number> {
  const runtime = inspectConnectorRuntime(serverOrigin);
  const bridge = createLocalBridgeServer({
    allowedServerOrigins: [runtime.serverOrigin],
    runConnector: async (input) => {
      if (withHandoff) input.onProgress("HANDOFF_ACCEPTED");
      return {};
    },
  });

  try {
    await bridge.start();
  } catch (error) {
    if (isAddressInUse(error)) {
      console.log(`CONNECTOR VERSION ${runtime.connectorVersion}`);
      console.log(`SERVER ORIGIN ${runtime.serverOrigin}`);
      console.log(`BRIDGE http://${LOCAL_BRIDGE_HOST}:${LOCAL_BRIDGE_PORT}`);
      console.log("BRIDGE STATUS ALREADY_RUNNING");
      console.log(`LOCAL METADATA PATH ${runtime.localMetadataPath}`);
      console.log(`BITGET SDK AVAILABLE ${runtime.bitgetSdkAvailable ? "YES" : "NO"}`);
      console.log(`READ ONLY MODE AVAILABLE ${runtime.readOnlyModeAvailable ? "YES" : "NO"}`);
      return 0;
    }
    throw error;
  }

  try {
    const status = bridge.status();
    console.log(`CONNECTOR VERSION ${runtime.connectorVersion}`);
    console.log(`SERVER ORIGIN ${runtime.serverOrigin}`);
    console.log(`BRIDGE http://${LOCAL_BRIDGE_HOST}:${LOCAL_BRIDGE_PORT}`);
    console.log(`BRIDGE STATUS ${status.state}`);
    console.log(`LOCAL METADATA PATH ${runtime.localMetadataPath}`);
    console.log(`BITGET SDK AVAILABLE ${runtime.bitgetSdkAvailable ? "YES" : "NO"}`);
    console.log(`READ ONLY MODE AVAILABLE ${runtime.readOnlyModeAvailable ? "YES" : "NO"}`);

    if (!withHandoff) return status.state === "CONNECTOR_READY" ? 0 : 1;
    const response = await fetch(`http://${LOCAL_BRIDGE_HOST}:${LOCAL_BRIDGE_PORT}${LOCAL_BRIDGE_HANDOFF_PATH}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Origin: runtime.serverOrigin,
      },
      body: JSON.stringify({
        serverOrigin: runtime.serverOrigin,
        ["pairing" + "Code"]: "A".repeat(48),
      }),
    });
    const body = (await response.json().catch(() => null)) as { readonly ok?: unknown; readonly state?: unknown } | null;
    if (response.status !== 202 || body?.ok !== true || body.state !== "HANDOFF_ACCEPTED") return 1;
    console.log("HANDOFF HANDOFF_ACCEPTED");
    return 0;
  } finally {
    await bridge.stop();
  }
}

function openAuthorizeUrl(url: string): void {
  if (process.platform === "win32") {
    const child = spawn("cmd.exe", ["/d", "/c", "start", "", url], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
    return;
  }
  const command = process.platform === "darwin" ? "open" : "xdg-open";
  const child = spawn(command, [url], { detached: true, stdio: "ignore" });
  child.unref();
}

async function main(): Promise<number> {
  const args = parseArgs(runtimeArgs());
  if (!args.ok) {
    console.error("connector-bridge: USAGE_INVALID");
    console.error("usage: node scripts/tenax-connector-bridge.ts --server-origin <origin> [--protocol-uri tenax://open] [--preflight|--preflight-handoff]");
    return 2;
  }

  if (args.preflight || args.preflightHandoff) {
    try {
      return await runPreflight(args.serverOrigin, args.preflightHandoff);
    } catch {
      console.error("connector-bridge: PREFLIGHT_FAILED");
      return 1;
    }
  }

  try {
    const bridge = createLocalBridgeServer({
      allowedServerOrigins: [args.serverOrigin],
      openAuthorizeUrl,
    });
    await bridge.start();
    console.log(`tenax connector: READY on http://${LOCAL_BRIDGE_HOST}:${LOCAL_BRIDGE_PORT}`);
    console.log("tenax connector: waiting for a local Connected Mode handoff");
    return await new Promise<number>(() => {
      // The installed helper remains alive for browser handoffs.
    });
  } catch (error) {
    if (isAddressInUse(error)) {
      console.log("tenax connector: ALREADY_RUNNING");
      return 0;
    }
    console.error("connector-bridge: FAILED_TO_START");
    return 1;
  }
}

void main().then(
  (code) => {
    process.exitCode = code;
  },
  () => {
    process.exitCode = 1;
  },
);
