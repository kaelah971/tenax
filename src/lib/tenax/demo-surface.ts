// Tenax Phase 4A.2 — live Demo market surface composition (server-only).
//
// Combines the public NVDAUSDT ticker snapshot with the authenticated
// Demo position view into one sanitized model shared by the exposure page
// (server render) and the read-only polling route. Credentials never enter
// the returned model: it contains only whitelisted display strings safe
// to serialize to the browser. Provider failures isolate per leg — a
// missing ticker or position never breaks the other.

import type { DemoAuthCredentials, FetchImpl } from "../bitget/demo-auth.ts";
import {
  fetchDemoPositionView,
  UNAVAILABLE_DEMO_POSITION,
  type DemoPositionView,
} from "../bitget/demo-position.ts";
import {
  fetchNvdaFuturesTicker,
  type FuturesTicker,
} from "../bitget/market-series.ts";
import type { PublicHttpClient } from "../bitget/reality.ts";
import { readDemoCredentials } from "./service.ts";

export interface DemoSurfaceDeps {
  /** Explicit credentials (tests); defaults to server env Demo secrets. */
  readonly credentials?: DemoAuthCredentials;
  readonly baseUrl?: string;
  readonly tickerClient?: PublicHttpClient;
  readonly positionFetchImpl?: FetchImpl;
}

export interface DemoSurfaceView {
  readonly ticker: FuturesTicker | null;
  readonly position: DemoPositionView;
  readonly fetchedAt: string;
}

/**
 * Resolve the live surface. Server-only: reads Demo secrets from the
 * environment when not injected. Missing secrets yield an UNAVAILABLE
 * position (never an error) while the public ticker may still render.
 */
export async function getDemoSurfaceView(deps: DemoSurfaceDeps = {}): Promise<DemoSurfaceView> {
  const credentials = deps.credentials ?? readDemoCredentials(process.env);
  const baseUrl = (deps.baseUrl ?? process.env.BITGET_API_BASE_URL ?? "").trim() || "https://api.bitget.com";
  const [wrappedTicker, position] = await Promise.all([
    fetchNvdaFuturesTicker(deps.tickerClient).catch(() => null),
    credentials
      ? fetchDemoPositionView({
          credentials,
          baseUrl,
          fetchImpl: deps.positionFetchImpl,
        }).catch(() => ({ ...UNAVAILABLE_DEMO_POSITION }))
      : Promise.resolve({ ...UNAVAILABLE_DEMO_POSITION }),
  ]);
  return { ticker: wrappedTicker?.ticker ?? null, position, fetchedAt: new Date().toISOString() };
}

/**
 * Explicit whitelist serializer for the polling route and tests.
 * Only these keys may reach the browser — a future field addition to
 * the view models cannot leak through.
 */
export function toSurfaceResponse(view: DemoSurfaceView): {
  readonly ticker: {
    readonly symbol: string;
    readonly lastPrice: string | null;
    readonly markPrice: string | null;
    readonly indexPrice: string | null;
    readonly bidPrice: string | null;
    readonly askPrice: string | null;
    readonly fundingRate: string | null;
    readonly change24h: string | null;
    readonly high24h: string | null;
    readonly low24h: string | null;
    readonly openInterest: string | null;
    readonly updatedAt: string | null;
  } | null;
  readonly position: {
    readonly state: DemoPositionView["state"];
    readonly symbol: string | null;
    readonly side: string | null;
    readonly size: string | null;
    readonly avgEntryPrice: string | null;
    readonly markPrice: string | null;
    readonly leverage: string | null;
    readonly marginMode: string | null;
    readonly upnl: string | null;
    readonly upnlRoi: string | null;
    readonly liqPrice: string | null;
    readonly updatedAt: string | null;
  };
  readonly fetchedAt: string;
} {
  return {
    ticker: view.ticker
      ? {
          symbol: view.ticker.symbol,
          lastPrice: view.ticker.lastPrice,
          markPrice: view.ticker.markPrice,
          indexPrice: view.ticker.indexPrice,
          bidPrice: view.ticker.bidPrice,
          askPrice: view.ticker.askPrice,
          fundingRate: view.ticker.fundingRate,
          change24h: view.ticker.change24h,
          high24h: view.ticker.high24h,
          low24h: view.ticker.low24h,
          openInterest: view.ticker.openInterest,
          updatedAt: view.ticker.updatedAt,
        }
      : null,
    position: {
      state: view.position.state,
      symbol: view.position.symbol,
      side: view.position.side,
      size: view.position.size,
      avgEntryPrice: view.position.avgEntryPrice,
      markPrice: view.position.markPrice,
      leverage: view.position.leverage,
      marginMode: view.position.marginMode,
      upnl: view.position.upnl,
      upnlRoi: view.position.upnlRoi,
      liqPrice: view.position.liqPrice,
      updatedAt: view.position.updatedAt,
    },
    fetchedAt: view.fetchedAt,
  };
}
