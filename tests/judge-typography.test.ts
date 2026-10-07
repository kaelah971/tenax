// Tenax judge-typography regressions (source-level, no rendering).
//
// Locks the B7-adjacent typography contract: Barlow Condensed display +
// IBM Plex Mono interface voice loaded once via next/font/google,
// centralized through Tailwind tokens (no scattered font-family, no
// committed binaries, no outline/stroke effects), headings on the display
// token, financial numerals on the mono token. No network, no writes.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sourcesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourcesUnder(full));
    else if (/\.(tsx?|css)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("centralized font tokens", () => {
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  const theme = readFileSync("src/app/globals.css", "utf8");

  it("loads Barlow Condensed and IBM Plex Mono via next/font/google", () => {
    expect(layout).toContain('from "next/font/google"');
    expect(layout).toContain("Barlow_Condensed");
    expect(layout).toContain("IBM_Plex_Mono");
    expect(layout).toContain("--font-barlow-condensed");
    expect(layout).toContain("--font-ibm-plex-mono");
  });

  it("routes display and interface voice through the theme tokens", () => {
    expect(theme).toContain("--font-display: var(--font-barlow-condensed)");
    expect(theme).toContain("--font-syslabel: var(--font-ibm-plex-mono)");
  });

  it("scatters no raw font-family declarations through components", () => {
    for (const file of sourcesUnder("src/app")) {
      if (file.endsWith(".css")) continue;
      expect(readFileSync(file, "utf8")).not.toContain("font-family:");
    }
  });

  it("commits no font binaries and adds no outline/stroke effects", () => {
    const binaries: string[] = [];
    for (const dir of ["public", "src"]) {
      try {
        for (const file of sourcesUnder(dir)) {
          if (/\.(woff2?|ttf|otf|eot)$/.test(file)) binaries.push(file);
        }
      } catch {
        // Missing dir is fine.
      }
    }
    expect(binaries).toEqual([]);
    expect(theme).not.toContain("text-stroke");
    expect(theme).not.toContain("-webkit-text-stroke");
  });
});

describe("display headings", () => {
  const pages = [
    "src/app/app/page.tsx",
    "src/app/app/events/page.tsx",
    "src/app/app/exposure/nvidia/page.tsx",
    "src/app/app/protect/nvidia/page.tsx",
    "src/app/app/analysis/[id]/page.tsx",
    "src/app/app/paper-trading/page.tsx",
    "src/app/app/proof/page.tsx",
    "src/app/page.tsx",
  ];

  it("sets major headings on the condensed display token", () => {
    for (const file of pages) {
      const source = readFileSync(file, "utf8");
      expect(source).toContain("font-display");
    }
  });
});

describe("monospaced interface voice", () => {
  it("sets hero financial numerals on the mono token", () => {
    const capital = readFileSync("src/app/app/page.tsx", "utf8");
    expect(capital).toContain("font-syslabel text-[78px]");
    const receipts = readFileSync("src/app/app/receipts/[id]/page.tsx", "utf8");
    expect(receipts).toContain("font-syslabel text-[72px]");
  });

  it("keeps tabular figures for numeric scanning", () => {
    const theme = readFileSync("src/app/globals.css", "utf8");
    expect(theme).toContain("tabular-nums");
  });
});
