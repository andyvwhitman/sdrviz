/**
 * The Docs page's pure parts: page ordering, slugs, link rewriting and Markdown to HTML (Sprint 6 direction G.1).
 * No DOM in here, so it tests in node; the screen sanitises the HTML before it reaches the page.
 */

import { Marked, type Tokens } from "marked";

/** The order of the pages in the rail (the table in docs/api/README.md). Files not listed follow, A to Z. */
const PAGE_ORDER = ["README", "auth", "rest", "live-websocket", "nodes", "data-model"];

export interface DocPage {
  slug: string;
  title: string;
  source: string;
}

export interface Heading {
  id: string;
  text: string;
  level: 2 | 3;
}

export interface RenderedDoc {
  html: string;
  /** the H2 and H3 headings, in order, for the rail */
  headings: Heading[];
  hasMermaid: boolean;
}

/** "../../../../docs/api/live-websocket.md" is the page "live-websocket"; README is "readme". */
export const slugOfFile = (path: string): string => (path.split("/").pop() ?? path).replace(/\.md$/i, "").toLowerCase();

/** The title is the first H1. */
export const titleOf = (source: string, fallback: string): string => /^# +(.+?)\s*$/m.exec(source)?.[1].replace(/`/g, "") ?? fallback;

/** Build the page list from `{ path: markdown }`, in rail order. */
export function pagesFrom(files: Record<string, string>): DocPage[] {
  const rank = (slug: string): number => {
    const at = PAGE_ORDER.findIndex((name) => name.toLowerCase() === slug);
    return at === -1 ? PAGE_ORDER.length : at;
  };
  return Object.entries(files)
    .map(([path, source]) => ({ slug: slugOfFile(path), source }))
    .sort((a, b) => rank(a.slug) - rank(b.slug) || a.slug.localeCompare(b.slug))
    .map(({ slug, source }) => ({ slug, source, title: titleOf(source, slug) }));
}

/** The page slug a browser path names: "/docs" is the empty slug (the first page), "/docs/auth" is "auth". */
export function docsSlug(path: string): string {
  const rest = path.replace(/^\/docs\/?/, "").replace(/\/+$/, "");
  try {
    return decodeURIComponent(rest).toLowerCase();
  } catch {
    return rest.toLowerCase();
  }
}

export const isExternal = (href: string): boolean => /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(href);

/** `./03-ws.md#ops` or `rest.md#x` becomes `/docs/rest#x`. Anything else (anchors, external) is left alone. */
export function rewriteHref(href: string): string {
  if (isExternal(href) || href.startsWith("#") || href.startsWith("/")) return href;
  const match = /^(?:\.\/)?([^#?]*)\.md(#.*)?$/i.exec(href);
  return match ? `/docs/${slugOfFile(match[1])}${match[2] ?? ""}` : href;
}

/** A heading's id: lowercase words joined by hyphens, with -2, -3 ... on repeats. */
export function slugify(text: string, taken: Set<string>): string {
  const base =
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-") || "section";
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  taken.add(id);
  return id;
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const escapeHtml = (text: string): string => text.replace(/[&<>"]/g, (c) => ESCAPES[c]);

/** The visible text of rendered inline HTML. */
const plain = (html: string): string =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");

const LANGUAGE_TAG: Record<string, string> = { sh: "SHELL", bash: "SHELL", shell: "SHELL", py: "PYTHON", yml: "YAML" };

/** Render one page. `page` is its number in the rail, used for the H2 addresses ("2.3"). */
export function renderDoc(source: string, page: number): RenderedDoc {
  const headings: Heading[] = [];
  const taken = new Set<string>();
  let h2Count = 0;
  let nearest = "";
  let hasMermaid = false;

  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }): string {
        const inline = this.parser.parseInline(tokens);
        const text = plain(inline);
        const id = slugify(text, taken);
        if (depth === 2 || depth === 3) headings.push({ id, text, level: depth });
        if (depth === 2) {
          nearest = text;
          h2Count += 1;
          return `<h2 id="${id}"><span class="addr">${page}.${h2Count}</span>${inline}</h2>\n`;
        }
        return `<h${depth} id="${id}">${inline}</h${depth}>\n`;
      },
      link({ href, title, tokens }): string {
        const text = this.parser.parseInline(tokens);
        const to = rewriteHref(href);
        const tip = title ? ` title="${escapeHtml(title)}"` : "";
        if (isExternal(to)) {
          return `<a href="${escapeHtml(to)}"${tip} target="_blank" rel="noopener noreferrer">${text}<span class="ext-glyph" data-glyph="arrow-up-right"></span></a>`;
        }
        return `<a href="${escapeHtml(to)}"${tip}>${text}</a>`;
      },
      code({ text, lang }: Tokens.Code): string {
        const language = (lang ?? "").split(/\s/)[0].toLowerCase();
        if (language === "mermaid") {
          hasMermaid = true;
          return `<figure class="dg br" data-label="Diagram: ${escapeHtml(nearest || "API docs")}"><pre class="dg-src">${escapeHtml(text)}</pre></figure>\n`;
        }
        const tag = language ? (LANGUAGE_TAG[language] ?? language.toUpperCase()) : "";
        return `<div class="cb br"><span class="cb-lang">${escapeHtml(tag)}</span><button class="cb-copy" type="button" aria-label="Copy code">COPY</button><pre><code>${escapeHtml(text)}</code></pre></div>\n`;
      },
      table(token: Tokens.Table): string {
        const head = token.header.map((cell) => this.tablecell(cell)).join("");
        const rows = token.rows.map((row) => this.tablerow({ text: row.map((cell) => this.tablecell(cell)).join("") })).join("");
        return `<div class="tbl"><table><thead>${this.tablerow({ text: head })}</thead><tbody>${rows}</tbody></table></div>\n`;
      },
    },
  });

  return { html: marked.parse(source, { async: false }), headings, hasMermaid };
}
