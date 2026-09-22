// Client-side browser alerts: progressive enhancement over in-app
// notifications. Permission is requested ONLY from an explicit click on
// the enable control — never on page load, never on import, never from
// effects. Unsupported or denied environments degrade silently: in-app
// notifications keep working normally. Foreground/session delivery only;
// no service worker.
"use client";

import { useState } from "react";

export type BrowserAlertPermission = "unsupported" | "denied" | "default" | "granted";

const STORAGE_KEY = "tenax-browser-alerts-enabled";

function getNotificationCtor(): typeof Notification | null {
  if (typeof globalThis === "undefined") return null;
  const ctor = (globalThis as { Notification?: typeof Notification }).Notification;
  return typeof ctor === "function" ? ctor : null;
}

/** Current permission without prompting. Safe to call anywhere, including tests. */
export function browserAlertsPermission(): BrowserAlertPermission {
  const ctor = getNotificationCtor();
  if (!ctor) return "unsupported";
  try {
    const permission = ctor.permission;
    if (permission === "granted" || permission === "denied" || permission === "default") {
      return permission;
    }
    return "unsupported";
  } catch {
    return "unsupported";
  }
}

/** Whether the user opted in AND the browser granted permission. */
export function isBrowserAlertsEnabled(): boolean {
  if (browserAlertsPermission() !== "granted") return false;
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setBrowserAlertsEnabled(enabled: boolean): void {
  try {
    if (enabled) globalThis.localStorage?.setItem(STORAGE_KEY, "1");
    else globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    // Preference is best-effort; in-app notifications are unaffected.
  }
}

/**
 * Explicit user action: ask the browser for notification permission.
 * The ONLY place Notification.requestPermission is ever invoked.
 */
export async function requestBrowserAlerts(): Promise<BrowserAlertPermission> {
  const ctor = getNotificationCtor();
  if (!ctor) return "unsupported";
  try {
    const result = await ctor.requestPermission();
    if (result === "granted") {
      setBrowserAlertsEnabled(true);
      return "granted";
    }
    setBrowserAlertsEnabled(false);
    return result === "denied" ? "denied" : "default";
  } catch {
    return "unsupported";
  }
}

export interface BrowserAlert {
  readonly title: string;
  readonly body: string;
  /** Same-origin Tenax route opened on click where supported. */
  readonly href?: string;
}

/**
 * Foreground alert. Returns false (no throw) unless permission was
 * explicitly granted. Never prompts — prompting happens only in
 * requestBrowserAlerts.
 */
export function sendBrowserAlert(alert: BrowserAlert): boolean {
  const ctor = getNotificationCtor();
  if (!ctor || browserAlertsPermission() !== "granted") return false;
  try {
    const notification = new ctor(alert.title, { body: alert.body });
    if (alert.href) {
      notification.onclick = () => {
        try {
          window.focus();
          window.location.assign(alert.href as string);
        } catch {
          // Navigation is best-effort; the alert already delivered.
        } finally {
          notification.close();
        }
      };
    }
    return true;
  } catch {
    return false;
  }
}

/** Outcome copy shared by action panels. Honest by construction: DRY_RUN
 *  previews never claim protection; Demo fills always say virtual funds;
 *  Demo submissions without a verified fill never claim protection either. */
export function browserAlertForCycleOutcome(input: {
  readonly outcome: string | null;
  readonly filled?: boolean;
  readonly executionMode?: string | null;
  readonly flowId: string;
  readonly proposedPct?: number | null;
  readonly proposedUsd?: number | null;
}): BrowserAlert | null {
  const receiptHref = `/app/receipts/${input.flowId}`;
  const approvalHref = `/app/approval/${input.flowId}`;
  switch (input.outcome) {
    case "STANDING_REVIEW":
      return {
        title: "Tenax needs your approval.",
        body: "Human approval required. No order sent.",
        href: approvalHref,
      };
    case "STANDING_ESCALATE": {
      const scope =
        typeof input.proposedPct === "number" && typeof input.proposedUsd === "number"
          ? ` ${input.proposedPct}% protection exceeds your standing authority.`
          : " An action exceeded your standing authority.";
      return {
        title: "Tenax needs human review.",
        body: `${scope.trim()} No order sent.`,
        href: approvalHref,
      };
    }
    case "STANDING_REFUSED":
      return {
        title: "Tenax refused an action.",
        body: "Execution stayed inside your safety rules. No order sent.",
        href: `/app/analysis/${input.flowId}`,
      };
    case "EXECUTED":
      // Only Demo results ever carry filled:true. A Demo submission
      // without a verified fill must not borrow dry-run copy ("move no
      // funds" would deny a real submission) nor claim protection.
      if (input.filled === true) {
        return {
          title: "Tenax protected NVIDIA.",
          body: "Bitget Demo protection filled — virtual funds. View receipt.",
          href: receiptHref,
        };
      }
      if (input.executionMode === "BITGET_DEMO") {
        return {
          title: "Demo order submitted.",
          body: "Bitget Demo order submitted — fill not yet verified. Virtual funds. View receipt.",
          href: receiptHref,
        };
      }
      return {
        title: "Agent cycle finished.",
        body: "View the decision receipt. Dry runs move no funds.",
        href: receiptHref,
      };
    case "FAILED":
      return {
        title: "Protection could not be executed.",
        body: "Tenax could not complete the protection. No position was opened.",
        href: `/app/analysis/${input.flowId}`,
      };
    default:
      return null;
  }
}

export default function EnableBrowserAlerts() {
  // Render-phase read of the (side-effect-free) permission plus an
  // explicit override after the user clicks — no mount effect, so the
  // SSR HTML and first client render agree without cascading renders.
  const [override, setOverride] = useState<BrowserAlertPermission | null>(null);
  const [busy, setBusy] = useState(false);
  const status: BrowserAlertPermission = override ?? browserAlertsPermission();

  async function onEnable() {
    setBusy(true);
    try {
      setOverride(await requestBrowserAlerts());
    } finally {
      setBusy(false);
    }
  }

  if (status === "granted") {
    return (
      <p className="font-syslabel text-[11px] uppercase leading-[18px] tracking-[0.08em] text-mutedink">
        BROWSER ALERTS ON · TENAX MAY NOTIFY THIS SESSION WHEN IT NEEDS YOU OR ACTS
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => void onEnable()}
        disabled={busy || status === "unsupported" || status === "denied"}
        className="font-syslabel min-h-11 rounded-[9px] border border-ink/70 bg-softwhite/30 px-4 py-2 text-[12px] font-bold uppercase leading-[18px] tracking-[0.08em] hover:bg-ink hover:text-softwhite disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy
          ? "Requesting…"
          : status === "denied"
            ? "Browser alerts blocked"
            : status === "unsupported"
              ? "Browser alerts unavailable"
              : "Enable browser alerts"}
      </button>
      <p className="font-syslabel max-w-md text-[11px] uppercase leading-[18px] tracking-[0.08em] text-mutedink">
        Optional. Asks permission once, only when you click. In-app notifications work regardless.
      </p>
    </div>
  );
}
