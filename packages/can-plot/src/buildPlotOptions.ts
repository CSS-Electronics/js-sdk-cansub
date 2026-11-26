import uPlot from 'uplot';
import { AXIS_COLORS, COLOR_CYCLE, SIGNAL_VALUE_DECIMALS } from './constants';
import {
  CURSOR_TOOLTIP_HIDE_CLASS,
  createCursorTooltipPlugin,
  getUplotAxisFont,
} from './cursorTooltip';

/**
 * Mutable time-state ref that uPlot axis/cursor formatters close over.
 *
 * Formatters read fields from this object on every redraw, so the engine
 * can update `frameEnd`/`timeOffset`/`isHistoryMode` between ticks without
 * triggering a uPlot rebuild.
 */
export interface PlotStateRef {
  frameEnd: number;
  timeOffset: number;
  isHistoryMode: boolean;
}

/** One series entry the caller wants drawn as a stepped-path line. */
export interface PlotSeriesSpec {
  /** Series label shown in the bottom legend and cursor tooltip. */
  label: string;
  /** Stroke color; falls back to `COLOR_CYCLE[i]` if omitted. */
  color?: string;
  /**
   * Optional per-series value formatter for the cursor tooltip (and legend).
   * When omitted, the chart-wide numeric formatter (`toFixed(valueDecimals)`)
   * is used. The caller bakes any signal-specific logic into this closure, so
   * `@csselectronics/can-plot` stays decode-agnostic — number in, string out. Pair with
   * `formatUnit` to keep the value purely numeric (right-aligned) and the unit
   * in its own column.
   */
  formatValue?: (raw: number | null | undefined) => string;
  /**
   * Optional per-series unit / value-table-description formatter. When any
   * series supplies it, the cursor tooltip renders a separate left-aligned unit
   * column next to the right-aligned value column, so values stay
   * decimal-aligned regardless of unit length. Decode-agnostic: number in,
   * string out (the caller caps the length).
   */
  formatUnit?: (raw: number | null | undefined) => string;
}

/** Options consumed by {@link buildPlotOptions}. */
export interface BuildPlotOptions {
  width: number;
  height: number;
  /** Mutable time-state ref formatters close over. */
  stateRef: PlotStateRef;
  /** One entry per signal (the synthetic Time series is added internally). */
  series: PlotSeriesSpec[];
  /**
   * X-range callback. Called by uPlot on every redraw — caller closes over
   * its own zoom/adaptive-delay/time-window state.
   */
  getXRange: () => uPlot.Range.MinMax;
  /**
   * Optional history-mode tick label formatter (axis). Receives the absolute
   * epoch (`stateRef.frameEnd + relativeOffset`). When omitted, axis labels
   * render relative seconds in both modes.
   */
  formatHistoryEpoch?: (epoch: number) => string;
  /**
   * Optional history-mode cursor-time formatter. Receives the absolute epoch.
   * When omitted, the cursor renders relative seconds in history mode too.
   */
  formatHistoryEpochCursor?: (epoch: number) => string;
  /**
   * Optional zoom-selection callback. When provided, click-drag selection on
   * the canvas calls this with `(min, max)` raw plot coordinates. Caller
   * decides whether to commit the zoom range and how to relay it to
   * `getXRange`.
   */
  onZoomSelect?: (min: number, max: number) => void;
  /** Show uPlot's bottom labels-only legend. Default: true. */
  showLegend?: boolean;
  /** Show the time axis labels below the plot. Off keeps the vertical grid lines but takes no height. Default: true. */
  showXAxis?: boolean;
  /** Allow click-drag cursor (Chart view). Default: true. */
  cursorDrag?: boolean;
  /**
   * Y-axis scale. Default: `{ auto: true }`. A fixed scale may leave one side null, which
   * then follows the data; a range that does not come out ascending auto-scales.
   */
  yScale?: { auto: true } | { auto: false; min: number | null; max: number | null };
  /** Decimal places used for cursor value formatting. Default: SIGNAL_VALUE_DECIMALS. */
  valueDecimals?: number;
  /** Shade the area between each series and zero with its color at {@link FILL_ALPHA}. Default: false. */
  fill?: boolean;
  /** Y axis width in px, tick labels included. Default: 60. */
  yAxisSize?: number;
  /**
   * Plots built with the same key share the vertical crosshair by X value (cursor movement
   * only; drag-select stays per plot). The horizontal line is then hidden, as a follower's
   * height means nothing on its own Y scale.
   */
  cursorSyncKey?: string;
  /** With `cursorSyncKey`, also show the tooltip on plots that follow another plot's cursor. Default: false. */
  syncedTooltip?: boolean;
}

/**
 * The uPlot Y scale for `yScale`: pinned when both sides are set, auto when neither is,
 * and with one side set, uPlot's own padded auto range with that side replaced.
 */
export function resolveYScale(yScale: NonNullable<BuildPlotOptions['yScale']>): uPlot.Scale {
  if (yScale.auto) return { auto: true };
  const { min, max } = yScale;
  if (min !== null && max !== null) {
    return min < max ? { auto: false, range: [min, max] } : { auto: true };
  }
  if (min === null && max === null) return { auto: true };
  return {
    auto: true,
    range: (_u, dataMin, dataMax): uPlot.Range.MinMax => {
      const auto = dataMin == null || dataMax == null
        ? [0, 1] as uPlot.Range.MinMax
        : uPlot.rangeNum(dataMin, dataMax, 0.1, true);
      const lo = min ?? auto[0]!;
      const hi = max ?? auto[1]!;
      return lo < hi ? [lo, hi] : auto;
    },
  };
}

/**
 * Right padding uPlot gives a plot with a time axis (half its default Y axis size), kept when the
 * axis is hidden so stacked plots line up.
 */
const X_AXIS_RIGHT_PAD_PX = 25;

/** X tick spacing in px; wider for history labels with fractional seconds. */
const X_TICK_SPACE_PX = 60;
const X_TICK_SPACE_FRACTION_PX = 90;

/**
 * A `HH:MM:SS.ffffff` time cut to the decimals that tell ticks `step` seconds apart
 * (at least 1, at most 3), so sub-second ticks do not all read the same second.
 */
export function trimFraction(time: string, step: number): string {
  const dot = time.indexOf('.');
  if (dot < 0) return time;
  const digits = Math.min(3, Math.max(1, Math.ceil(-Math.log10(step) - 1e-9)));
  return time.slice(0, dot + 1 + digits);
}

/** Opacity of a series fill. */
export const FILL_ALPHA = 0.2;

/**
 * `color` at `alpha` opacity as #rrggbbaa, or null for a color the canvas cannot make opaque
 * hex. The canvas normalizes any opaque CSS color to #rrggbb, so hex, named and rgb() colors work.
 */
export function translucentColor(ctx: CanvasRenderingContext2D, color: string, alpha: number): string | null {
  // Restored right away: uPlot caches the fillStyle it last set.
  ctx.save();
  ctx.fillStyle = color;
  const hex = String(ctx.fillStyle);
  ctx.restore();
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return null;
  return hex + Math.round(alpha * 255).toString(16).padStart(2, '0');
}

/**
 * Build a uPlot.Options object for one or more time-series signals.
 *
 * The axis/cursor formatters close over `opts.stateRef`, so the consumer can
 * mutate that object between redraws to flip live ↔ history rendering or
 * shift `frameEnd` without rebuilding the chart.
 *
 * The time series (uPlot's mandatory `series[0]`) is synthesized internally
 * with the cursor-tooltip-hidden class so it renders only in the tooltip
 * header, not the bottom legend.
 *
 * Each data series renders as a stepped-path line (`uPlot.paths.stepped`).
 * The cursor-tooltip plugin is appended automatically.
 */
export function buildPlotOptions(opts: BuildPlotOptions): uPlot.Options {
  const {
    width, height, stateRef, series: signalSeries,
    getXRange, formatHistoryEpoch, formatHistoryEpochCursor,
    onZoomSelect,
    showLegend = true,
    showXAxis = true,
    cursorDrag = true,
    yScale = { auto: true } as { auto: true },
    valueDecimals = SIGNAL_VALUE_DECIMALS,
    yAxisSize = 60,
    fill = false,
    cursorSyncKey,
    syncedTooltip = false,
  } = opts;

  // Formatter for the cursor tooltip's bold header line. In history mode
  // the caller may want absolute timestamps (formatHistoryEpochCursor);
  // otherwise we render relative seconds.
  const formatCursorTime = (rawValue: number | null | undefined): string => {
    if (rawValue === null || rawValue === undefined || Number.isNaN(rawValue)) {
      return '--';
    }
    if (stateRef.isHistoryMode && formatHistoryEpochCursor) {
      return formatHistoryEpochCursor(stateRef.frameEnd + rawValue);
    }
    const absoluteOffset = rawValue - stateRef.timeOffset;
    return `${absoluteOffset.toFixed(3)}s`;
  };

  const formatCursorValue = (rawValue: number | null | undefined): string => {
    if (rawValue === null || rawValue === undefined || Number.isNaN(rawValue)) {
      return '--';
    }
    return rawValue.toFixed(valueDecimals);
  };

  // Resolve per-signal colors once — shared between the series strokes and
  // the cursor tooltip swatches so they can't drift.
  const resolvedColors: string[] = signalSeries.map((s, i) =>
    s.color ?? COLOR_CYCLE[i % COLOR_CYCLE.length],
  );

  // Resolve per-series value formatters once. A series without its own
  // formatter falls back to the chart-wide numeric `formatCursorValue`.
  const resolvedValueFormatters = signalSeries.map(s => s.formatValue ?? formatCursorValue);

  // Per-series unit formatters: only build (and thus enable the tooltip's unit
  // column) when at least one series supplies one. Series without one render an
  // empty unit cell.
  const anyUnit = signalSeries.some(s => s.formatUnit);
  const resolvedUnitFormatters = anyUnit
    ? signalSeries.map(s => s.formatUnit ?? (() => ''))
    : undefined;

  const series: uPlot.Series[] = [
    {
      label: 'Time',
      // Hide the synthetic Time series from the bottom legend — its value
      // is rendered in the cursor tooltip's bold header instead.
      class: CURSOR_TOOLTIP_HIDE_CLASS,
      value: (_self, rawValue) => formatCursorTime(rawValue as number),
    },
  ];

  for (let i = 0; i < signalSeries.length; i++) {
    const formatSeriesValue = resolvedValueFormatters[i];
    const color = resolvedColors[i];
    let fillColor: string | null = null;
    series.push({
      label: signalSeries[i].label,
      stroke: color,
      ...(fill && { fill: (u: uPlot) => (fillColor ??= translucentColor(u.ctx, color, FILL_ALPHA)) as string }),
      width: 2,
      scale: 'y',
      show: true,
      value: (_self, rawValue) => formatSeriesValue(rawValue as number),
      paths: uPlot.paths.stepped!({ align: 1 }),
      pxAlign: 0,
    });
  }

  const yScaleResolved = resolveYScale(yScale);

  const scales: Record<string, uPlot.Scale> = {
    x: {
      time: false,            // X axis is relative time-lag, not an epoch
      range: () => getXRange(),
    },
    y: yScaleResolved,
  };

  // Axis font matches the tooltip + bottom legend (text-sm monospace, resolved
  // against the document root font-size so it tracks the host's UI scale).
  const axisFont = getUplotAxisFont();

  const { stroke: axisStroke, grid: gridStroke, ticks: tickStroke } = AXIS_COLORS;
  const axes: uPlot.Axis[] = [
    {
      scale: 'x',
      font: axisFont,
      // Sub-second history labels carry decimals, so they need wider spacing.
      space: (_self, _axisIdx, min, max, plotDim) =>
        (stateRef.isHistoryMode && formatHistoryEpochCursor && (max - min) * X_TICK_SPACE_PX < plotDim
          ? X_TICK_SPACE_FRACTION_PX : X_TICK_SPACE_PX),
      size: showXAxis ? 30 : 0,
      stroke: axisStroke,
      ticks: { show: showXAxis, stroke: tickStroke, width: 1 },
      grid: { stroke: gridStroke, width: 1 },
      values: (_self, ticks) => {
        if (!showXAxis) return ticks.map(() => '');
        if (stateRef.isHistoryMode && formatHistoryEpoch) {
          const step = ticks.length > 1 ? ticks[1] - ticks[0] : 1;
          if (step < 1 && formatHistoryEpochCursor) {
            return ticks.map(v => trimFraction(formatHistoryEpochCursor(stateRef.frameEnd + v), step));
          }
          return ticks.map(v => formatHistoryEpoch(stateRef.frameEnd + v));
        }
        return ticks.map(v => {
          const absoluteOffset = v - stateRef.timeOffset;
          return absoluteOffset.toFixed(1) + 's';
        });
      },
    },
    {
      scale: 'y',
      font: axisFont,
      side: 3,                // Left side
      stroke: axisStroke,
      ticks: { stroke: tickStroke, width: 1 },
      grid: { show: true, stroke: gridStroke, width: 1 },
      size: yAxisSize,
    },
  ];

  const out: uPlot.Options = {
    width,
    height,
    series,
    scales,
    axes,
    legend: {
      show: showLegend,
      // Labels + click-to-toggle stay in the bottom legend; live per-series
      // values move to the cursor tooltip so the strip doesn't overflow.
      live: false,
      // Markers default to the series fill; keep them outlined like unfilled series.
      ...(fill && { markers: { fill: () => null as unknown as string } }),
    },
    cursor: {
      x: true,
      y: cursorSyncKey === undefined,
      drag: {
        x: cursorDrag,
        y: false,
      },
      ...(cursorSyncKey !== undefined && {
        sync: {
          key: cursorSyncKey,
          // X by value; Y by relative position, since the plots' Y scales differ.
          scales: ['x', null] as uPlot.Cursor.Sync.Scales,
          filters: { pub: (type: string) => type === 'mousemove' },
        },
      }),
    },
    plugins: [
      createCursorTooltipPlugin({
        formatTime: (raw: number) => formatCursorTime(raw),
        formatValue: (raw: number | null | undefined) => formatCursorValue(raw),
        formatValues: resolvedValueFormatters,
        formatUnits: resolvedUnitFormatters,
        colors: resolvedColors,
        showWhenSynced: syncedTooltip,
      }),
    ],
  };

  // Without the time axis, uPlot pads the bottom by a third of an axis and drops the right
  // padding; keep the right one and only leave room for the lowest Y label.
  if (!showXAxis) {
    out.padding = [null, X_AXIS_RIGHT_PAD_PX, Math.ceil(parseFloat(axisFont) / 2), null];
  }

  // The legend cuts long labels, so each one shows its full text on hover.
  if (showLegend) {
    out.hooks = {
      init: [
        (u: uPlot) => {
          for (const label of u.root.querySelectorAll<HTMLElement>('.u-legend .u-label')) {
            label.title = label.textContent ?? '';
          }
        },
      ],
    };
  }

  // Zoom selection hook — only relevant in history mode (click-drag selects
  // a sub-range; we forward to the caller, which decides whether to apply).
  if (onZoomSelect) {
    out.hooks = {
      ...out.hooks,
      setSelect: [
        (u: uPlot) => {
          if (!stateRef.isHistoryMode) return;
          const left = u.posToVal(u.select.left, 'x');
          const right = u.posToVal(u.select.left + u.select.width, 'x');
          if (right - left < 0.01) return; // selection too narrow to be intentional
          u.setSelect({ left: 0, width: 0, top: 0, height: 0 }, false);
          onZoomSelect(left, right);
          u.redraw();
        },
      ],
    };
  }

  return out;
}
