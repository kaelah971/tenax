// Tenax Connected Mode — honest account freshness states.

export const CONNECTED_SNAPSHOT_STALE_MS = 15 * 60 * 1000;

export type ConnectedAccountViewState =
  | "NOT_CONNECTED"
  | "AWAITING_FIRST_SYNC"
  | "CONNECTED"
  | "SYNC_STALE"
  | "DISCONNECTED"
  | "ERROR";

export function connectedAccountViewState(input: {
  readonly connectionStatus: string;
  readonly hasSnapshot: boolean;
  readonly syncedAt: string | null;
  readonly now?: Date;
}): ConnectedAccountViewState {
  if (input.connectionStatus === "ERROR") return "ERROR";
  if (input.connectionStatus === "DISCONNECTED") return "DISCONNECTED";
  if (input.connectionStatus === "NOT_CONNECTED") return "NOT_CONNECTED";
  if (!input.hasSnapshot) return "AWAITING_FIRST_SYNC";
  if (input.connectionStatus === "STALE") return "SYNC_STALE";
  const syncedAt = input.syncedAt ? new Date(input.syncedAt).getTime() : Number.NaN;
  const now = (input.now ?? new Date()).getTime();
  if (!Number.isFinite(syncedAt) || syncedAt > now || now - syncedAt > CONNECTED_SNAPSHOT_STALE_MS) {
    return "SYNC_STALE";
  }
  return "CONNECTED";
}

export function connectedAccountStateLabel(state: ConnectedAccountViewState): string {
  switch (state) {
    case "CONNECTED":
      return "CONNECTED · READ ONLY";
    case "SYNC_STALE":
      return "SYNC STALE";
    case "AWAITING_FIRST_SYNC":
      return "AWAITING FIRST SYNC";
    case "DISCONNECTED":
      return "DISCONNECTED";
    case "ERROR":
      return "ERROR";
    default:
      return "NOT CONNECTED";
  }
}
