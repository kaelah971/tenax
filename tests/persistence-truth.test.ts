// Persistence-truth regressions: demo failure honesty + retry-once.
//
// Proves: (1) a judge demo whose run cannot be durably retrieved fails
// loudly instead of returning fake success; (2) a successful demo write
// is immediately retrievable with its proof; (3) Postgres repositories
// survive exactly one transient cold-start failure and still fail
// honestly afterwards. All offline with injected fakes — no network.
import { beforeEach, describe, expect, it } from "vitest";

import { createDevStore } from "../src/lib/tenax/index";
import {
  runJudgeDemo,
} from "../src/lib/tenax/judge-demo";
import {
  InMemoryPaperTradingRunRepository,
  PostgresPaperTradingRunRepository,
  resetPaperTradingRunRepositoryForTests,
  type PaperTradingRunRepository,
} from "../src/lib/tenax/paper-trading-run-repository";
import {
  InMemoryProofRepository,
  PostgresProofRepository,
} from "../src/lib/proof/repository";
import type { PaperTradingRun } from "../src/lib/tenax/paper-trading-run";

const NOW = Date.parse("2026-10-08T09:00:00.000Z");

/** Run writes fail exactly like a dead store; reads keep working. */
class WriteFailingRuns extends InMemoryPaperTradingRunRepository {
  override async saveRun(): Promise<PaperTradingRun> {
    throw new Error("PAPER_RUN_STORE_UNAVAILABLE");
  }
  override async updateRun(): Promise<PaperTradingRun | null> {
    throw new Error("PAPER_RUN_STORE_UNAVAILABLE");
  }
}

beforeEach(() => {
  resetPaperTradingRunRepositoryForTests();
});

describe("demo persistence truthfulness", () => {
  it("a demo whose run cannot persist fails instead of reporting success", async () => {
    const store = createDevStore();
    await expect(
      runJudgeDemo(store, {
        nowMs: NOW,
        runRepository: new WriteFailingRuns() as PaperTradingRunRepository,
        proofRepository: new InMemoryProofRepository(),
      }),
    ).rejects.toThrow(/not retrievable|was not recorded|UNAVAILABLE/);
  });

  it("a successful demo write is immediately retrievable with its proof", async () => {
    const store = createDevStore();
    const runRepo = new InMemoryPaperTradingRunRepository();
    const proofRepo = new InMemoryProofRepository();
    const result = await runJudgeDemo(store, {
      nowMs: NOW,
      runRepository: runRepo,
      proofRepository: proofRepo,
    });
    expect(result.authorityOutcome).toBe("REFUSE");
    const reread = await runRepo.getRun(result.runId);
    expect(reread?.sourceProofId).toBe(result.proofId);
    expect(await proofRepo.getProof(result.proofId)).not.toBeNull();
  });
});

describe("Postgres retry-once on transient failure", () => {
  function flakyFactory(failuresBeforeSuccess: number, calls: string[]) {
    let attempts = 0;
    return async () => ({
      connect: async () => {
        attempts += 1;
        calls.push(`connect#${attempts}`);
        if (attempts <= failuresBeforeSuccess) throw new Error("connect ECONNREFUSED");
      },
      query: async (text: string) => {
        calls.push(`query:${text.trimStart().slice(0, 6)}`);
        if (text.trimStart().startsWith("CREATE")) return { rows: [] };
        return { rows: [] };
      },
      end: async () => {},
    });
  }

  it("run repository survives one cold-start failure, then fails honestly", async () => {
    const calls: string[] = [];
    const repo = new PostgresPaperTradingRunRepository(
      "postgres://owner@localhost/tenax",
      flakyFactory(1, calls) as never,
    );
    // listRuns issues schema + select; first connect dies, retry succeeds.
    await expect(repo.listRuns({ limit: 1 })).resolves.toEqual([]);
    expect(calls.filter((c) => c.startsWith("connect#")).length).toBe(2);
    const alwaysDown = new PostgresPaperTradingRunRepository(
      "postgres://owner@localhost/tenax",
      flakyFactory(99, calls) as never,
    );
    await expect(alwaysDown.listRuns({ limit: 1 })).rejects.toThrow("PAPER_RUN_STORE_UNAVAILABLE");
  });

  it("proof repository survives one cold-start failure, then fails honestly", async () => {
    const calls: string[] = [];
    const repo = new PostgresProofRepository(
      "postgres://owner@localhost/tenax",
      flakyFactory(1, calls) as never,
    );
    await expect(repo.listProofs({ limit: 1 })).resolves.toEqual([]);
    expect(calls.filter((c) => c.startsWith("connect#")).length).toBe(2);
    const alwaysDown = new PostgresProofRepository(
      "postgres://owner@localhost/tenax",
      flakyFactory(99, calls) as never,
    );
    await expect(alwaysDown.listProofs({ limit: 1 })).rejects.toThrow("PROOF_STORE_UNAVAILABLE");
  });
});
