import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/connected/installer/route";
import {
  createWindowsProtocolInstallPlan,
  TENAX_CONNECTOR_INSTALL_DIRECTORY,
  TENAX_CONNECTOR_SETUP_NAME,
  WINDOWS_TENAX_COMMAND_KEY,
  WINDOWS_TENAX_REGISTRY_ROOT,
} from "@/lib/connected/windows-install-contract";
import { inspectConnectorRuntime } from "@/lib/connected/connector";
import { parseSetupArgs, setupRuntimeArgs } from "@/lib/connected/windows-setup-args";

const INSTALLER_URL = "https://downloads.example.com/tenax/tenax-connector-setup.exe";
const INSTALL_EXE = "C:\\Users\\owner\\AppData\\Local\\Tenax\\Connector\\tenax-connector.exe";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Windows Connector install contract", () => {
  it("is per-user, outside the repository, secret-free, and deterministic for reinstall", () => {
    const first = createWindowsProtocolInstallPlan({
      executablePath: INSTALL_EXE,
      serverOrigin: "https://app.example.com",
    });
    const second = createWindowsProtocolInstallPlan({
      executablePath: INSTALL_EXE,
      serverOrigin: "https://app.example.com",
    });

    expect(first).toEqual(second);
    expect(first.registryRoot).toBe("HKCU\\Software\\Classes\\tenax");
    expect(first.commandKey).toBe(WINDOWS_TENAX_COMMAND_KEY);
    expect(first.registryRoot).toBe(WINDOWS_TENAX_REGISTRY_ROOT);
    expect(first.executablePath).toContain("AppData\\Local\\Tenax\\Connector");
    expect(first.executablePath).not.toContain("C:\\dev\\tenax");
    expect(first.command).toContain("--server-origin \"https://app.example.com\"");
    expect(first.command).toContain('--protocol-uri "%1"');
    expect(first.command).not.toMatch(/pair|token|secret|passphrase|api[-_]?key/i);
    const qa = createWindowsProtocolInstallPlan({
      executablePath: INSTALL_EXE,
      serverOrigin: "http://localhost:3000",
    });
    expect(qa.serverOrigin).toBe("http://localhost:3000");
    expect(qa.command).not.toContain("https://app.example.com");
    expect(TENAX_CONNECTOR_INSTALL_DIRECTORY).toBe("Tenax\\Connector");
    expect(TENAX_CONNECTOR_SETUP_NAME).toBe("tenax-connector-setup.exe");
  });

  it("rejects non-release origins and query-bearing installer configuration", async () => {
    expect(() => createWindowsProtocolInstallPlan({ executablePath: INSTALL_EXE, serverOrigin: "https://app.example.com/?pairingCode=secret" })).toThrow("SERVER_ORIGIN_INVALID");

    vi.stubEnv("TENAX_CONNECTOR_INSTALLER_URL", `${INSTALLER_URL}?token=should-not-be-used`);
    const invalid = await GET();
    expect(invalid.status).toBe(404);
    expect(await invalid.json()).toEqual({ ok: false, code: "INSTALLER_UNAVAILABLE" });
  });

  it("returns a genuine configured artifact only and stays honestly unavailable in development", async () => {
    vi.stubEnv("TENAX_CONNECTOR_INSTALLER_URL", "");
    const unavailable = await GET();
    expect(unavailable.status).toBe(404);
    expect(await unavailable.json()).toEqual({ ok: false, code: "INSTALLER_UNAVAILABLE" });

    vi.stubEnv("TENAX_CONNECTOR_INSTALLER_URL", INSTALLER_URL);
    const available = await GET();
    expect(available.status).toBe(200);
    expect(await available.json()).toEqual({ ok: true, available: true, url: INSTALLER_URL });
  });

  it("reports packaged runtime preflight without OAuth or provider access", () => {
    const runtime = inspectConnectorRuntime("http://localhost:3000");
    expect(runtime).toMatchObject({
      connectorVersion: "0.1.0",
      serverOrigin: "http://localhost:3000",
      bitgetSdkAvailable: true,
      readOnlyModeAvailable: true,
    });
    expect(runtime.localMetadataPath).toContain(".tenax");
    expect(() => inspectConnectorRuntime("https://app.example.com/?pairingCode=secret")).toThrow("SERVER_ORIGIN_INVALID");
  });

  it("treats the Node SEA duplicate-executable argv shape as zero user arguments", () => {
    const setupExecutable = "C:\\Users\\owner\\AppData\\Local\\Tenax\\Connector\\tenax-connector-setup.exe";
    const options = parseSetupArgs(setupRuntimeArgs([setupExecutable, setupExecutable]));

    expect(options).toEqual({
      uninstall: false,
      removeMetadata: false,
      removeBitgetCredentials: false,
      help: false,
    });
    expect(parseSetupArgs(setupRuntimeArgs([setupExecutable, setupExecutable, "--uninstall"]))).toMatchObject({ uninstall: true });
    expect(parseSetupArgs(setupRuntimeArgs([setupExecutable, setupExecutable, "--invalid"]))).toBeNull();
  });

  it("defines safe uninstall, no-duplicate launch, and no-provider-write behavior", () => {
    const setup = readFileSync(resolve(process.cwd(), "scripts", "tenax-connector-setup.ts"), "utf8");
    const bridge = readFileSync(resolve(process.cwd(), "scripts", "tenax-connector-bridge.ts"), "utf8");
    const build = readFileSync(resolve(process.cwd(), "scripts", "build-tenax-connector.ts"), "utf8");

    expect(setup).toContain("--uninstall");
    expect(setup).toContain("--remove-local-metadata");
    expect(setup).toContain("--remove-bitget-credentials");
    expect(setup).toContain("reg.exe");
    expect(setup).toContain("WINDOWS_TENAX_REGISTRY_ROOT");
    expect(setup).toContain("TENAX_CONNECTOR_EXECUTABLE_NAME");
    expect(setup).toContain("LOCALAPPDATA");
    expect(setup).toContain("AppData");
    expect(setup).not.toContain("place-order");
    expect(build).toContain("--server-origin");
    expect(build).toContain("NODE_SEA_BLOB");
    expect(build).toContain("__TENAX_SERVER_ORIGIN__");
    expect(build).not.toContain("OPENAI_API_KEY");
    expect(bridge).toContain("--preflight");
    expect(bridge).toContain("--preflight-handoff");
    expect(bridge).toContain("CONNECTOR_READY");
    expect(build).not.toContain("GROQ_API_KEY");
    expect(bridge).toContain("EADDRINUSE");
    expect(bridge).toContain("ALREADY_RUNNING");
    expect(bridge).not.toContain("pairingCode");
  });
});
