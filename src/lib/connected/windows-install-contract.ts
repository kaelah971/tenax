// Browser/installer-safe Windows install contract.
// This module intentionally has no Node, SDK, OAuth, or credential imports.

export const WINDOWS_TENAX_REGISTRY_ROOT = "HKCU\\Software\\Classes\\tenax" as const;
export const WINDOWS_TENAX_COMMAND_KEY = `${WINDOWS_TENAX_REGISTRY_ROOT}\\shell\\open\\command` as const;
export const TENAX_CONNECTOR_INSTALL_DIRECTORY = "Tenax\\Connector" as const;
export const TENAX_CONNECTOR_EXECUTABLE_NAME = "tenax-connector.exe" as const;
export const TENAX_CONNECTOR_SETUP_NAME = "tenax-connector-setup.exe" as const;

export interface WindowsProtocolInstallPlan {
  readonly registryRoot: typeof WINDOWS_TENAX_REGISTRY_ROOT;
  readonly commandKey: typeof WINDOWS_TENAX_COMMAND_KEY;
  readonly executablePath: string;
  readonly serverOrigin: string;
  readonly command: string;
}

export function normalizeInstallerServerOrigin(value: string): string {
  try {
    const url = new URL(value);
    const localHttpHost = new Set(["localhost", "127.0.0.1", "[::1]"]);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && localHttpHost.has(url.hostname))) {
      throw new Error("SERVER_ORIGIN_INVALID");
    }
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      throw new Error("SERVER_ORIGIN_INVALID");
    }
    return url.origin;
  } catch {
    throw new Error("SERVER_ORIGIN_INVALID");
  }
}

function quoteWindowsArgument(value: string): string {
  if (value.trim() === "" || /[\u0000\r\n]/u.test(value)) {
    throw new Error("WINDOWS_ARGUMENT_INVALID");
  }
  return `"${value.replaceAll('"', '\\"')}"`;
}

export function createWindowsProtocolInstallPlan(input: {
  readonly executablePath: string;
  readonly serverOrigin: string;
}): WindowsProtocolInstallPlan {
  const serverOrigin = normalizeInstallerServerOrigin(input.serverOrigin);
  const executablePath = input.executablePath.trim();
  const command = `${quoteWindowsArgument(executablePath)} --server-origin ${quoteWindowsArgument(serverOrigin)} --protocol-uri "%1"`;
  return {
    registryRoot: WINDOWS_TENAX_REGISTRY_ROOT,
    commandKey: WINDOWS_TENAX_COMMAND_KEY,
    executablePath,
    serverOrigin,
    command,
  };
}
