// Tenax deployment health/readiness (read-only, instant, secret-free).
//
// Reports configuration booleans only: what is configured, never the
// values. Performs NO external calls (no database query, no AI call, no
// Bitget/MCP traffic) so health itself cannot fail, hang, or leak.
// Durability and source reachability are proven per-request by the
// surfaces that need them (/app/proof, /app/paper-trading, /app/events).
import { resolveAiConfig, resolveAnalysisMode } from "@/lib/ai/provider.ts";
import { isDemoTradingMode, resolveExecutionMode } from "@/lib/tenax/execution";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const ai = resolveAiConfig(process.env);
  return Response.json(
    {
      ok: true,
      timestamp: new Date().toISOString(),
      database: {
        configured: (process.env.DATABASE_URL ?? "").trim() !== "",
      },
      ai: {
        configured: ai !== null,
        provider: ai?.provider ?? null,
        analysisMode: resolveAnalysisMode(process.env),
      },
      execution: {
        mode: resolveExecutionMode(process.env),
        demoBackend: isDemoTradingMode(process.env),
        demoCredentialsPresent:
          (process.env.BITGET_API_KEY ?? "").trim() !== "" &&
          (process.env.BITGET_SECRET_KEY ?? "").trim() !== "" &&
          (process.env.BITGET_PASSPHRASE ?? "").trim() !== "",
      },
      eventSource: {
        note: "Bitget MCP is probed per-request on /app/events, never by health and never at build time",
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
