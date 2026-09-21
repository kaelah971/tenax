// Tenax display-format helper tests (offline, pure functions).
import { describe, expect, it } from "vitest";

import {
  formatMultiplier,
  formatPrice,
  formatRate,
  formatSignedPnl,
  isPnlGain,
} from "../src/lib/tenax/format";

describe("formatPrice", () => {
  it("renders two decimals and preserves raw on garbage", () => {
    expect(formatPrice("224.1269466315363935")).toBe("224.13");
    expect(formatPrice("223.62")).toBe("223.62");
    expect(formatPrice(null)).toBe("—");
    expect(formatPrice("n/a")).toBe("n/a");
    expect(formatPrice("223.5", 1)).toBe("223.5");
  });
});

describe("formatRate", () => {
  it("preserves provider precision untouched", () => {
    expect(formatRate("0.000276")).toBe("0.000276");
    expect(formatRate(null)).toBe("—");
  });
});

describe("formatSignedPnl", () => {  it("signs gains and losses with adaptive precision", () => {
    expect(formatSignedPnl("-0.1056")).toBe("-$0.11");
    expect(formatSignedPnl("2.5")).toBe("+$2.50");
    expect(formatSignedPnl("0.0042")).toBe("+$0.0042");
    expect(formatSignedPnl("-0.0003")).toBe("-$0.0003");
    expect(formatSignedPnl("0")).toBe("+$0.00");
    expect(formatSignedPnl(null)).toBe("—");
  });

  it("classifies gain tone", () => {
    expect(isPnlGain("+$0.11")).toBe(true);
    expect(isPnlGain("-$0.11")).toBe(false);
    expect(isPnlGain("—")).toBe(false);
  });
});

describe("formatMultiplier", () => {
  it("trims rebase factors to readable precision", () => {
    expect(formatMultiplier(1.001701196801074)).toBe("1.001701");
    expect(formatMultiplier(1)).toBe("1");
    expect(formatMultiplier(null)).toBe("—");
  });
});
