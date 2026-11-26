/** Legend rows shown before the legend scrolls. */
export const LEGEND_MAX_ROWS = 2;

/**
 * How a chart splits its container between plot and legend. The legend gets up
 * to LEGEND_MAX_ROWS rows, never more than a third of the container and never
 * less than one row; a longer legend scrolls within that. The plot gets the rest.
 */
export function legendLayout(
  containerHeight: number,
  rowHeight: number,
  naturalLegendHeight: number,
): { legendMaxHeight: number; plotHeight: number } {
  const legendMaxHeight = Math.max(rowHeight, Math.min(containerHeight / 3, LEGEND_MAX_ROWS * rowHeight));
  // Rounded down, so plot plus legend never overflow the container.
  const plotHeight = Math.max(1, Math.floor(containerHeight - Math.min(naturalLegendHeight, legendMaxHeight)));
  return { legendMaxHeight, plotHeight };
}
