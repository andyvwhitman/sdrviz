import { describe, expect, it } from "vitest";
import { docsSlug, pagesFrom, renderDoc, rewriteHref, slugOfFile, slugify } from "./docs";

describe("rewriteHref", () => {
  it("turns relative doc links into /docs routes, keeping the anchor", () => {
    expect(rewriteHref("auth.md")).toBe("/docs/auth");
    expect(rewriteHref("./03-websocket.md#ops")).toBe("/docs/03-websocket#ops");
    expect(rewriteHref("live-websocket.md#clock-sync")).toBe("/docs/live-websocket#clock-sync");
    expect(rewriteHref("README.md")).toBe("/docs/readme");
  });

  it("leaves anchors, absolute paths and external links alone", () => {
    for (const href of ["#listen", "/api/frequencies", "https://example.com/a.md", "mailto:a@b.c", "//cdn.example/x.md", "image.png"]) {
      expect(rewriteHref(href)).toBe(href);
    }
  });
});

describe("docsSlug", () => {
  it("reads the page from the path; /docs is the first page (empty slug)", () => {
    expect(docsSlug("/docs")).toBe("");
    expect(docsSlug("/docs/")).toBe("");
    expect(docsSlug("/docs/live-websocket")).toBe("live-websocket");
    expect(docsSlug("/docs/Data-Model/")).toBe("data-model");
    expect(docsSlug("/docs/%E0%A4%A")).toBe("%e0%a4%a");
  });
});

describe("pages", () => {
  it("orders README first, then the rail order, then the rest A to Z; the title is the H1", () => {
    const pages = pagesFrom({
      "../docs/api/zeta.md": "# Zeta page",
      "../docs/api/nodes.md": "# Nodes",
      "../docs/api/README.md": "# sdrviz API\n",
      "../docs/api/auth.md": "text with no title",
    });
    expect(pages.map((p) => p.slug)).toEqual(["readme", "auth", "nodes", "zeta"]);
    expect(pages.map((p) => p.title)).toEqual(["sdrviz API", "auth", "Nodes", "Zeta page"]);
    expect(slugOfFile("a/b/Live-WebSocket.md")).toBe("live-websocket");
  });
});

describe("slugify", () => {
  it("makes unique ids", () => {
    const taken = new Set<string>();
    expect([slugify("Clock sync", taken), slugify("Clock sync", taken), slugify("`/ws/live` & more!", taken), slugify("???", taken)]).toEqual([
      "clock-sync",
      "clock-sync-2",
      "wslive-more",
      "section",
    ]);
  });
});

describe("renderDoc", () => {
  const source = [
    "# Title",
    "",
    "## First part",
    "See [rest](rest.md#recordings), [here](#first-part) and [out](https://example.com).",
    "",
    "### Detail",
    "",
    "## First part",
    "",
    "| a | b |",
    "|---|---|",
    "| 1 | 2 |",
    "",
    "```json",
    '{"a": "<b>"}',
    "```",
    "",
    "```mermaid",
    "flowchart LR\n A --> B",
    "```",
  ].join("\n");
  const doc = renderDoc(source, 2);

  it("gives headings unique ids and an address, and lists H2 and H3", () => {
    expect(doc.headings).toEqual([
      { id: "first-part", text: "First part", level: 2 },
      { id: "detail", text: "Detail", level: 3 },
      { id: "first-part-2", text: "First part", level: 2 },
    ]);
    expect(doc.html).toContain('<h2 id="first-part"><span class="addr">2.1</span>First part</h2>');
    expect(doc.html).toContain('<span class="addr">2.2</span>');
  });

  it("rewrites doc links, keeps anchors, and opens external links in a new tab", () => {
    expect(doc.html).toContain('href="/docs/rest#recordings"');
    expect(doc.html).toContain('href="#first-part"');
    expect(doc.html).toContain('href="https://example.com" target="_blank" rel="noopener noreferrer"');
  });

  it("wraps tables, tags and escapes code, and sets mermaid blocks aside", () => {
    expect(doc.html).toContain('<div class="tbl"><table>');
    expect(doc.html).toContain('<span class="cb-lang">JSON</span>');
    expect(doc.html).toContain("&lt;b&gt;");
    expect(doc.hasMermaid).toBe(true);
    expect(doc.html).toContain('<figure class="dg br" data-label="Diagram: First part"><pre class="dg-src">flowchart LR');
    expect(renderDoc("plain", 1).hasMermaid).toBe(false);
  });
});
