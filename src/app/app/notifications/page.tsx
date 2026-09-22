// Tenax Notifications — the user-facing attention surface.
// "Tenax needs your attention / Tenax acted." The activity page remains
// the durable audit trail; this page is the compact actionable subset.
// Server-rendered from the process-local store; interactions (read,
// mark-all) POST to the read API. Browser alerts are optional,
// explicitly enabled, and never required.
import Link from "next/link";

import { getTenaxDevStore } from "@/lib/tenax/dev-store";
import { getUnreadNotificationCount, listNotifications } from "@/lib/tenax/notifications";
import { SESSION_ONLY_NOTICE } from "../_copy";
import { DecisionRail, ProvenanceStrip } from "../_components/ui";
import EnableBrowserAlerts from "../_components/BrowserAlerts";
import NotificationList from "./NotificationList";

export const dynamic = "force-dynamic";

function filterClass(active: boolean): string {
  return `font-syslabel rounded-[7px] px-3 py-2 text-[11px] uppercase leading-[14px] tracking-[0.08em] ${
    active ? "bg-ink font-bold text-softwhite" : "text-mutedink hover:bg-ink/5"
  }`;
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const unreadOnly = filter === "unread";
  const store = getTenaxDevStore();
  const items = listNotifications(store, { unreadOnly });
  const unreadCount = getUnreadNotificationCount(store);

  return (
    <div className="tx-observatory-entry flex flex-col gap-8 pt-7 sm:gap-10 sm:pt-10">
      <DecisionRail current="RECEIPT" />
      <div className="tx-material-editorial border-t-2 border-ink pt-7 sm:pt-10">
        <div>
          <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
            NOTIFICATIONS · {unreadOnly ? "UNREAD" : "ALL"}
          </p>
          <h1 className="mt-3 text-[52px] font-extrabold leading-[0.9] tracking-[-0.05em] sm:text-[92px]">
            Inbox
          </h1>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link href="/app/notifications" className={filterClass(!unreadOnly)} aria-current={!unreadOnly ? "page" : undefined}>
            All
          </Link>
          <Link
            href="/app/notifications?filter=unread"
            className={filterClass(unreadOnly)}
            aria-current={unreadOnly ? "page" : undefined}
          >
            Unread{unreadCount > 0 ? ` (${unreadCount})` : ""}
          </Link>
        </div>
      </div>

      <section aria-label="Notifications" className="tx-material-editorial border-t-2 border-ink pt-5 sm:pt-7">
        <NotificationList items={items} />
      </section>

      <section aria-label="Browser alerts" className="tx-material-editorial border-t-2 border-ink p-5 sm:p-7">
        <p className="font-syslabel text-[11px] uppercase leading-[14px] tracking-[0.08em] text-mutedink">
          BROWSER ALERTS · OPTIONAL
        </p>
        <div className="mt-3">
          <EnableBrowserAlerts />
        </div>
      </section>

      <p className="text-[11px] leading-[14px] text-mutedink">{SESSION_ONLY_NOTICE}</p>
      <ProvenanceStrip items={["SIMULATED PORTFOLIO", "DEVELOPMENT ANALYSIS"]} />
    </div>
  );
}
