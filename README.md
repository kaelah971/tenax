This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Connected Mode local connector

Connected Mode keeps Bitget OAuth credentials on the local connector device. Start the app, create a pairing code from `/app/connected`, then run:

```bash
node scripts/bitget-agentic-connector.ts \
  --server http://localhost:3000 \
  --pair <PAIRING_CODE>

# Retry the last snapshot upload without repeating OAuth
node scripts/bitget-agentic-connector.ts --retry
```

The connector consumes the one-time code by POST, runs the official Bitget OAuth loopback flow locally, configures the SDK read-only, reads identity/assets/positions, validates a strict sanitized snapshot, and uploads it using a separate connection-scoped sync token. Raw credentials and the sync token remain local; no connected-user orders are reachable. Never put the pairing code in a URL or commit local connector metadata.

`--disconnect` clears only local Tenax connector metadata. It does not revoke Bitget OAuth remotely; use **DISCONNECT BITGET** in `/app/connected` for server-side Tenax revocation.

### Local connector bridge contract

The installed helper listens only on `127.0.0.1:43127`. Its handoff endpoint is `POST /v1/handoff` with strict JSON `{ serverOrigin, pairingCode }`; the pairing code is never accepted in a query string or `tenax://` URI. The browser Origin must exactly match the configured Tenax origin. Safe progress is available from `GET /v1/status`.

The secret-free launch URI is `tenax://open`. Generate a Windows per-user registration fixture without changing the registry:

```bash
node scripts/generate-tenax-protocol-registration.ts \
  --executable "C:\\Program Files\\Tenax\\tenax-connector-bridge.exe" \
  --server-origin https://app.example.com
```

The bridge reuses the existing local OAuth, read-only provider, sanitization, and snapshot upload orchestration. No connected-user trading is exposed.

### Windows connector release

The release path uses Node Single Executable Application (SEA): esbuild bundles the existing connector and SDK, then the current Windows Node runtime is embedded into `tenax-connector.exe` and a small setup executable. No separate Node installation is required for end users. Build on Windows with a public Tenax origin:

```bash
npm run build:connector -- --server-origin https://app.example.com
```

This writes ignored artifacts under `release/tenax-connector/`, including `tenax-connector-setup.exe`. The setup executable installs per-user under `%LOCALAPPDATA%\\Tenax\\Connector`, registers `tenax://` under `HKCU\\Software\\Classes\\tenax`, and is idempotent. It does not write the database, environment, provider credentials, or pairing data. The web install button is enabled only when `TENAX_CONNECTOR_INSTALLER_URL` is configured to a real HTTPS release artifact; development otherwise reports the installer as unavailable rather than fabricating a URL.

Uninstall explicitly with `tenax-connector-setup.exe --uninstall`. This removes the current-user protocol registration and installed runtime but preserves Bitget OAuth credentials and Tenax sync metadata unless `--remove-bitget-credentials` or `--remove-local-metadata` is explicitly supplied. Remote Bitget revocation is not claimed.

### Local packaged connector QA (PowerShell)

This local profile does not require public hosting, signing, or admin rights. It performs no OAuth and no registry mutation in automated tests:

```powershell
$serverOrigin = "http://localhost:3000"
npm run build:connector -- --server-origin $serverOrigin

$releaseDir = (Resolve-Path .\\release\\tenax-connector).Path
$setup = Join-Path $releaseDir "tenax-connector-setup.exe"
$builtConnector = Join-Path $releaseDir "tenax-connector.exe"
Test-Path $setup
Test-Path $builtConnector

# Safe runtime/module/loopback preflight; no OAuth, provider reads, or writes.
& $builtConnector --preflight
& $builtConnector --preflight-handoff

# Per-user install; no elevation prompt is expected.
& $setup
$installedConnector = Join-Path $env:LOCALAPPDATA "Tenax\\Connector\\tenax-connector.exe"
Test-Path $installedConnector
& $installedConnector --preflight

# Verify the current-user protocol command and safe loopback status.
Get-ItemProperty "HKCU:\\Software\\Classes\\tenax\\shell\\open\\command"
Start-Process "tenax://open"
Invoke-WebRequest "http://127.0.0.1:43127/v1/status" -Headers @{ Origin = $serverOrigin }

# After owner QA, remove only the installed runtime and protocol registration.
& $setup --uninstall
```

After the preflight gate, start Tenax with durable `DATABASE_URL`, open `/app/connected`, and click **CONNECT BITGET**. The browser then owns the normal flow: `tenax://open` → packaged bridge → localhost handoff → owner-controlled Bitget OAuth → read-only sync. Do not begin the OAuth step automatically from a script.

### Owner QA (PowerShell; run only when explicitly approved)

```powershell
# Terminal 1: use the owner's durable local Postgres URL; never paste it into logs or commits.
$env:DATABASE_URL = "<OWNER_DATABASE_URL>"
npm run dev

# Terminal 2:
Start-Process "http://localhost:3000/app/connected"
# In the browser: establish the session and create a pairing code.
$pairingCode = "<PAIRING_CODE_FROM_CONNECTED_UI>"
node scripts/bitget-agentic-connector.ts `
  --server http://localhost:3000 `
  --pair $pairingCode

# After the first sync, this must succeed without repeating OAuth.
node scripts/bitget-agentic-connector.ts --retry

# In the browser click DISCONNECT BITGET, then this must fail with SYNC_UNAUTHORIZED.
node scripts/bitget-agentic-connector.ts --retry

# Optional local cleanup; provider OAuth credentials remain untouched.
node scripts/bitget-agentic-connector.ts --disconnect
```

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
