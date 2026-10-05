// Build the Windows Connected Mode connector and per-user setup executable.
// Release artifacts are generated under release/ and are intentionally ignored.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";

import { build } from "esbuild";

import { normalizeInstallerServerOrigin } from "../src/lib/connected/windows-install-contract.ts";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = resolve(rootDirectory, "release", "tenax-connector");
const connectorBundle = join(outputDirectory, "tenax-connector.bundle.cjs");
const connectorBlob = join(outputDirectory, "tenax-connector.blob");
const connectorExecutable = join(outputDirectory, "tenax-connector.exe");
const connectorPayload = join(outputDirectory, "tenax-connector.exe.gz");
const setupBundle = join(outputDirectory, "tenax-connector-setup.bundle.cjs");
const setupBlob = join(outputDirectory, "tenax-connector-setup.blob");
const setupExecutable = join(outputDirectory, "tenax-connector-setup.exe");
const connectorSeaConfig = join(outputDirectory, "connector-sea-config.json");
const setupSeaConfig = join(outputDirectory, "setup-sea-config.json");
const seaFuse = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";

function runtimeArgs(): readonly string[] {
  const entry = process.argv[1] ?? "";
  return /\.(?:c?m?js|ts)$/iu.test(entry) ? process.argv.slice(2) : process.argv.slice(1);
}

function parseServerOrigin(argv: readonly string[]): string | null {
  let value: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--server-origin" || !argv[index + 1] || value) return null;
    value = argv[index + 1];
    index += 1;
  }
  if (!value) return null;
  try {
    return normalizeInstallerServerOrigin(value);
  } catch {
    return null;
  }
}

function runNode(args: readonly string[]): void {
  const result = spawnSync(process.execPath, [...args], {
    cwd: rootDirectory,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error || result.status !== 0) throw new Error("NODE_BUILD_STEP_FAILED");
}

function postjectPath(): string {
  const require = createRequire(import.meta.url);
  return join(dirname(require.resolve("postject")), "cli.js");
}

function inject(executable: string, blob: string): void {
  const result = spawnSync(
    process.execPath,
    [postjectPath(), executable, "NODE_SEA_BLOB", blob, "--sentinel-fuse", seaFuse],
    { cwd: rootDirectory, stdio: "inherit", windowsHide: true },
  );
  if (result.error || result.status !== 0) throw new Error("SEA_INJECTION_FAILED");
}

async function createSeaBlob(input: {
  readonly main: string;
  readonly output: string;
  readonly configPath: string;
  readonly assets?: Record<string, string>;
}): Promise<void> {
  await writeFile(
    input.configPath,
    JSON.stringify(
      {
        main: input.main,
        output: input.output,
        disableExperimentalSEAWarning: true,
        useCodeCache: true,
        useSnapshot: false,
        ...(input.assets ? { assets: input.assets } : {}),
      },
      null,
      2,
    ),
  );
  runNode(["--experimental-sea-config", input.configPath]);
}

async function buildBundle(entryPoint: string, outfile: string, define?: Record<string, string>): Promise<void> {
  await build({
    entryPoints: [entryPoint],
    outfile,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node20",
    sourcemap: false,
    legalComments: "none",
    external: ["node:sea"],
    define,
  });
}

async function main(): Promise<number> {
  if (process.platform !== "win32") {
    console.error("connector-build: WINDOWS_BUILD_REQUIRED");
    return 2;
  }
  const serverOrigin = parseServerOrigin(runtimeArgs());
  if (!serverOrigin) {
    console.error("connector-build: SERVER_ORIGIN_REQUIRED");
    console.error("usage: npm run build:connector -- --server-origin https://app.example.com");
    return 2;
  }

  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });
  const bridgeEntry = resolve(rootDirectory, "scripts", "tenax-connector-bridge.ts");
  const setupEntry = resolve(rootDirectory, "scripts", "tenax-connector-setup.ts");

  await buildBundle(bridgeEntry, connectorBundle, {
    __TENAX_SERVER_ORIGIN__: JSON.stringify(serverOrigin),
  });
  await createSeaBlob({ main: connectorBundle, output: connectorBlob, configPath: connectorSeaConfig });
  await copyFile(process.execPath, connectorExecutable);
  inject(connectorExecutable, connectorBlob);

  await writeFile(connectorPayload, gzipSync(await readFile(connectorExecutable)));
  await buildBundle(setupEntry, setupBundle, {
    __TENAX_SERVER_ORIGIN__: JSON.stringify(serverOrigin),
  });
  await createSeaBlob({
    main: setupBundle,
    output: setupBlob,
    configPath: setupSeaConfig,
    assets: { "tenax-connector.exe.gz": connectorPayload },
  });
  await copyFile(process.execPath, setupExecutable);
  inject(setupExecutable, setupBlob);

  await Promise.all([
    rm(connectorBundle, { force: true }),
    rm(connectorBlob, { force: true }),
    rm(setupBundle, { force: true }),
    rm(setupBlob, { force: true }),
    rm(connectorSeaConfig, { force: true }),
    rm(setupSeaConfig, { force: true }),
    rm(connectorPayload, { force: true }),
  ]);
  console.log(`connector-build: READY (${setupExecutable})`);
  return 0;
}

const exitCode = await main();
process.exitCode = exitCode;
