import { getTenaxDevStore } from "./dev-store.ts";
import {
  reconcilePaperTradingRuns,
} from "./paper-trading-run-service.ts";
import {
  getPaperTradingRunRepository,
  type PaperTradingRunFilter,
  type PaperTradingRunRepository,
} from "./paper-trading-run-repository.ts";
import type { PaperRunAuthorityOutcome, PaperRunExecutionStatus } from "./paper-trading-run.ts";

const ENVIRONMENTS = new Set(["DRY_RUN", "BITGET_DEMO"]);
const AUTHORITY_OUTCOMES = new Set(["EXECUTE", "ESCALATE", "REFUSE", "REVIEW", "NO_ACTION"]);
const EXECUTION_STATUSES = new Set(["NO_ORDER", "SUBMITTED", "FILLED", "FAILED", "UNKNOWN"]);

export function parsePaperTradingRunFilter(params: URLSearchParams): PaperTradingRunFilter {
  const environment = params.get("environment");
  const authorityOutcome = params.get("authority");
  const executionStatus = params.get("execution");
  const symbol = params.get("symbol")?.trim() ?? "";
  return {
    environment: environment && ENVIRONMENTS.has(environment) ? environment as PaperTradingRunFilter["environment"] : undefined,
    authorityOutcome: authorityOutcome && AUTHORITY_OUTCOMES.has(authorityOutcome) ? authorityOutcome as PaperRunAuthorityOutcome : undefined,
    executionStatus: executionStatus && EXECUTION_STATUSES.has(executionStatus) ? executionStatus as PaperRunExecutionStatus : undefined,
    symbol: symbol || undefined,
  };
}

export async function loadPaperTradingRuns(
  params: URLSearchParams,
  repository: PaperTradingRunRepository = getPaperTradingRunRepository(),
) {
  await reconcilePaperTradingRuns(getTenaxDevStore(), repository);
  const filter = parsePaperTradingRunFilter(params);
  const [runs, summary] = await Promise.all([
    repository.listRuns(filter),
    repository.summarizeRuns(filter),
  ]);
  return { repository, filter, runs, summary };
}
