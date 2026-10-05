// Browser-safe Local Connector bridge contract constants.
// Keep this module free of Node and provider imports so Client Components can
// construct loopback URLs without bundling the local connector runtime.
export const LOCAL_BRIDGE_HOST = "127.0.0.1" as const;
export const LOCAL_BRIDGE_PORT = 43127 as const;
export const LOCAL_BRIDGE_HANDOFF_PATH = "/v1/handoff" as const;
export const LOCAL_BRIDGE_STATUS_PATH = "/v1/status" as const;
export const LOCAL_BRIDGE_MAX_BODY_BYTES = 4096 as const;
