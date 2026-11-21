import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** The one shell (Sprint 6, B): real pixel numbers in the tokens, and both shells drawing the same two components. */
const read = (path: string): string => readFileSync(join(__dirname, "..", path), "utf8");

describe("shell tokens", () => {
  const tokens = read("styles/tokens.css");

  it("is a 36 px bar and a 32 px footer", () => {
    expect(tokens).toMatch(/--header-h:\s*36px/);
    expect(tokens).toMatch(/--status-h:\s*32px/);
  });

  it("is 44 px each under 900", () => {
    expect(tokens).toMatch(/@media \(max-width: 899px\) \{[^}]*--header-h: 44px; --status-h: 44px;/);
  });
});

describe("the shells", () => {
  it("draw the bar and the footer and nothing else as chrome", () => {
    for (const shell of ["AppShell", "PageShell"]) {
      const source = read(`components/${shell}.svelte`);
      expect(source).toContain("<ShellBar");
      expect(source).toContain("<ShellFooter");
      expect(source).not.toContain("<header");
      expect(source).not.toContain("<footer");
    }
  });

  it("never scale the shell: only a staged route scales its content box", () => {
    const app = read("components/AppShell.svelte");
    expect(app).toContain('<Stage fit="box">');
    expect(read("../App.svelte")).toContain("<AppShell {route} staged>");
  });

  it("keep the title block short and the clock in the bar", () => {
    expect(read("components/TitleBlock.svelte")).not.toContain("{clock}");
  });

  it("keep no floating key-up markers", () => {
    const bar = read("components/ShellBar.svelte");
    expect(bar).not.toContain("KEYED");
    expect(read("components/ShellFooter.svelte")).toContain("<KeyupStrip");
  });
});
