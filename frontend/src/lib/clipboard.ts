/**
 * Copy text: the async clipboard API where the page may use it (secure context), else the old way, selecting
 * the text and running the copy command (iPad Safari over plain http). Returns whether either worked.
 * `selectAndCopy` is the old way, given by the caller because it needs a DOM element to select.
 */
export async function copyText(text: string, selectAndCopy: () => boolean, clipboard: Pick<Clipboard, "writeText"> | undefined = globalThis.navigator?.clipboard): Promise<boolean> {
  if (clipboard) {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      // permission denied or not focused: fall through to the old way
    }
  }
  return selectAndCopy();
}

/** Save `content` as a text file through a temporary link. */
export function downloadText(filename: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
