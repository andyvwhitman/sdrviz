<script lang="ts">
  /**
   * /docs/<page>: the API documentation in docs/api/*.md, bundled at build time (decision 79). A nav rail and a 760 px
   * article on a desktop; a CONTENTS row with a sheet on a phone. The Markdown is rendered by `docs.ts`, sanitised here.
   */
  import DOMPurify from "dompurify";
  import { mount, tick, unmount } from "svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import Glyph from "$lib/components/Glyph.svelte";
  import { copyText } from "$lib/clipboard";
  import { router } from "$lib/router.svelte";
  import { shell } from "$lib/stores/shell.svelte";
  import { renderDiagrams } from "./diagrams";
  import { docsSlug, pagesFrom, renderDoc } from "./docs";
  import Rail from "./Rail.svelte";
  import "./docs.css";

  const files = import.meta.glob<string>("../../../../docs/api/*.md", { query: "?raw", import: "default", eager: true });
  const pages = pagesFrom(files);

  /** a section counts as "current" once its heading is this far below the top of the window */
  const SPY_LINE = 44 + 24 + 8;

  const slug = $derived(docsSlug(router.path));
  const index = $derived(slug === "" ? 0 : pages.findIndex((p) => p.slug === slug));
  const page = $derived(pages[index]);
  const doc = $derived(page ? renderDoc(page.source, index + 1) : null);
  const html = $derived(doc ? DOMPurify.sanitize(doc.html, { ADD_ATTR: ["target"] }) : "");
  const sections = $derived(doc?.headings.filter((h) => h.level === 2) ?? []);
  const previous = $derived(index > 0 ? pages[index - 1] : null);
  const next = $derived(index >= 0 && index < pages.length - 1 ? pages[index + 1] : null);

  let article = $state<HTMLElement>();
  let active = $state<string | null>(null);
  let sheetOpen = $state(false);

  $effect(() => {
    shell.statusFallback = `API DOCS · ${(page?.title ?? "NO SUCH PAGE").toUpperCase()}`;
  });

  function scrollToHash(): void {
    const id = decodeURIComponent(router.hash.slice(1));
    const target = id ? article?.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`) : null;
    if (target) target.scrollIntoView({ block: "start" });
    else if (!id) window.scrollTo(0, 0);
  }

  // a new page or a new anchor: scroll once the article is on screen, and close the phone sheet
  $effect(() => {
    void html;
    void router.hash;
    sheetOpen = false;
    tick().then(scrollToHash);
  });

  // after the article is drawn: arrows on external links, then diagrams (which move the page, so scroll again)
  $effect(() => {
    void html;
    const root = article;
    if (!root) return;
    let live = true;
    const glyphs = [...root.querySelectorAll<HTMLElement>("[data-glyph]")].map((target) => mount(Glyph, { target, props: { name: "arrow-up-right", size: 12 } }));
    if (doc?.hasMermaid) renderDiagrams(root, () => live).then(() => live && scrollToHash());
    return () => {
      live = false;
      glyphs.forEach((glyph) => unmount(glyph));
    };
  });

  // scroll-spy: the last section whose heading has passed the line under the bar
  $effect(() => {
    void html;
    const root = article;
    if (!root) return;
    const headings = [...root.querySelectorAll<HTMLElement>("h2[id]")];
    const update = (): void => {
      active = headings.filter((h) => h.getBoundingClientRect().top <= SPY_LINE).at(-1)?.id ?? null;
    };
    const observer = new IntersectionObserver(update, { rootMargin: `-${SPY_LINE}px 0px 0px 0px`, threshold: [0, 1] });
    headings.forEach((h) => observer.observe(h));
    update();
    return () => observer.disconnect();
  });

  function selectText(node: Element): boolean {
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    return document.execCommand("copy");
  }

  function onArticleClick(event: MouseEvent): void {
    const target = event.target as Element;
    const copy = target.closest<HTMLButtonElement>(".cb-copy");
    if (copy) {
      const code = copy.parentElement?.querySelector("code");
      if (code) {
        copyText(code.textContent ?? "", () => selectText(code)).then((ok) => {
          if (!ok) return;
          copy.textContent = "COPIED";
          setTimeout(() => (copy.textContent = "COPY"), 1200);
        });
      }
      return;
    }
    const anchor = target.closest("a");
    if (anchor) follow(event, anchor);
  }

  /** Route an internal link without a page load; an anchor on this page just scrolls. */
  function follow(event: MouseEvent, anchor: HTMLAnchorElement): void {
    const href = anchor.getAttribute("href") ?? "";
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || anchor.target === "_blank") return;
    if (!href.startsWith("/") && !href.startsWith("#")) return;
    event.preventDefault();
    router.go(href.startsWith("#") ? router.path + href : href);
    tick().then(scrollToHash);
  }

  const onRailLink = (event: MouseEvent): void => follow(event, event.currentTarget as HTMLAnchorElement);
</script>

<div class="docs" data-page={page?.slug}>
  <!-- phone: the rail becomes a sticky CONTENTS row with a sheet -->
  <div class="docs__bar">
    <button class="docs__contents" type="button" aria-expanded={sheetOpen} aria-controls="docs-sheet" onclick={() => (sheetOpen = !sheetOpen)}>
      <span class="docs__contents-k">CONTENTS</span>
      <span class="docs__contents-v">{page?.title ?? "NO SUCH PAGE"}</span>
      <Glyph name={sheetOpen ? "chevron-up" : "chevron-down"} size={16} />
    </button>
    {#if sheetOpen}
      <nav id="docs-sheet" class="docs__sheet" aria-label="API docs">
        <Rail {pages} current={page?.slug ?? ""} {sections} {active} onlink={onRailLink} />
      </nav>
    {/if}
  </div>

  <nav class="docs__rail" aria-label="API docs">
    <div class="docs__rail-k">API DOCS</div>
    <Rail {pages} current={page?.slug ?? ""} {sections} {active} onlink={onRailLink} />
  </nav>

  {#if page}
    <!-- the delegated click handler routes links and copies code; keyboard users get the same from the links and buttons -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
    <article class="docs__article" bind:this={article} onclick={onArticleClick}>
      {@html html}
      <footer class="docs__foot" aria-label="More pages">
        {#if previous}
          <a href={`/docs/${previous.slug}`} onclick={onRailLink} rel="prev"><Glyph name="chevron-left" size={12} /><span>PREVIOUS</span><b>{previous.title}</b></a>
        {/if}
        {#if next}
          <a href={`/docs/${next.slug}`} onclick={onRailLink} rel="next"><span>NEXT</span><b>{next.title}</b><Glyph name="chevron-right" size={12} /></a>
        {/if}
      </footer>
    </article>
  {:else}
    <div class="docs__article">
      <EmptyState title="NO SUCH PAGE" detail="There is no documentation page with that name.">
        <a class="docs__first" href={`/docs/${pages[0].slug}`} onclick={onRailLink}>OPEN {pages[0].title.toUpperCase()}<Glyph name="chevron-right" size={12} /></a>
      </EmptyState>
    </div>
  {/if}
</div>
