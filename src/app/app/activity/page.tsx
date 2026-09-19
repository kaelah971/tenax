// Tenax Phase 1D — activity timeline (current-session flows only).
// No database: this lists in-memory flows and says so.
import Link from "next/link";

import { getTenaxDevStore } from "@/lib/tenax/dev-store";
import { SESSION_ONLY_NOTICE } from "../_copy";
import { Card, Chip } from "../_components/ui";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const flows = [...getTenaxDevStore().flows.entries()];

  return (
    <div className="flex flex-col gap-4 pt-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[30px] font-bold leading-[34px] tracking-[-0.5px] sm:text-[46px] sm:leading-[50px] sm:tracking-[-1px]">
          Activity
        </h1>
        <Chip tone="muted">CURRENT SESSION ONLY</Chip>
      </div>

      {flows.length === 0 ? (
        <Card title="No activity yet" meta="Start the golden path to create history">
          <p className="text-[16px] leading-[24px]">
            No protection flows this session.{" "}
            <Link href="/app/protect/nvidia" className="font-medium text-deep">
              Protect this exposure →
            </Link>
          </p>
        </Card>
      ) : (
        <Card title="Session flows" meta={`${flows.length} flow(s) this session`}>
          <ul className="flex flex-col gap-2">
            {flows.map(([flowId, flow]) => {
              const state = flow.getFlowState();
              const done = state === "COMPLETED";
              return (
                <li
                  key={flowId}
                  className="flex flex-wrap items-center gap-3 rounded-[10px] bg-cream px-3 py-2 text-[13px] leading-[18px]"
                >
                  <span className="font-semibold">{flowId}</span>
                  <Chip tone={done ? "pass" : state === "FAILED" ? "refused" : "dryrun"}>
                    {state}
                  </Chip>
                  <Link
                    href={done ? `/app/receipts/${flowId}` : `/app/analysis/${flowId}`}
                    className="ml-auto font-medium text-deep"
                  >
                    {done ? "View receipt →" : "Continue →"}
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      <p className="text-[11px] leading-[14px] text-muted">{SESSION_ONLY_NOTICE}</p>
    </div>
  );
}
