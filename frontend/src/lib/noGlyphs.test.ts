import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * No OS glyphs (Sprint 6, B.6): arrows, carets, boxes, dingbats and emoji draw differently on every platform (iOS
 * even swaps them for colour emoji), so the app draws its own (`Glyph.svelte`). This scans the source for the
 * characters that must not appear. `·`, `—`, `≈`, `~`, `−`, `±`, `©`, `+` and `%` stay as typography.
 */
const BANNED = /[←-⇿⌀-⏿■-◿☀-➿⬀-⯿\u{1F000}-\u{1FFFF}️‹›×⋯]/u;

const SRC = join(__dirname, "..");

// lane E sweeps Feeds; remove after merge
const OTHER_LANES = ["screens/feeds/"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(svelte|ts)$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) ? [path] : [];
  });
}

const isComment = (line: string): boolean => /^(\/\/|\*|\/\*)/.test(line.trim());

/** `file:line: text` for every offending line */
export function offenders(files: string[], skip: string[] = []): string[] {
  return files
    .filter((file) => !skip.some((prefix) => relative(SRC, file).startsWith(prefix)))
    .flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, i) => (!isComment(line) && BANNED.test(line) ? [`${relative(SRC, file)}:${i + 1}: ${line.trim().slice(0, 80)}`] : [])),
    );
}

describe("no OS glyphs in the source", () => {
  it("the pattern catches what it should", () => {
    for (const char of ["›", "‹", "×", "⋯", "→", "▾", "▲", "▶", "⌕", "□", "↗", "😀"]) expect(BANNED.test(char)).toBe(true);
    for (const char of ["·", "—", "≈", "~", "−", "±", "©", "+", "%"]) expect(BANNED.test(char)).toBe(false);
  });

  it("every .svelte and .ts file outside the lanes still to sweep is clean", () => {
    expect(offenders(sourceFiles(SRC), OTHER_LANES)).toEqual([]);
  });

  // lanes C/E sweep these; remove after merge: this is the full check
  it.skip("every .svelte and .ts file is clean", () => {
    expect(offenders(sourceFiles(SRC))).toEqual([]);
  });
});
