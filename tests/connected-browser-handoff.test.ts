import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  defaultLaunchProtocol,
  runConnectedHandoff,
  type BrowserConnectState,
  type BrowserPairingPayload,
} from "@/lib/connected/browser-handoff";
import {
  LOCAL_BRIDGE_HANDOFF_PATH,
  LOCAL_BRIDGE_STATUS_PATH,
} from "@/lib/connected/local-bridge";

const SERVER_ORIGIN = "http://localhost:3000";
const PAIRING_CODE = "A".repeat(48);
const EXPIRES_AT = new Date(Date.now() + 60_000).toISOString();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeFetch(statuses: Array<unknown | Error>) {
  const statusQueue = [...statuses];
  const statusCalls: string[] = [];
  const handoffBodies: Array<Record<string, unknown>> = [];
  const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const value = String(url);
    if (value.endsWith(LOCAL_BRIDGE_STATUS_PATH)) {
      statusCalls.push(value);
      const next = statusQueue.shift();
      if (next instanceof Error) throw next;
      return jsonResponse(next ?? { ok: true, state: "CONNECTOR_READY", errorCode: null });
    }
    if (value.endsWith(LOCAL_BRIDGE_HANDOFF_PATH)) {
      handoffBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return jsonResponse({ ok: true, state: "HANDOFF_ACCEPTED" }, 202);
    }
    throw new Error(`unexpected URL: ${value}`);
  });
  return { fetchImpl, statusCalls, handoffBodies };
}

function pairing() {
  return { pairingCode: PAIRING_CODE, expiresAt: EXPIRES_AT };
}

describe("browser Connected Mode handoff", () => {
  it("launches secret-free protocol in a transient iframe without replacing the current page", () => {
    vi.useFakeTimers();
    const frame = {
      src: "",
      hidden: false,
      setAttribute: vi.fn(),
      remove: vi.fn(),
    };
    const body = { appendChild: vi.fn() };
    const currentPage = { href: "http://localhost:3000/app/connected" };
    vi.stubGlobal("document", {
      body,
      createElement: vi.fn(() => frame),
    } as unknown as Document);
    vi.stubGlobal("window", { location: currentPage } as unknown as Window);

    try {
      defaultLaunchProtocol();

      expect(frame.src).toBe("tenax://open");
      expect(frame.src).not.toContain(PAIRING_CODE);
      expect(frame.hidden).toBe(true);
      expect(frame.setAttribute).toHaveBeenCalledWith("aria-hidden", "true");
      expect(body.appendChild).toHaveBeenCalledWith(frame);
      expect(frame.remove).not.toHaveBeenCalled();
      expect(currentPage.href).toBe("http://localhost:3000/app/connected");

      vi.advanceTimersByTime(999);
      expect(frame.remove).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(frame.remove).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("launches the secret-free protocol before awaiting pairing creation", async () => {
    const bridge = makeFetch([
      { ok: true, state: "CONNECTOR_READY", errorCode: null },
      { ok: true, state: "CONNECTED", errorCode: null },
    ]);
    const states: BrowserConnectState[] = [];
    const launches: string[] = [];
    let finishPairing!: (value: BrowserPairingPayload) => void;
    const createPairing = vi.fn(() => new Promise<BrowserPairingPayload>((resolve) => {
      finishPairing = resolve;
    }));

    const handoff = runConnectedHandoff(
      {
        serverOrigin: SERVER_ORIGIN,
        signal: new AbortController().signal,
        createPairing,
        launchProtocolImmediately: true,
        onState: (state) => states.push(state),
      },
      {
        fetchImpl: bridge.fetchImpl,
        launchProtocol: () => launches.push("tenax://open"),
        delay: async () => {},
        maxPolls: 2,
      },
    );

    expect(createPairing).toHaveBeenCalledOnce();
    expect(states).toEqual(["OPENING_CONNECTOR"]);
    expect(launches).toEqual(["tenax://open"]);
    expect(launches.join(" ")).not.toContain(PAIRING_CODE);

    finishPairing(pairing());
    expect((await handoff).outcome).toBe("CONNECTED");
    expect(bridge.handoffBodies).toEqual([{ serverOrigin: SERVER_ORIGIN, pairingCode: PAIRING_CODE }]);
  });

  it("creates pairing internally, posts the secret only in the localhost body, and reaches CONNECTED", async () => {
    const bridge = makeFetch([
      { ok: true, state: "CONNECTOR_READY", errorCode: null },
      { ok: true, state: "HANDOFF_ACCEPTED", errorCode: null },
      { ok: true, state: "OAUTH_PENDING", errorCode: null },
      { ok: true, state: "SYNCING", errorCode: null },
      { ok: true, state: "CONNECTED", errorCode: null },
    ]);
    const controller = new AbortController();
    const states: BrowserConnectState[] = [];
    const createPairing = vi.fn(async () => pairing());
    const launches: string[] = [];

    const result = await runConnectedHandoff(
      {
        serverOrigin: SERVER_ORIGIN,
        signal: controller.signal,
        createPairing,
        onState: (state) => states.push(state),
      },
      {
        fetchImpl: bridge.fetchImpl,
        launchProtocol: () => launches.push("tenax://open"),
        delay: async () => {},
        maxPolls: 8,
      },
    );

    expect(result.outcome).toBe("CONNECTED");
    expect(createPairing).toHaveBeenCalledOnce();
    expect(launches).toEqual([]);
    expect(bridge.handoffBodies).toEqual([{ serverOrigin: SERVER_ORIGIN, pairingCode: PAIRING_CODE }]);
    expect(states).toEqual(expect.arrayContaining([
      "CREATING_PAIRING",
      "CONNECTOR_READY",
      "HANDOFF_ACCEPTED",
      "WAITING_FOR_AUTHORIZATION",
      "SYNCING_ACCOUNT",
      "CONNECTED",
    ]));
    expect(bridge.handoffBodies[0]).not.toHaveProperty("url");
  });

  it("launches only the secret-free protocol when the bridge is unreachable, then retries status", async () => {
    const bridge = makeFetch([
      new Error("offline"),
      { ok: true, state: "CONNECTOR_READY", errorCode: null },
      { ok: true, state: "CONNECTED", errorCode: null },
    ]);
    const launches: string[] = [];

    const result = await runConnectedHandoff(
      {
        serverOrigin: SERVER_ORIGIN,
        signal: new AbortController().signal,
        createPairing: async () => pairing(),
      },
      {
        fetchImpl: bridge.fetchImpl,
        launchProtocol: () => launches.push("tenax://open"),
        delay: async () => {},
        maxPolls: 4,
      },
    );

    expect(result.outcome).toBe("CONNECTED");
    expect(launches).toEqual(["tenax://open"]);
    expect(launches.join(" ")).not.toContain(PAIRING_CODE);
    expect(bridge.handoffBodies[0]).toEqual({ serverOrigin: SERVER_ORIGIN, pairingCode: PAIRING_CODE });
  });

  it("stops bounded polling and reports connector not detected", async () => {
    const bridge = makeFetch([new Error("offline"), new Error("offline"), new Error("offline"), new Error("offline")]);
    const launchProtocol = vi.fn();
    const states: BrowserConnectState[] = [];
    const result = await runConnectedHandoff(
      {
        serverOrigin: SERVER_ORIGIN,
        signal: new AbortController().signal,
        createPairing: async () => pairing(),
        onState: (state) => states.push(state),
      },
      { fetchImpl: bridge.fetchImpl, launchProtocol, delay: async () => {}, maxPolls: 3 },
    );

    expect(result.outcome).toBe("CONNECTOR_NOT_DETECTED");
    expect(states.at(-1)).toBe("CONNECTOR_NOT_DETECTED");
    expect(launchProtocol).toHaveBeenCalledOnce();
    expect(bridge.handoffBodies).toHaveLength(0);
    expect(bridge.statusCalls).toHaveLength(4);
  });

  it("bounds a hung localhost status request and reaches connector not detected", async () => {
    let requestSignal: AbortSignal | undefined;
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      requestSignal = init?.signal as AbortSignal;
      return new Promise<Response>(() => {});
    });
    const states: BrowserConnectState[] = [];
    const result = await runConnectedHandoff(
      {
        serverOrigin: SERVER_ORIGIN,
        signal: new AbortController().signal,
        createPairing: async () => pairing(),
        onState: (state) => states.push(state),
      },
      {
        fetchImpl,
        launchProtocol: () => {},
        delay: async () => {},
        maxPolls: 0,
        bridgeRequestTimeoutMs: 5,
      },
    );

    expect(result.outcome).toBe("CONNECTOR_NOT_DETECTED");
    expect(states).toContain("WAITING_FOR_CONNECTOR");
    expect(states.at(-1)).toBe("CONNECTOR_NOT_DETECTED");
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(requestSignal?.aborted).toBe(true);
  });

  it("maps bridge failure and expiry without exposing provider errors", async () => {
    const bridge = makeFetch([
      { ok: true, state: "CONNECTOR_READY", errorCode: null },
      { ok: true, state: "FAILED", errorCode: "CONNECTOR_FAILED" },
    ]);
    const failedStates: BrowserConnectState[] = [];
    const failed = await runConnectedHandoff(
      {
        serverOrigin: SERVER_ORIGIN,
        signal: new AbortController().signal,
        createPairing: async () => pairing(),
        onState: (state) => failedStates.push(state),
      },
      { fetchImpl: bridge.fetchImpl, delay: async () => {}, maxPolls: 3 },
    );
    expect(failed.outcome).toBe("FAILED");
    expect(failedStates.at(-1)).toBe("FAILED");

    const fetchNever = vi.fn(async () => {
      throw new Error("must not poll expired pairing");
    });
    const expired = await runConnectedHandoff(
      {
        serverOrigin: SERVER_ORIGIN,
        signal: new AbortController().signal,
        createPairing: async () => ({ pairingCode: PAIRING_CODE, expiresAt: new Date(Date.now() - 1_000).toISOString() }),
      },
      { fetchImpl: fetchNever, launchProtocol: () => {}, delay: async () => {} },
    );
    expect(expired.outcome).toBe("PAIRING_EXPIRED");
    expect(fetchNever).not.toHaveBeenCalled();
  });

  it("aborts the polling wait when the browser component is cleaned up", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.signal as AbortSignal).aborted) throw new DOMException("aborted", "AbortError");
      throw new Error("offline");
    });
    const delay = vi.fn(async () => {
      controller.abort();
    });

    const result = await runConnectedHandoff(
      {
        serverOrigin: SERVER_ORIGIN,
        signal: controller.signal,
        createPairing: async () => pairing(),
      },
      { fetchImpl, launchProtocol: () => {}, delay, maxPolls: 10 },
    );

    expect(result.outcome).toBe("ABORTED");
    expect(delay).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("allows one fresh bounded protocol launch on a retry", async () => {
    const createPairing = vi
      .fn()
      .mockResolvedValueOnce({ pairingCode: "FIRST", expiresAt: EXPIRES_AT })
      .mockResolvedValueOnce({ pairingCode: "SECOND", expiresAt: EXPIRES_AT });
    const launches: string[] = [];

    const run = async () => {
      const bridge = makeFetch([new Error("offline"), new Error("offline")]);
      const result = await runConnectedHandoff(
        {
          serverOrigin: SERVER_ORIGIN,
          signal: new AbortController().signal,
          createPairing,
          launchProtocolImmediately: true,
        },
        { fetchImpl: bridge.fetchImpl, launchProtocol: () => launches.push("tenax://open"), delay: async () => {}, maxPolls: 1 },
      );
      expect(bridge.statusCalls).toHaveLength(2);
      return result;
    };

    expect((await run()).outcome).toBe("CONNECTOR_NOT_DETECTED");
    expect((await run()).outcome).toBe("CONNECTOR_NOT_DETECTED");
    expect(createPairing).toHaveBeenCalledTimes(2);
    expect(launches).toEqual(["tenax://open", "tenax://open"]);
    expect(launches.join(" ")).not.toContain("FIRST");
    expect(launches.join(" ")).not.toContain("SECOND");
  });

  it("creates fresh pairing material on every retry", async () => {
    const createPairing = vi
      .fn()
      .mockResolvedValueOnce({ pairingCode: "FIRST", expiresAt: EXPIRES_AT })
      .mockResolvedValueOnce({ pairingCode: "SECOND", expiresAt: EXPIRES_AT });
    const bodies: Array<Record<string, unknown>> = [];

    const run = async () => {
      const bridge = makeFetch([
        { ok: true, state: "CONNECTOR_READY", errorCode: null },
        { ok: true, state: "CONNECTED", errorCode: null },
      ]);
      const result = await runConnectedHandoff(
        {
          serverOrigin: SERVER_ORIGIN,
          signal: new AbortController().signal,
          createPairing,
        },
        { fetchImpl: bridge.fetchImpl, delay: async () => {}, maxPolls: 2 },
      );
      bodies.push(...bridge.handoffBodies);
      return result;
    };

    expect((await run()).outcome).toBe("CONNECTED");
    expect((await run()).outcome).toBe("CONNECTED");
    expect(createPairing).toHaveBeenCalledTimes(2);
    expect(bodies.map((body) => body.pairingCode)).toEqual(["FIRST", "SECOND"]);
  });

  it("keeps public Connected Mode informational while preserving experimental handoff contracts", () => {
    const panel = readFileSync(resolve(process.cwd(), "src", "app", "app", "connected", "PairingPanel.tsx"), "utf8");
    const page = readFileSync(resolve(process.cwd(), "src", "app", "app", "connected", "page.tsx"), "utf8");
    const handoff = readFileSync(resolve(process.cwd(), "src", "lib", "connected", "browser-handoff.ts"), "utf8");
    const idleSection = panel.slice(panel.indexOf('{state === "IDLE"'), panel.indexOf('{pairing && !connected'));
    const finallyBlock = panel.slice(panel.indexOf("    } finally {"), panel.indexOf("    } finally {") + 220);

    expect(page).toContain("PERSONAL BITGET ACCOUNTS");
    expect(page).toContain("Bring your own portfolio into Tenax.");
    expect(page).toContain("COMING SOON — HOSTED CONNECTION");
    expect(page).toContain("LAUNCH NVIDIA PROTECTION");
    expect(page).not.toContain("CONNECT BITGET");
    expect(page).not.toContain("INSTALL TENAX CONNECTOR");
    expect(page).not.toContain("TRY AGAIN");
    expect(page).not.toContain("PAIRING CODE");
    expect(page).not.toContain("127.0.0.1");
    expect(page).not.toContain("TENAX CONNECTOR NOT DETECTED");
    expect(panel).toContain("CONNECT BITGET");
    expect(panel).toContain("SHOW MANUAL PAIRING CODE");
    expect(panel).toContain("COPY CODE");
    expect(panel).toContain("GENERATE NEW CODE");
    expect(panel).toContain("INSTALL TENAX CONNECTOR");
    expect(panel).toContain("TRY AGAIN");
    expect(panel).toContain("OPENING TENAX CONNECTOR");
    expect(panel).toContain("WAITING FOR CONNECTOR");
    expect(panel).toContain("launchProtocolImmediately: true");
    expect(panel).toContain("if (!canCreate || activeController.current) return;");
    expect(panel).toContain("mounted.current = true;");
    expect(panel).toContain("setState(\"FAILED\")");
    expect(panel).not.toContain("setState(\"IDLE\")");
    expect(finallyBlock).not.toContain("setState");
    expect(panel).toContain("INSTALLER UNAVAILABLE IN THIS DEVELOPMENT BUILD");
    expect(panel).toContain("/api/connected/installer");
    expect(panel).toContain("router.refresh");
    expect(panel).toContain("activeController.current?.abort()");
    expect(idleSection).not.toContain("pairingCode}");
    expect(handoff).toContain("credentials: \"omit\"");
    expect(handoff).toContain("TENAX_PROTOCOL_URI");
    expect(handoff).toContain("bridgeRequestTimeoutMs");
    expect(handoff).toContain("REQUEST_TIMEOUT");
    expect(handoff).toContain("createElement(\"iframe\")");
    expect(handoff).toContain("frame.remove()");
    expect(handoff).not.toContain('target = \"_blank\"');
    expect(handoff).not.toContain("window.location");
    expect(handoff).not.toMatch(/BITGET_API_KEY|BITGET_SECRET_KEY|passphrase|secretKey|api\.bitget/i);
    expect(panel).not.toMatch(/BITGET_API_KEY|BITGET_SECRET_KEY|passphrase|secretKey|api\.bitget/i);
    expect(panel).toContain("flex-col");
    expect(panel).toContain("sm:flex-row");
  });
});
