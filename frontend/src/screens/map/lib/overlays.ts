/** When the map's corner overlays shrink or fold away, as pure functions of the stage and the docked panel. */

/** The train list starts folded on a stage narrower than this. */
const LIST_FOLD_STAGE_PX = 1400;
/** ...and, with a panel docked, on a stage narrower than this. */
const LIST_FOLD_DOCKED_STAGE_PX = 1700;
/** The hero shrinks to the count row when the stage minus the panel is narrower than this. */
const COUNT_ONLY_BELOW_PX = 900;

export interface OverlayView {
  stageWidth: number;
  /** 0 when no panel is docked */
  panelWidth: number;
  mode: "geo" | "schematic";
}

/** Whether the train list starts folded (the header chevron still opens it). */
export function listFoldedByDefault({ stageWidth, panelWidth, mode }: OverlayView): boolean {
  return stageWidth < LIST_FOLD_STAGE_PX || (panelWidth > 0 && stageWidth < LIST_FOLD_DOCKED_STAGE_PX) || mode === "schematic";
}

/** Whether the hero is only the train count, with no secondary line, and the zoom readout goes. */
export function countOnly({ stageWidth, panelWidth }: OverlayView): boolean {
  return stageWidth - panelWidth < COUNT_ONLY_BELOW_PX;
}
