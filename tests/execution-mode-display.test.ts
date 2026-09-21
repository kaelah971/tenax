// Tenax Phase 2D-B — execution-mode display truthfulness (offline).
//
// The /app shell badge and Capital provenance strip must reflect the
// SERVER-RESOLVED execution mode, never a hardcoded literal and never a
// browser-side decision. Execution logic, gates, and secrets are untouched:
// these tests pin the display contract only.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { resolveExecutionMode } from "../src/lib/tenax/execution";
import { provenanceDisplay } from "../src/app/app/_components/ui";

const layoutSource = readFileSync(
  new URL("../src/app/app/layout.tsx", import.meta.url),
  "utf8",
);
const capitalSource = readFileSync(
  new URL("../src/app/app/page.tsx", import.meta.url),
  "utf8",
);

describe("server-resolved mode mapping", () => {
  it("falls back to DRY_RUN when unset or unknown", () => {
    expect(resolveExecutionMode({})).toBe("DRY_RUN");
    expect(resolveExecutionMode({ TENAX_EXECUTION_MODE: "" })).toBe("DRY_RUN");
    expect(resolveExecutionMode({ TENAX_EXECUTION_MODE: "DRY_RUN" })).toBe("DRY_RUN");
  });

  it("resolves BITGET_DEMO only on the explicit value", () => {
    expect(resolveExecutionMode({ TENAX_EXECUTION_MODE: "BITGET_DEMO" })).toBe("BITGET_DEMO");
  });

  it("keeps LIVE impossible: live-like values resolve to DRY_RUN", () => {
    for (const mode of ["LIVE", "live", "BITGET_LIVE", "REAL", "PROD"]) {
      expect(resolveExecutionMode({ TENAX_EXECUTION_MODE: mode })).toBe("DRY_RUN");
    }
  });
});

describe("provenance display wording", () => {
  it("renders DRY_RUN with a space and passes BITGET_DEMO through canonically", () => {
    expect(provenanceDisplay("DRY_RUN EXECUTION")).toBe("DRY RUN EXECUTION");
    expect(provenanceDisplay("BITGET_DEMO EXECUTION")).toBe("BITGET_DEMO EXECUTION");
  });
});

describe("app shell badge derives from the server resolver", () => {
  it("resolves mode server-side instead of hardcoding it", () => {
    expect(layoutSource).toContain("resolveExecutionMode(process.env)");
    expect(layoutSource).not.toContain("□ DRY_RUN");
    expect(layoutSource).not.toContain("□ BITGET_DEMO");
  });

  it("never decides mode in the browser and never touches secrets or public env", () => {
    expect(layoutSource).not.toContain('"use client"');
    expect(layoutSource).not.toContain("NEXT_PUBLIC");
    for (const secret of [
      "BITGET_SECRET_KEY",
      "BITGET_PASSPHRASE",
      "BITGET_API_KEY",
      "ACCESS-SIGN",
      "ACCESS-KEY",
    ]) {
      expect(layoutSource).not.toContain(secret);
    }
  });
});

describe("Capital provenance derives from the server resolver", () => {
  it("passes the resolved mode into the strip instead of hardcoding it", () => {
    expect(capitalSource).toContain("resolveExecutionMode(process.env)");
    expect(capitalSource).toContain("${executionMode} EXECUTION");
    expect(capitalSource).not.toContain('"DRY_RUN EXECUTION"');
    expect(capitalSource).not.toContain('"BITGET_DEMO EXECUTION"');
  });

  it("never decides mode in the browser and never touches secrets or public env", () => {
    expect(capitalSource).not.toContain('"use client"');
    expect(capitalSource).not.toContain("NEXT_PUBLIC");
    for (const secret of [
      "BITGET_SECRET_KEY",
      "BITGET_PASSPHRASE",
      "BITGET_API_KEY",
      "ACCESS-SIGN",
      "ACCESS-KEY",
    ]) {
      expect(capitalSource).not.toContain(secret);
    }
  });
});
