// @vitest-environment jsdom
import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import FrequencyCursor from "./FrequencyCursor.svelte";
import FrequencyRuler from "./FrequencyRuler.svelte";
import type { AxisClass } from "./freqRuler";

let app: ReturnType<typeof mount> | undefined;
afterEach(() => {
  if (app) unmount(app);
  app = undefined;
  document.body.innerHTML = "";
});

const BANK = [12, 16, 17, 22, 27, 47, 54, 59];
function render(props: Record<string, unknown>): SVGSVGElement {
  const target = document.createElement("div");
  document.body.append(target);
  app = mount(FrequencyRuler, { target, props: { width: 1114, cls: "desktop" as AxisClass, hears: BANK, labelled: BANK, extras: [], ...props } });
  flushSync();
  return target.querySelector("svg")!;
}

/** every drawn geometry attribute that state must not move: text origins and rotation, tails, rules, the base ticks */
function geometry(svg: SVGSVGElement): string[] {
  const geo = [...svg.querySelectorAll("text")].map((t) => `text ${t.getAttribute("x")} ${t.getAttribute("y")} ${t.getAttribute("transform")} ${t.textContent}`);
  for (const kind of ["tail", "rule", "ticks"]) for (const p of svg.querySelectorAll(`path[data-k=${kind}]`)) geo.push(`${kind} ${p.getAttribute("d")}`);
  return geo;
}

describe("R6 state invariance (rendered)", () => {
  const idle = geometry(render({}));
  it("keyed, selected and stale change colour and stroke, never a position", () => {
    unmount(app!);
    for (const state of [{ keyed: [54, 17] }, { selected: 22 }, { selected: 16, keyed: [16] }, { stale: true }, { stale: true, selected: 59, keyed: [47] }]) {
      expect(geometry(render(state))).toEqual(idle);
      unmount(app!);
      app = undefined;
    }
  });

  it("a keyed single is orange with a 4 px square on the axis line, and nothing else is", () => {
    const svg = render({ keyed: [54] });
    const squares = [...svg.querySelectorAll("rect")];
    expect(squares).toHaveLength(1);
    expect(squares[0].getAttribute("x")).toBe(String(Math.round(((54 - 7) * 1113) / 90) + 0.5 - 2));
    expect(squares[0].getAttribute("y")).toBe("64"); // H 68 - 4: its bottom edge on the axis line
    expect(svg.querySelectorAll("tspan.is-keyed")).toHaveLength(1);
  });

  it("a stale feed suppresses the keyed hue and square but keeps the selection", () => {
    const svg = render({ stale: true, keyed: [54], selected: 22 });
    expect(svg.querySelectorAll("rect")).toHaveLength(0);
    expect(svg.querySelectorAll("tspan.is-keyed")).toHaveLength(0);
    expect(svg.querySelector('path[data-k=underline]')?.getAttribute("stroke")).toBe("var(--state-select)");
  });

  it("a selected bracket member other than the first stands 2 px taller", () => {
    const plain = render({});
    const tall = plain.querySelectorAll("path.state").length;
    unmount(app!);
    const svg = render({ selected: 17 });
    expect(tall).toBe(0);
    const stems = [...svg.querySelectorAll("path.state")].map((p) => p.getAttribute("d"));
    expect(stems.some((d) => d!.includes("v-2"))).toBe(true);
  });
});

describe("column marks stop at the ruler (E-2 section 8)", () => {
  it("the hover cursor leaves the ruler empty except its own tick stub", () => {
    const target = document.createElement("div");
    document.body.append(target);
    app = mount(FrequencyCursor, { target, props: { x: 300, spectrum: [0, 0, 1114, 59], ruler: [0, 59, 1114, 68], waterfall: [0, 127, 1114, 176], channels: [] } });
    flushSync();
    const hairline = target.querySelector("path.d-measure")!.getAttribute("d")!;
    // the dashed line runs 0 to the spectrum's bottom (59), then from the ruler's bottom (127) down; nothing between
    const ys = [...hairline.matchAll(/[VM]\s*([\d.]+)/g)].map((m) => Number(m[1]));
    expect(ys.filter((y) => y > 59 && y < 127)).toEqual([]);
    const stub = [...target.querySelectorAll("path")].map((p) => p.getAttribute("d")).find((d) => d!.includes("V117"));
    expect(stub).toBeTruthy(); // 127 - 10: a labelled tick (8 px) and 2
  });
});
