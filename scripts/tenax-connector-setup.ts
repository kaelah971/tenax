// Tenax Connector Windows per-user setup/uninstall entrypoint.
// The release build embeds only the connector executable and public server
// origin. No pairing code, provider credential, or environment file is bundled.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";

import {
  createWindowsProtocolInstallPlan,
  TENAX_CONNECTOR_EXECUTABLE_NAME,
  WINDOWS_TENAX_REGISTRY_ROOT,
} from "../src/lib/connected/windows-install-contract.ts";
import { parseSetupArgs, setupRuntimeArgs, type SetupOptions } from "../src/lib/connected/windows-setup-args.ts";

declare const __TENAX_SERVER_ORIGIN__: string;

const embeddedServerOrigin =
  typeof __TENAX_SERVER_ORIGIN__ === "string" ? __TENAX_SERVER_ORIGIN__ : process.env.TENAX_SERVER_ORIGIN;

type SeaApi = {
  readonly getAsset: (name: string) => ArrayBuffer | Uint8Array;
};


function installDirectory(): string {
  const localAppData = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
  return join(localAppData, "Tenax", "Connector");
}

function metadataPath(): string {
  return join(homedir(), ".tenax", "connected-sync.json");
}

function bitgetCredentialPath(): string {
  return join(homedir(), ".bitget", "oauth_token.json");
}

function registry(args: readonly string[]): void {
  execFileSync("reg.exe", [...args], { stdio: "ignore", windowsHide: true });
}

function removeRegistry(): void {
  try {
    registry(["DELETE", WINDOWS_TENAX_REGISTRY_ROOT, "/f"]);
  } catch {
    // An absent per-user key is already the desired uninstall state.
  }
}

function connectorAsset(): Buffer {
  const sea = createRequire(process.execPath)("node:sea") as SeaApi;
  const asset = sea.getAsset(`${TENAX_CONNECTOR_EXECUTABLE_NAME}.gz`);
  const compressed = Buffer.isBuffer(asset)
    ? asset
    : asset instanceof ArrayBuffer
      ? Buffer.from(new Uint8Array(asset))
      : Buffer.from(asset);
  return gunzipSync(compressed);
}

async function install(): Promise<void> {
  if (process.platform !== "win32") throw new Error("WINDOWS_ONLY");
  if (!embeddedServerOrigin) throw new Error("SERVER_ORIGIN_REQUIRED");
  const directory = installDirectory();
  const executablePath = join(directory, TENAX_CONNECTOR_EXECUTABLE_NAME);
  const plan = createWindowsProtocolInstallPlan({
    executablePath,
    serverOrigin: embeddedServerOrigin,
  });

  await mkdir(directory, { recursive: true });
  await writeFile(executablePath, connectorAsset());
  registry(["ADD", plan.registryRoot, "/ve", "/d", "URL:Tenax Connector", "/f"]);
  registry(["ADD", plan.registryRoot, "/v", "URL Protocol", "/d", "", "/f"]);
  registry(["ADD", plan.commandKey, "/ve", "/d", plan.command, "/f"]);
  console.log("Tenax Connector installed for the current Windows user.");
}

async function uninstall(options: SetupOptions): Promise<void> {
  if (process.platform !== "win32") throw new Error("WINDOWS_ONLY");
  removeRegistry();
  await rm(installDirectory(), { recursive: true, force: true });
  if (options.removeMetadata) await rm(metadataPath(), { force: true });
  if (options.removeBitgetCredentials) await rm(bitgetCredentialPath(), { force: true });
  console.log("Tenax Connector uninstalled for the current Windows user.");
}

function printUsage(): void {
  console.log("Tenax Connector setup");
  console.log("  install:   run without arguments");
  console.log("  uninstall: --uninstall [--remove-local-metadata] [--remove-bitget-credentials]");
}

async function main(): Promise<number> {
  const options = parseSetupArgs(setupRuntimeArgs(process.argv));
  if (!options || options.help) {
    printUsage();
    return options?.help ? 0 : 2;
  }
  try {
    if (options.uninstall) await uninstall(options);
    else await install();
    return 0;
  } catch {
    console.error("Tenax Connector setup failed.");
    return 1;
  }
}

void main().then(
  (exitCode) => {
    process.exitCode = exitCode;
  },
  () => {
    process.exitCode = 1;
  },
);
