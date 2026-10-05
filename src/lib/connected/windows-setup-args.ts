// Pure setup executable argument handling. Node SEA may expose the packaged
// executable as both argv[0] and argv[1] when launched without user args.

export type SetupOptions = {
  readonly uninstall: boolean;
  readonly removeMetadata: boolean;
  readonly removeBitgetCredentials: boolean;
  readonly help: boolean;
};

const SETUP_FLAGS = new Set([
  "--uninstall",
  "--remove-local-metadata",
  "--remove-bitget-credentials",
  "--help",
]);

export function setupRuntimeArgs(argv: readonly string[]): readonly string[] {
  const firstFlag = argv.findIndex((argument, index) => index > 0 && SETUP_FLAGS.has(argument));
  if (firstFlag >= 0) return argv.slice(firstFlag);

  const entry = argv[1] ?? "";
  if (/\.(?:c?m?js|ts)$/iu.test(entry) || /\.exe$/iu.test(entry)) return argv.slice(2);
  return argv.slice(1).filter((argument) => argument !== "");
}

export function parseSetupArgs(argv: readonly string[]): SetupOptions | null {
  let uninstall = false;
  let removeMetadata = false;
  let removeBitgetCredentials = false;
  let help = false;
  for (const argument of argv) {
    if (argument === "--uninstall") uninstall = true;
    else if (argument === "--remove-local-metadata") removeMetadata = true;
    else if (argument === "--remove-bitget-credentials") removeBitgetCredentials = true;
    else if (argument === "--help") help = true;
    else return null;
  }
  if ((removeMetadata || removeBitgetCredentials) && !uninstall) return null;
  return { uninstall, removeMetadata, removeBitgetCredentials, help };
}
