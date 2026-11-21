/**
 * Mermaid diagrams for the Docs page (direction G.4). Mermaid is imported here and only when a page has a diagram,
 * so no other route downloads it. Colours are the HUD neutrals: no cyan, orange or red in a diagram.
 */

const THEME = {
  background: "#04070A",
  primaryColor: "#081015",
  primaryBorderColor: "#9CC9D6",
  primaryTextColor: "#E4F1F5",
  secondaryColor: "#0C171D",
  tertiaryColor: "#0C171D",
  lineColor: "#8FAFBA",
  textColor: "#E4F1F5",
  noteBkgColor: "#0C171D",
  noteBorderColor: "#2C4A55",
  noteTextColor: "#E4F1F5",
  actorBkg: "#081015",
  actorBorder: "#9CC9D6",
  signalColor: "#8FAFBA",
  signalTextColor: "#E4F1F5",
  labelBoxBkgColor: "#0C171D",
  // entity-relationship tables would otherwise derive pale blue rows
  rowOdd: "#081015",
  rowEven: "#0C171D",
  attributeBackgroundColorOdd: "#081015",
  attributeBackgroundColorEven: "#0C171D",
  fontFamily: '"Barlow Semi Condensed"',
  fontSize: "14px",
};

type Mermaid = (typeof import("mermaid"))["default"];
let loading: Promise<Mermaid> | undefined;

function loadMermaid(): Promise<Mermaid> {
  loading ??= import("mermaid").then(({ default: mermaid }) => {
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "base", themeVariables: THEME });
    return mermaid;
  });
  return loading;
}

let counter = 0;

/** Replace each `figure.dg` source block under `root` with its drawn diagram; a diagram that fails keeps its source. */
export async function renderDiagrams(root: HTMLElement, isCurrent: () => boolean): Promise<void> {
  const figures = [...root.querySelectorAll<HTMLElement>("figure.dg")];
  if (!figures.length) return;
  const mermaid = await loadMermaid();
  for (const figure of figures) {
    const source = figure.querySelector(".dg-src")?.textContent ?? "";
    try {
      const { svg } = await mermaid.render(`dg-${counter++}`, source);
      if (!isCurrent()) return;
      const holder = document.createElement("div");
      holder.className = "dg-svg";
      holder.innerHTML = svg;
      const drawn = holder.querySelector("svg");
      drawn?.setAttribute("role", "img");
      drawn?.setAttribute("aria-label", figure.dataset.label ?? "Diagram");
      figure.replaceChildren(holder);
    } catch (error) {
      console.warn("diagram did not render", error);
      if (!isCurrent()) return;
      figure.classList.add("is-failed");
      const note = document.createElement("div");
      note.className = "dg-fail";
      note.textContent = "DIAGRAM DID NOT RENDER";
      figure.prepend(note);
      // mermaid leaves its error SVG in the body on a parse failure
      document.getElementById(`ddg-${counter - 1}`)?.remove();
    }
  }
}
