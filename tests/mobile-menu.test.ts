// Mobile menu overlay regressions (source-level, offline).
//
// Locks the Telegram-iOS-WebView fix: the landing menu is a full-screen
// opaque layer (never a translucent dropdown in the hero stacking
// context), uses no backdrop-filter anywhere, locks/restores body scroll
// exactly, exits on every navigation form, and unmounts fully when
// closed so no stale overlay can strand the page.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

const menuSource = read("src/app/_landing/MobileMenu.tsx");
const landingSource = read("src/app/page.tsx");
const linksSource = read("src/app/_landing/nav-links.ts");

describe("Isolated overlay surface", () => {
  it("renders a fixed full-screen opaque layer above all page content", () => {
    expect(menuSource).toContain("fixed inset-0");
    expect(menuSource).toContain("z-[80]");
    expect(menuSource).toContain("bg-ivory");
    expect(menuSource).toContain("overflow-y-auto");
    expect(menuSource).toContain('role="dialog"');
    expect(menuSource).toContain('aria-modal="true"');
  });

  it("contains no translucency or backdrop-filter anywhere in the overlay tree", () => {
    expect(menuSource).not.toContain("backdrop-blur");
    expect(menuSource).not.toContain("backdrop-filter");
    expect(menuSource).not.toContain("bg-ivory/");
    expect(menuSource).not.toContain("bg-softwhite/");
    expect(menuSource).not.toContain("[0.0");
  });

  it("unmounts fully when closed instead of hiding in place", () => {
    expect(menuSource).toMatch(/\{open \? \(/);
  });

  it("keeps menu items on their own spaced layout", () => {
    expect(menuSource).toContain("flex-col gap-1");
    expect(menuSource).toContain("py-4");
  });
});

describe("Scroll lock and exit paths", () => {
  it("locks body scroll while open and restores the exact prior value", () => {
    expect(menuSource).toContain('document.body.style.overflow = "hidden"');
    expect(menuSource).toContain("document.body.style.overflow = previous");
  });

  it("exits on link tap, Escape, and back/forward navigation", () => {
    expect(menuSource).toContain("key={pathname}");
    expect(menuSource).toContain('event.key === "Escape"');
    // Every in-overlay navigation closes before routing.
    expect(menuSource.match(/onClick=\{\(\) => setOpen\(false\)\}/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("moves focus into the dialog and returns it on close", () => {
    expect(menuSource).toContain("closeRef.current?.focus()");
    expect(menuSource).toContain("trigger?.focus()");
  });
});

describe("Single navigation source of truth", () => {
  it("shares one links module between desktop nav and the overlay", () => {
    expect(linksSource).toContain("NAV_LINKS");
    expect(landingSource).toContain('from "./_landing/nav-links"');
    expect(menuSource).toContain('from "./nav-links"');
    for (const label of ["Product", "How It Works", "Authority", "Evidence"]) {
      expect(linksSource).toContain(label);
    }
  });

  it("landing header no longer renders the dropdown into the hero context", () => {
    expect(landingSource).toContain("<MobileMenu />");
    expect(landingSource).not.toContain("Main navigation (mobile)");
    expect(landingSource).not.toContain("tx-authority-dock absolute");
  });
});
