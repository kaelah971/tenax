import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import * as fsPromises from "node:fs/promises";
import { tmpdir } from "node:os";
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

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, lstat: vi.fn(actual.lstat), readFile: vi.fn(actual.readFile) };
});

const INSTALLER_URL = "https://downloads.example.com/tenax/tenax-connector-setup.exe";
const INSTALL_EXE = "C:\\Users\\owner\\AppData\\Local\\Tenax\\Connector\\tenax-connector.exe";

async function withTemporaryWorkingDirectory(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(resolve(tmpdir(), "tenax-installer-"));
  const cwd = vi.spyOn(process, "cwd").mockReturnValue(root);
  try {
    await run(root);
  } finally {
    cwd.mockRestore();
    await rm(root, { recursive: true, force: true });
  }
}

async function writeExpectedInstaller(root: string, content: Buffer): Promise<void> {
  const directory = resolve(root, "release", "tenax-connector");
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, "tenax-connector-setup.exe"), content);
}

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

  it("serves only the fixed local setup artifact in development", async () => {
    await withTemporaryWorkingDirectory(async (root) => {
      vi.stubEnv("NODE_ENV", "development");
      const content = Buffer.from([0x4d, 0x5a, 0x54, 0x45, 0x4e, 0x41, 0x58]);

      const unavailable = await GET(new Request("http://localhost:3000/api/connected/installer"));
      expect(unavailable.status).toBe(404);
      expect(await unavailable.json()).toEqual({ ok: false, code: "INSTALLER_UNAVAILABLE" });

      await writeExpectedInstaller(root, content);
      const metadata = await GET(new Request("http://localhost:3000/api/connected/installer", { headers: { Accept: "application/json" } }));
      expect(metadata.status).toBe(200);
      expect(await metadata.json()).toEqual({ ok: true, available: true, url: "/api/connected/installer" });

      const download = await GET(new Request("http://localhost:3000/api/connected/installer"));
      expect(download.status).toBe(200);
      expect(download.headers.get("content-disposition")).toBe('attachment; filename="TenaxConnectorSetup.exe"');
      expect(download.headers.get("content-type")).toBe("application/octet-stream");
      expect(download.headers.get("content-length")).toBe(String(content.byteLength));
      expect(download.headers.get("x-content-type-options")).toBe("nosniff");
      expect(new Uint8Array(await download.arrayBuffer())).toEqual(new Uint8Array(content));

      const arbitraryPath = await GET(new Request("http://localhost:3000/api/connected/installer?path=../../.env"));
      expect(new Uint8Array(await arbitraryPath.arrayBuffer())).toEqual(new Uint8Array(content));
    });
  });

  it("returns the configured production URL without reading the local release artifact", async () => {
    await withTemporaryWorkingDirectory(async (root) => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("TENAX_CONNECTOR_INSTALLER_URL", INSTALLER_URL);
      await writeExpectedInstaller(root, Buffer.from("local-only-artifact"));
      vi.mocked(fsPromises.lstat).mockClear();
      vi.mocked(fsPromises.readFile).mockClear();

      const available = await GET();
      expect(available.status).toBe(200);
      expect(await available.json()).toEqual({ ok: true, available: true, url: INSTALLER_URL });
      expect(fsPromises.lstat).not.toHaveBeenCalled();
      expect(fsPromises.readFile).not.toHaveBeenCalled();
    });
  });

  it("reports missing production configuration honestly", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TENAX_CONNECTOR_INSTALLER_URL", "");
    const unavailable = await GET();
    expect(unavailable.status).toBe(404);
    expect(await unavailable.json()).toEqual({ ok: false, code: "INSTALLER_UNAVAILABLE" });
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
