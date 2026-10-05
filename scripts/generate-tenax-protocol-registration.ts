// Generate a Windows per-user custom-protocol fixture without touching the OS.
// The printed .reg content is an install artifact; this script never imports it.
import { createWindowsProtocolRegistration } from "../src/lib/connected/launch-contract.ts";

type RegistrationArgs = {
  readonly executablePath: string;
  readonly serverOrigin: string;
};

function parseArgs(argv: readonly string[]): RegistrationArgs | null {
  let executablePath: string | undefined;
  let serverOrigin: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if ((flag === "--executable" || flag === "--server-origin") && value) {
      if (flag === "--executable") {
        if (executablePath) return null;
        executablePath = value;
      } else {
        if (serverOrigin) return null;
        serverOrigin = value;
      }
      index += 1;
      continue;
    }
    return null;
  }
  return executablePath && serverOrigin ? { executablePath, serverOrigin } : null;
}

const args = parseArgs(process.argv.slice(2));
if (!args) {
  console.error("usage: node scripts/generate-tenax-protocol-registration.ts --executable <path> --server-origin <origin>");
  process.exitCode = 2;
} else {
  try {
    const registration = createWindowsProtocolRegistration(args);
    process.stdout.write(registration.registryFile);
    process.exitCode = 0;
  } catch {
    console.error("registration: INVALID_CONFIGURATION");
    process.exitCode = 1;
  }
}
