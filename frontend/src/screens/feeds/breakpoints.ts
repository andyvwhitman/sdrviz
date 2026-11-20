/** Layout breakpoints of the Feeds screen, in stage pixels (`stage.width`). */

/** Feed list (458) + inspector (602) + transit sources (760) + the gaps and margins need this much stage. */
export const THREE_COLUMNS_MIN_STAGE = 1920;

/** Three side-by-side columns on a wide stage; narrower, the transit sources stack under the inspector in one scrolling column. */
export function feedsColumns(stageWidth: number): 2 | 3 {
  return stageWidth >= THREE_COLUMNS_MIN_STAGE ? 3 : 2;
}
