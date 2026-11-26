/**
 * Public constants used by @csselectronics/can-plot helpers and consumers.
 *
 * Names mirror the host-side `CHART_*` constants they were lifted from but
 * drop the `CHART_` prefix since this package is already chart-scoped.
 */

// CSS Electronics VI brand colors (must match --color-cssvi-* in the host's
// tailwind.css). Used as raw hex values for uPlot stroke colors and matching
// non-uPlot UI swatches.
const CSSVI_ORANGE     = '#ff9900';
const CSSVI_BLUE       = '#3d85c6';
const CSSVI_GREEN      = '#10cba9';
const CSSVI_RED        = '#ff6666';
const CSSVI_GRAY       = '#737272';
const CSSVI_PURPLE     = '#b71dcf';
const CSSVI_TEAL       = '#17a2b8';
const CSSVI_PINK       = '#e84393';
const CSSVI_LIME       = '#fcd349';
const CSSVI_SLATE_BLUE = '#6c7bbf';

/**
 * Color cycle for chart signal lines (10 visually distinct colors).
 * Plot consumers iterate `COLOR_CYCLE[i % COLOR_CYCLE.length]` per signal.
 */
export const COLOR_CYCLE: readonly string[] = [
  CSSVI_ORANGE, CSSVI_BLUE, CSSVI_GREEN, CSSVI_RED, CSSVI_GRAY,
  CSSVI_PURPLE, CSSVI_TEAL, CSSVI_PINK, CSSVI_LIME, CSSVI_SLATE_BLUE,
];

/**
 * Neutral axis label / tick / grid colors. uPlot draws to canvas so it cannot
 * inherit CSS `currentColor`; a mid-gray reads on both light and dark panels
 * without a theme-reactive chart re-init.
 */
export const AXIS_COLORS = {
  stroke: '#8b949e',
  grid: 'rgba(139, 148, 158, 0.18)',
  ticks: 'rgba(139, 148, 158, 0.25)',
} as const;

/**
 * Maximum data points fed to uPlot per signal chart.
 * Acts as a fixed budget for min-max envelope downsampling.
 */
export const DOWNSAMPLE_POINTS = 4000;

/**
 * Fixed interval (ms) between chart canvas redraws.
 * 20ms = 50 Hz — smooth enough for real-time CAN signal visualization.
 */
export const UPDATE_INTERVAL_MS = 20;

/**
 * Debounce delay (ms) before creating a uPlot instance after a signal change.
 * Prevents expensive uPlot create/destroy cycles when scrolling quickly
 * through many signals. The signal header renders immediately; only the
 * uPlot canvas creation is deferred.
 */
export const RENDER_DEBOUNCE_MS = 150;

/**
 * Maximum age (ms) of the last data point for it to be extended to the chart's
 * right edge. Eliminates visual jitter for signals ≥0.5 Hz while preserving
 * visible gaps for slower or stopped signals.
 */
export const EDGE_EXTEND_THRESHOLD_MS = 2000;

/**
 * Append an extension point at x = -delay so stepped lines reach the right
 * edge. Set false to disable.
 */
export const EDGE_EXTEND_ENABLED = true;

/** Decimal places for decoded signal values rendered in chart tooltips. */
export const SIGNAL_VALUE_DECIMALS = 4;
