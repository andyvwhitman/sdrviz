"""Write design/index.html: the WLT-1 contact sheet.

Every frame/state of every mockup, grouped by screen, each with a thumbnail from
design/screens/index/<name>.png (shot by design/screens/cp/shoot.sh from
design/screens/cp/index-frames.txt). Re-run after re-shooting:

    python3 tools/build_contact_sheet.py
"""

from html import escape
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
FRAMES = REPO / "design" / "screens" / "cp" / "index-frames.txt"
OUT = REPO / "design" / "index.html"

GROUPS = [
    ("live-ops", "Live Ops", "Brief §9.1 · the operating screen. Four states at 1920 and 1440, inspector variants."),
    ("history", "History", "Brief §9.2 · stringline, 24 h scrubber, transcript table, clip player, deep links."),
    ("stats", "Stats", "Brief §9.3 · ridgeline, channel × hour, top talkers, detector board, decoder, feed uptime."),
    ("feeds", "Feeds & Banks", "Brief §9.4 · feed admin, telemetry, bank levers and membership."),
    ("map", "Map", "Brief §9.5 · geo and schematic modes, selections, the map ping, grayscale tests."),
    ("system", "System states", "Brief §8.4–§8.7 · login, loading, connecting, empty bank, reconnecting, no link. "
     "Empty bank, reconnecting and no link are drawn by the Live Ops builders (live-ops.js as a library), then dimmed."),
    ("components", "Component sheet", "Brief §12 item 5 · every tile state, the §3.5 combination frames, rows, instruments, controls, readouts."),
    ("motion", "Motion study", "Brief §7.3 / spec §6.3 · key-up choreography, frozen frames."),
    ("gray", "Grayscale tests", "Brief §10.4 · state must read by shape, not hue."),
    ("specimen", "Token specimen", "Spec §1–§3 · colour, type, stroke specimen."),
]


# Per-frame notes shown under the caption (director review r4).
LAYOUT_REF = "Layout reference only: build reuses Live Ops components"
NOTES = {
    "system-loading": LAYOUT_REF,
    "system-connecting": LAYOUT_REF,
    "system-empty-bank": "Live Ops front wall, log and CTC builders · empty-bank tile panel",
    "system-reconnecting": "Live Ops builders · W.link drop: void rows, AGE tiles, no sweep",
    "system-no-link": "Live Ops builders, then dimmed to 20 % under NO LINK",
    "system-gray-no-link": "Live Ops builders, then dimmed to 20 % under NO LINK",
    "map-select-feed-lnd": "Unacked: −45° state-fault-dim hatch · ACTIONS → ACK",
    "map-select-feed-lnd-acked": "ACK'D: red mark kept · hatch back to +45° line-faint",
}


def group_of(name: str) -> str:
    if "gray" in name:
        return "gray"
    for key, _, _ in GROUPS:
        if name.startswith(key):
            return key
    return "specimen"


def label_of(name: str, key: str) -> str:
    stem = name
    for prefix in (key + "-", "live-ops-", "map-", "history-", "stats-", "feeds-", "system-", "components-", "motion-keyup-"):
        if stem.startswith(prefix):
            stem = stem[len(prefix):]
            break
    return stem.replace("-", " ").upper() or name.upper()


def main() -> None:
    rows = [line.split("|") for line in FRAMES.read_text(encoding="utf-8").splitlines() if line and not line.startswith("#")]
    by_group: dict[str, list[tuple[str, str, str]]] = {k: [] for k, _, _ in GROUPS}
    for name, url, size in rows:
        by_group[group_of(name)].append((name, url, size))

    sections = []
    total = 0
    for key, title, note in GROUPS:
        items = by_group[key]
        if not items:
            continue
        cards = []
        for name, url, size in items:
            total += 1
            res = "1440 × 900" if size == "1440" else "1920 × 1080" if size == "1920" else size.replace("x", " × ")
            cards.append(
                f'<a class="card" href="mockups/{escape(url)}">'
                f'<span class="thumb"><img loading="lazy" src="screens/index/{escape(name)}.png" alt="{escape(title)} · {escape(label_of(name, key))}"></span>'
                f'<span class="cap"><b>{escape(label_of(name, key))}</b><i>{res}</i></span>'
                f'<code>{escape(url.split("&build=0")[0])}</code>'
                + (f'<em class="note">{escape(NOTES[name])}</em>' if name in NOTES else "")
                + "</a>"
            )
        sections.append(
            f'<section id="{key}"><header><h2>{escape(title)}</h2><span class="n">{len(items)}</span><p>{escape(note)}</p></header>'
            f'<div class="grid">{"".join(cards)}</div></section>'
        )

    nav = "".join(f'<a href="#{k}">{escape(t)}</a>' for k, t, _ in GROUPS if by_group[k])
    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WLT-1 Contact Sheet</title>
<meta name="description" content="sdrviz design package: every mockup frame and state with a thumbnail, grouped by screen, plus the spec, component sheet and motion study.">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500&family=Barlow+Semi+Condensed:wght@500;600&family=JetBrains+Mono:wght@400;500&family=Rajdhani:wght@600&display=swap">
<style>
  :root {{
    --bg-void: #04070A; --bg-panel: #081015; --grid: #12232B; --line-faint: #2C4A55; --line: #9CC9D6;
    --ink: #E4F1F5; --ink-2: #8FAFBA; --ink-3: #67868F; --state-select: #F5FBFD;
    --font-display: "Rajdhani", "Barlow Semi Condensed", sans-serif; --font-label: "Barlow Semi Condensed", "Barlow", sans-serif;
    --font-read: "Barlow", system-ui, sans-serif; --font-data: "JetBrains Mono", ui-monospace, monospace;
  }}
  * {{ box-sizing: border-box; }}
  html, body {{ margin: 0; background: var(--bg-void); color: var(--ink); font: 400 15px/1.45 var(--font-read); }}
  a {{ color: inherit; text-decoration: none; }}
  .top {{ position: sticky; top: 0; z-index: 2; background: var(--bg-void); border-bottom: 1px solid var(--grid);
    display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px 24px; padding: 14px 32px; }}
  .mark {{ font: 600 18px/1 var(--font-display); letter-spacing: .16em; }}
  .mark small {{ font: 500 12px/1 var(--font-label); letter-spacing: .1em; color: var(--ink-2); margin-left: 12px; }}
  .top nav {{ display: flex; flex-wrap: wrap; gap: 4px 18px; font: 500 12px/1 var(--font-label); letter-spacing: .1em; text-transform: uppercase; color: var(--ink-2); }}
  .top nav a:hover, .top nav a:focus-visible {{ color: var(--ink); }}
  main {{ padding: 24px 32px 64px; max-width: 2000px; }}
  .docs {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; margin-bottom: 40px; }}
  .doc {{ display: block; border: 1px solid var(--line-faint); padding: 14px 16px; background: var(--bg-panel); }}
  .doc:hover, .doc:focus-visible {{ border-color: var(--line); }}
  .doc b {{ display: block; font: 600 13px/1.2 var(--font-label); letter-spacing: .1em; text-transform: uppercase; }}
  .doc span {{ display: block; color: var(--ink-2); font-size: 13px; margin-top: 4px; }}
  .doc code {{ display: block; margin-top: 8px; font: 400 11px/1.3 var(--font-data); color: var(--ink-3); word-break: break-all; }}
  section {{ margin: 0 0 44px; }}
  section header {{ display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 14px; border-bottom: 1px solid var(--line-faint); padding-bottom: 8px; margin-bottom: 16px; }}
  h2 {{ margin: 0; font: 600 15px/1 var(--font-label); letter-spacing: .14em; text-transform: uppercase; }}
  .n {{ font: 400 12px/1 var(--font-data); color: var(--ink-2); }}
  header p {{ margin: 0; color: var(--ink-2); font-size: 13px; }}
  .grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px 16px; }}
  .card {{ display: block; }}
  .thumb {{ display: block; aspect-ratio: 16 / 9; overflow: hidden; border: 1px solid var(--grid); background: var(--bg-panel); }}
  .thumb img {{ display: block; width: 100%; height: 100%; object-fit: cover; object-position: top left; }}
  .card:hover .thumb, .card:focus-visible .thumb {{ border-color: var(--state-select); }}
  .cap {{ display: flex; justify-content: space-between; gap: 8px; margin-top: 8px; }}
  .cap b {{ font: 500 12px/1.3 var(--font-label); letter-spacing: .08em; }}
  .cap i {{ font: normal 400 11px/1.3 var(--font-data); color: var(--ink-3); white-space: nowrap; }}
  .card code {{ display: block; margin-top: 2px; font: 400 11px/1.3 var(--font-data); color: var(--ink-3); overflow-wrap: anywhere; }}
  .card .note {{ display: block; margin-top: 4px; font: normal 500 11px/1.3 var(--font-label); letter-spacing: .06em; text-transform: uppercase; color: var(--ink-2); }}
  footer {{ color: var(--ink-3); font: 400 12px/1.5 var(--font-data); border-top: 1px solid var(--grid); padding-top: 12px; }}
  @media (max-width: 640px) {{ .top, main {{ padding-left: 16px; padding-right: 16px; }} .grid {{ grid-template-columns: 1fr; }} }}
</style>
</head>
<body>
<div class="top"><span class="mark">SDRVIZ<small>WLT-1 · DESIGN PACKAGE · {total} FRAMES</small></span><nav>{nav}</nav></div>
<main>
<div class="docs">
  <a class="doc" href="spec.md"><b>Design standards</b><span>Tokens, grids, components, motion, accessibility, mockup conventions, hud.js API, handoff to front-end.</span><code>design/spec.md</code></a>
  <a class="doc" href="mockups/components.html"><b>Component sheet</b><span>All boards stacked; ?state=tiles|tiles-small|combos|combos-2|rows|rows-1440|instruments|controls|readouts.</span><code>design/mockups/components.html</code></a>
  <a class="doc" href="mockups/motion-keyup.html"><b>Motion study · key-up</b><span>Plays on a loop; ?t=&amp;tb= freezes a frame; &amp;motion=reduced; &amp;speed=0.25.</span><code>design/mockups/motion-keyup.html</code></a>
  <a class="doc" href="mockups/map.html?state=keyed&amp;motion=1"><b>Motion study · map ping</b><span>The M14 ping on key-up; &amp;t=ms freezes it; &amp;mode=schematic.</span><code>design/mockups/map.html?state=keyed&amp;motion=1</code></a>
  <a class="doc" href="mockups/_shared/specimen.html"><b>Token specimen</b><span>Colour, type and stroke specimen rendered from _shared/hud.css.</span><code>design/mockups/_shared/specimen.html</code></a>
</div>
{"".join(sections)}
<footer>Thumbnails: design/screens/index/ · shot with headless Chromium (design/screens/cp/shoot.sh) · regenerate this page with tools/build_contact_sheet.py. Every frame is a URL; &amp;build=0 skips the build-on.</footer>
</main>
</body>
</html>
"""
    OUT.write_text(html, encoding="utf-8")
    print(f"wrote {OUT.relative_to(REPO)} ({total} frames)")


if __name__ == "__main__":
    main()
