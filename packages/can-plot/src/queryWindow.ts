import type { FrameClock } from './frameClock';

/**
 * Resolved chart-window bounds, in absolute epoch seconds.
 * Caller feeds these into a signal-extraction primitive (e.g.
 * `@csselectronics/can-decode`'s `querySignals`) to fetch data for the visible window.
 */
export interface ChartQueryWindow {
  /** Inclusive lower bound (epoch seconds). */
  qStart: number;
  /** Inclusive upper bound (epoch seconds). */
  qEnd: number;
  /**
   * Right-edge reference epoch, used by the rendering layer to relativize
   * timestamps. Equal to `clock.computeFrameEnd()` for the live window;
   * unaffected by zoom-bounds or the history tail-padding branch.
   */
  frameEnd: number;
}

export interface ComputeChartQueryWindowOptions {
  /**
   * Optional explicit zoom bounds (epoch seconds). When provided, overrides
   * the default live/history window computation.
   */
  zoomBounds?: { min: number; max: number };
  /**
   * Override the default padding (seconds) added on either side of the
   * computed window. The default is `2 + Math.ceil(clock.getDelay())`,
   * chosen so stepped-path lines extend to the plot edges even for
   * low-frequency signals.
   */
  paddingSeconds?: number;
}

/**
 * Compute the absolute-epoch query bounds for a chart's visible window.
 *
 * Encapsulates the chart-specific math previously buried in
 * `ChartService.queryVisibleSignalsAbsolute`:
 *
 * - **Padding** (`2 + ceil(delay)` by default) lets stepped-path lines reach
 *   the plot edges for slow signals.
 * - **Zoom-bounds branch** widens the query to the user-selected range when
 *   provided.
 * - **History tail-padding branch** extends `qEnd` past `frameEnd` when the
 *   user has scrubbed back (`clock.timeOffset.value > 0`) so the rendering
 *   layer can extrapolate the right edge cleanly.
 *
 * Pure function — no storage, no decode dependency. Callers feed the
 * resulting bounds into whatever extraction primitive they own.
 *
 * @returns The window, or `null` when `clock.computeFrameEnd()` returns null
 *   (e.g. no frames received yet).
 */
export function computeChartQueryWindow(
  clock: FrameClock,
  opts: ComputeChartQueryWindowOptions = {},
): ChartQueryWindow | null {
  const frameEnd = clock.computeFrameEnd();
  if (frameEnd === null) return null;

  const padding = opts.paddingSeconds ?? (2 + Math.ceil(clock.getDelay()));
  const window = clock.timeWindowSeconds.value;
  const frameStart = frameEnd - window;
  const { zoomBounds } = opts;

  let qStart: number;
  let qEnd: number;
  if (zoomBounds) {
    qStart = zoomBounds.min - padding;
    qEnd = zoomBounds.max + padding;
  } else {
    qStart = frameStart - padding;
    // History-mode tail extension: when the user has scrubbed back the
    // right edge of the visible window has moved past `frameEnd` — pad so
    // stepped-path lines can render cleanly past the right boundary.
    qEnd = clock.timeOffset.value > 0 ? frameEnd + padding : frameEnd;
  }

  return { qStart, qEnd, frameEnd };
}
