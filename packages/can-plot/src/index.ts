/**
 * @csselectronics/can-plot — generic uPlot-based time-series visualization primitives.
 *
 * Three audiences:
 * - **The webCAN host** uses these helpers internally (`HostChartsService`,
 *   `ChartView`, `TimeseriesWidget`).
 * - **webCAN view plugins** import from here directly; the host's
 *   `plugin-shared-globals.mjs` externalizes the package so all plugins
 *   share the host's instance.
 * - **Plain-TS apps** built from `web-app-sdk-cansub` import the imperative
 *   engine (`@csselectronics/can-plot/engine`) and the helpers in this barrel.
 *
 * The package is intentionally decoupled from the rest of the workspace
 * — its only runtime dependency is `uplot`. No imports from
 * `@csselectronics/websocket-client`, `@csselectronics/can-types`, `@csselectronics/can-pipeline`, or
 * `@csselectronics/can-decode`. Consumers pre-resolve labels and plug in their own
 * `FrameClock` implementation.
 */

export {
  AXIS_COLORS,
  COLOR_CYCLE,
  DOWNSAMPLE_POINTS,
  UPDATE_INTERVAL_MS,
  RENDER_DEBOUNCE_MS,
  EDGE_EXTEND_THRESHOLD_MS,
  EDGE_EXTEND_ENABLED,
  SIGNAL_VALUE_DECIMALS,
} from './constants';

export { relativize, paddedRange } from './relativize';

export {
  buildPlotOptions,
  type BuildPlotOptions,
  type PlotStateRef,
  type PlotSeriesSpec,
} from './buildPlotOptions';

export {
  CURSOR_TOOLTIP_HIDE_CLASS,
  UPLOT_MONO_STACK,
  getUplotAxisFont,
  createCursorTooltipPlugin,
  type CursorTooltipConfig,
} from './cursorTooltip';

export type { FrameClock } from './frameClock';

export {
  computeChartQueryWindow,
  type ChartQueryWindow,
  type ComputeChartQueryWindowOptions,
} from './queryWindow';
