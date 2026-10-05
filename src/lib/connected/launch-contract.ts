// Tenax Connected Mode — secret-free local connector launch contract.
//
// The custom protocol carries only the launch action. Pairing data is handed
// to the loopback bridge later in an HTTPS/localhost POST body.
import { ConnectorError, validateServerOrigin } from "./connector.ts";
import { TENAX_PROTOCOL_SCHEME, TENAX_PROTOCOL_URI } from "./protocol-contract.ts";

export { TENAX_PROTOCOL_SCHEME, TENAX_PROTOCOL_URI } from "./protocol-contract.ts";
export const TENAX_PROTOCOL_ARGUMENT = "--protocol-uri" as const;

export class LaunchContractError extends Error {
  readonly code: "PROTOCOL_URI_INVALID" | "EXECUTABLE_PATH_INVALID" | "SERVER_ORIGIN_INVALID";

  constructor(code: LaunchContractError["code"]) {
    super(code);
    this.name = "LaunchContractError";
    this.code = code;
  }
}

export function validateProtocolLaunchUri(value: string): typeof TENAX_PROTOCOL_URI {
  try {
    const url = new URL(value);
    if (
      value !== TENAX_PROTOCOL_URI ||
      url.protocol !== `${TENAX_PROTOCOL_SCHEME}:` ||
      url.hostname !== "open" ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname !== "" ||
      url.search ||
      url.hash
    ) {
      throw new LaunchContractError("PROTOCOL_URI_INVALID");
    }
    return TENAX_PROTOCOL_URI;
  } catch (error) {
    if (error instanceof LaunchContractError) throw error;
    throw new LaunchContractError("PROTOCOL_URI_INVALID");
  }
}

function quoteWindowsArgument(value: string): string {
  return `"${value.replaceAll('"', '\\"')}"`;
}

function registryString(value: string): string {
  return value.replaceAll('"', '\\"');
}

export interface WindowsProtocolRegistration {
  readonly scheme: typeof TENAX_PROTOCOL_SCHEME;
  readonly launchUri: typeof TENAX_PROTOCOL_URI;
  readonly registryRoot: "HKCU\\Software\\Classes\\tenax";
  readonly command: string;
  readonly registryFile: string;
}

export function createWindowsProtocolRegistration(input: {
  readonly executablePath: string;
  readonly serverOrigin: string;
}): WindowsProtocolRegistration {
  if (
    input.executablePath.trim() === "" ||
    /[\u0000\r\n]/u.test(input.executablePath)
  ) {
    throw new LaunchContractError("EXECUTABLE_PATH_INVALID");
  }

  let serverOrigin: string;
  try {
    serverOrigin = validateServerOrigin(input.serverOrigin);
  } catch (error) {
    if (error instanceof ConnectorError && error.code === "SERVER_ORIGIN_INVALID") {
      throw new LaunchContractError("SERVER_ORIGIN_INVALID");
    }
    throw error;
  }

  const command = `${quoteWindowsArgument(input.executablePath)} --server-origin ${quoteWindowsArgument(serverOrigin)} ${TENAX_PROTOCOL_ARGUMENT} "%1"`;
  const registryRoot = "HKCU\\Software\\Classes\\tenax" as const;
  const registryFile = [
    "Windows Registry Editor Version 5.00",
    "",
    `[HKEY_CURRENT_USER\\Software\\Classes\\${TENAX_PROTOCOL_SCHEME}]`,
    '@="URL:Tenax Connector"',
    '"URL Protocol"=""',
    "",
    `[HKEY_CURRENT_USER\\Software\\Classes\\${TENAX_PROTOCOL_SCHEME}\\shell\\open\\command]`,
    `@="${registryString(command)}"`,
    "",
  ].join("\r\n");

  return {
    scheme: TENAX_PROTOCOL_SCHEME,
    launchUri: TENAX_PROTOCOL_URI,
    registryRoot,
    command,
    registryFile,
  };
}
