<script lang="ts">
  /** The docs navigation: every page, and under the current one its sections (the desktop rail and the phone sheet). */
  import type { DocPage, Heading } from "./docs";

  interface Props {
    pages: DocPage[];
    /** slug of the page on screen, or "" for none (unknown page) */
    current: string;
    /** the current page's H2 headings */
    sections: Heading[];
    /** id of the section the reader is in */
    active: string | null;
    onlink: (event: MouseEvent) => void;
  }
  let { pages, current, sections, active, onlink }: Props = $props();
</script>

<ul class="dr">
  {#each pages as page (page.slug)}
    <li>
      <a class="dr__page" href={`/docs/${page.slug}`} onclick={onlink} aria-current={page.slug === current ? "page" : undefined}>{page.title}</a>
      {#if page.slug === current && sections.length}
        <ul class="dr__sections">
          {#each sections as section (section.id)}
            <li><a href={`/docs/${page.slug}#${section.id}`} onclick={onlink} aria-current={section.id === active ? "location" : undefined}>{section.text}</a></li>
          {/each}
        </ul>
      {/if}
    </li>
  {/each}
</ul>
