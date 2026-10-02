// Tenax local Bitget Agentic connector — Connected Mode Slice 4.
//
// Run locally, never as a hosted Next.js route. Official Bitget OAuth binds
// to 127.0.0.1; the SDK and Tenax connector metadata persist credentials
// locally on the connector device. This CLI prints only safe status and
// snapshot summary fields.
//
// Initial sync:
//   node scripts/bitget-agentic-connector.ts --server http://localhost:3000 --pair <PAIRING_CODE>
// Retry the last upload without repeating OAuth:
//   node scripts/bitget-agentic-connector.ts --retry
// Clear only local Tenax metadata (does not revoke Bitget OAuth remotely):
//   node scripts/bitget-agentic-connector.ts --disconnect
//
// Exit codes: 0 = synced; 1 = safe connector failure; 2 = usage error.
import {
  ConnectorError,
  clearLocalConnector,
  createDefaultConnectorDependencies,
  retryLocalConnector,
  runLocalConnector,
  safeConnectorMessage,
} from "../src/lib/connected/connector.ts";

type ConnectorArgs =
  | { readonly ok: true; readonly mode: "INITIAL"; readonly server: string; readonly pair: string; readonly oauthTimeoutMs?: number }
  | { readonly ok: true; readonly mode: "RETRY" }
  | { readonly ok: true; readonly mode: "DISCONNECT" }
  | { readonly ok: false };

function parseArgs(argv: readonly string[]): ConnectorArgs {
  let server: string | undefined;
  let pair: string | undefined;
  let retry = false;
  let disconnect = false;
  let oauthTimeoutMs: number | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--retry" && !retry && !disconnect && !server && !pair && oauthTimeoutMs === undefined) {
      retry = true;
      continue;
    }
    if (flag === "--disconnect" && !retry && !disconnect && !server && !pair && oauthTimeoutMs === undefined) {
      disconnect = true;
      continue;
    }
    if ((flag === "--server" || flag === "--pair" || flag === "--oauth-timeout-ms") && value) {
      if (retry) return { ok: false };
      if (flag === "--server") server = value;
      else if (flag === "--pair") pair = value;
      else {
        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed <= 0) return { ok: false };
        oauthTimeoutMs = parsed;
      }
      index += 1;
      continue;
    }
    return { ok: false };
  }
  if (retry) return { ok: true, mode: "RETRY" };
  if (disconnect) return { ok: true, mode: "DISCONNECT" };
  if (!server || !pair) return { ok: false };
  return { ok: true, mode: "INITIAL", server, pair, oauthTimeoutMs };
}

function printSuccess(result: Awaited<ReturnType<typeof runLocalConnector>>): void {
  console.log("tenax: CONNECTION     CONNECTED");
  console.log("access:      READ ONLY");
  console.log(`provider:    ${result.summary.provider}`);
  console.log(`providerUserId: ${result.summary.providerUserId}`);
  console.log(`assets:      ${result.summary.assetCount}`);
  console.log(`positions:   ${result.summary.positionCount}`);
  console.log(`lastSync:    ${result.summary.syncedAt}`);
  console.log("snapshot:    VALIDATED · SYNCED");
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.ok) {
    console.error("connector: USAGE_INVALID");
    console.error("usage: node scripts/bitget-agentic-connector.ts --server <origin> --pair <code>");
    console.error("   or: node scripts/bitget-agentic-connector.ts --retry");
    console.error("   or: node scripts/bitget-agentic-connector.ts --disconnect");
    return 2;
  }

  try {
    const dependencies = createDefaultConnectorDependencies();
    if (args.mode === "DISCONNECT") {
      const cleanup = await clearLocalConnector(dependencies);
      console.log("tenax: LOCAL METADATA CLEARED");
      console.log("provider credentials: UNCHANGED");
      console.log("remote Bitget revocation: NOT REQUESTED");
      console.log("Use DISCONNECT BITGET in /app/connected for server-side Tenax revocation.");
      return cleanup.status === "LOCAL_METADATA_CLEARED" ? 0 : 1;
    }
    const result = args.mode === "RETRY"
      ? await retryLocalConnector(dependencies)
      : await runLocalConnector(
          {
            serverOrigin: args.server,
            pairingCode: args.pair,
            oauthTimeoutMs: args.oauthTimeoutMs,
            onAuthorizeUrl: (authorizeUrl) => {
              console.log("oauth: open this local authorization URL in your browser:");
              console.log(authorizeUrl);
              console.log("oauth: waiting for the loopback callback…");
            },
          },
          dependencies,
        );
    printSuccess(result);
    return 0;
  } catch (error) {
    const code = error instanceof ConnectorError ? error.code : "ACCOUNT_READ_FAILED";
    console.error(`connector: ${code}`);
    console.error(`message: ${safeConnectorMessage(code)}`);
    return 1;
  }
}

const code = await main();
process.exitCode = code;
