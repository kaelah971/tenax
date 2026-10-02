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
