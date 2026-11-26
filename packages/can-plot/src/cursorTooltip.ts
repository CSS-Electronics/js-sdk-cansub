import type uPlot from 'uplot';
import { EDGE_EXTEND_THRESHOLD_MS } from './constants';

/**
 * Read the cursor-position value for a series, falling back to the most
 * recent non-null sample within `staleSec` if the slot at `idx` is null.
 *
 * Mirrors uPlot's stepped-path visual semantics: when the rendered line is
 * carrying a value forward as a horizontal segment, the tooltip shows that
 * carried value. Past `staleSec` of carry-forward we treat the signal as
 * no longer broadcasting and return `undefined` (rendered as the `--`
 * placeholder by `formatValue`).
 *
 * Why this exists: when multiple signals from the same CAN message are
 * overlaid, `downsampleMinMax` picks bucket-local min/max indices per
 * signal, so post-downsample time axes drift apart. `uPlot.join` then
 * inserts nulls at the misaligned indices, which would otherwise flicker
 * the tooltip between real values and `--`. Walking back to the last real
 * sample gives the tooltip the same value the stepped line is drawing.
 *
 * Exported for unit testing.
 */
export function lookupSeriesValueAtCursor(
  times: ArrayLike<number | null | undefined>,
  values: ArrayLike<number | null | undefined>,
  idx: number,
  staleSec: number = EDGE_EXTEND_THRESHOLD_MS / 1000,
): number | null | undefined {
  if (idx < 0 || idx >= values.length) return undefined;
  const direct = values[idx];
  if (direct != null) return direct;

  const cursorTime = times[idx];
  if (cursorTime == null) return undefined;

  for (let i = idx - 1; i >= 0; i--) {
    const v = values[i];
    if (v == null) continue;
    const t = times[i];
    if (t == null) return undefined;
    if (cursorTime - t > staleSec) return undefined;
    return v;
  }
  return undefined;
}

/**
 * uPlot plugin: cursor-following tooltip with stacked per-series values.
 *
 * Replaces the inline live values that uPlot would otherwise cram into the
 * horizontal bottom legend. Shows a two-column grid (signal name | value)
 * plus a bold time header, next to the cursor. It is mounted on the page, not in
 * the chart, so it can extend past its container, and kept inside the window
 * (see placeCursorTooltip); the `destroy` hook removes it with the chart.
 *
 * Usage:
 * - Build uPlot options with `legend.live: false` (labels-only bottom legend
 *   with click-to-toggle still works).
 * - Mark the first (Time) series with `class: CURSOR_TOOLTIP_HIDE_CLASS` so
 *   its entry is hidden from the bottom legend (we show time in the tooltip
 *   header instead).
 * - Append `createCursorTooltipPlugin({ formatTime, formatValue })` to
 *   `opts.plugins`.
 *
 * The plugin reads labels and stroke colors from `u.series` at init time,
 * and values + cursor state at each `setCursor` tick. Each label keeps one
 * text node, rewritten only when its text changes, so updating at the redraw
 * rate creates no DOM nodes; plus one transform update per move.
 */

/** CSS class that hides a legend entry (used for the synthetic Time series). */
export const CURSOR_TOOLTIP_HIDE_CLASS = 'u-legend-hide-time';

/** Monospace stack used for numeric content inside the cursor tooltip. */
export const UPLOT_MONO_STACK = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

/**
 * Returns the canvas font string for uPlot axes, sized to `text-sm`
 * (0.875rem) so axis tick labels match the bottom legend size. Font family
 * is left as the regular UI sans-serif stack (same family uPlot ships with).
 *
 * Axis text is drawn onto the uPlot canvas via `ctx.font`, which accepts a
 * CSS font shorthand but not `rem` units — so we resolve size to absolute px
 * against the current `<html>` font-size on every call.
 *
 * NOTE: size is rounded to an integer because uPlot's internal pxRatioFont
 * parser only matches integer px values (`/(\d+)px/`). A fractional value
 * like `"11.2px"` gets mis-parsed and uPlot's later `syncFontSize` rewrite
 * on a devicePixelRatio change (browser zoom) produces a nonsense size that
 * collapses the axis labels until the chart is rebuilt.
 */
export function getUplotAxisFont(): string {
  const rootSizePx = typeof document !== 'undefined'
    ? parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
    : 16;
  const sizePx = Math.round(rootSizePx * 0.875); // matches Tailwind `text-sm`
  return `${sizePx}px system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
}

export interface CursorTooltipConfig {
  formatTime: (raw: number) => string;
  formatValue: (raw: number | null | undefined) => string;
  /**
   * Optional per-series value formatters, aligned with `colors` (i.e. data
   * series, excluding the Time axis). When provided, `formatValues[i]` formats
   * series i; a missing entry falls back to the global `formatValue`. Lets the
   * caller give each series its own formatter (e.g. a DBC value-table lookup)
   * without this plugin knowing anything beyond "number in, string out".
   */
  formatValues?: ((raw: number | null | undefined) => string)[];
  /**
   * Optional per-series unit / value-table-description formatters, aligned with
   * `colors`. When provided, the tooltip renders a THIRD left-aligned column for
   * the unit next to the right-aligned value column, so values stay
   * decimal-aligned regardless of unit length. A missing entry renders empty.
   * Omit entirely to keep the original two-column (name | value) layout.
   */
  formatUnits?: ((raw: number | null | undefined) => string)[];
  /** Stroke colors aligned with data series (i.e. excluding the Time axis). */
  colors: string[];
  /** Label before the header value (default "Time"). */
  headerLabel?: string;
  /** How far (x units) a null slot shows the previous value; 0 shows nulls as-is. Default: the stepped-line carry. */
  carryForwardSec?: number;
  /** Show the tooltip while the cursor follows another plot (uPlot cursor sync), not only while this plot is hovered. Default: false. */
  showWhenSynced?: boolean;
}

/** Gap between the cursor and the tooltip, and between the tooltip and the window edge. */
const CURSOR_GAP = 12;
const WINDOW_MARGIN = 8;

/**
 * Where the tooltip goes, in window coordinates: right of the cursor, or left of it
 * near the right edge; below the cursor, sliding up just enough near the bottom edge.
 * `maxHeight` keeps a tooltip taller than the window inside it.
 */
export function placeCursorTooltip(
  cursorX: number, cursorY: number, width: number, height: number, viewportWidth: number, viewportHeight: number,
): { x: number; y: number; maxHeight: number } {
  const maxHeight = viewportHeight - 2 * WINDOW_MARGIN;
  const h = Math.min(height, maxHeight);
  let x = cursorX + CURSOR_GAP;
  if (x + width > viewportWidth - WINDOW_MARGIN) x = cursorX - width - CURSOR_GAP;
  x = Math.max(WINDOW_MARGIN, Math.min(x, viewportWidth - width - WINDOW_MARGIN));
  const y = Math.max(WINDOW_MARGIN, Math.min(cursorY + CURSOR_GAP, viewportHeight - h - WINDOW_MARGIN));
  return { x, y, maxHeight };
}

/** A rectangle in window coordinates. */
export interface ViewRect { left: number; top: number; right: number; bottom: number }

/**
 * Where a following plot's tooltip is anchored, or null when that plot does not show the
 * cursor: `cursorX`/`cursorY` (window coordinates) with Y moved into the plot's visible part,
 * the intersection of `plot` and the `clips` (scroll containers, the window).
 */
export function followerAnchor(cursorX: number, cursorY: number, plot: ViewRect, clips: readonly ViewRect[]): { x: number; y: number } | null {
  let { left, top, right, bottom } = plot;
  for (const c of clips) {
    left = Math.max(left, c.left);
    top = Math.max(top, c.top);
    right = Math.min(right, c.right);
    bottom = Math.min(bottom, c.bottom);
  }
  if (cursorX < left || cursorX > right || top >= bottom) return null;
  return { x: cursorX, y: Math.max(top, Math.min(cursorY, bottom)) };
}

/** Ancestors of `el` whose overflow clips it. */
function clippingAncestors(el: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
    const cs = getComputedStyle(a);
    if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') out.push(a);
  }
  return out;
}

/** A label's single text node, appended to `el`. */
const textNode = (el: HTMLElement, text: string): Text => el.appendChild(document.createTextNode(text));

/** Rewrites a label in place; a `textContent` write would replace the node at every update. */
const setText = (node: Text, text: string): void => {
  if (node.data !== text) node.data = text;
};

export function createCursorTooltipPlugin(config: CursorTooltipConfig): uPlot.Plugin {
  let rootEl: HTMLDivElement | null = null;
  let timeEl: Text | null = null;
  let valueEls: Text[] = [];
  let unitEls: Text[] = [];
  let overEl: HTMLElement | null = null;
  let visible = false;
  // False while the cursor only follows another plot through cursor sync.
  let hovered = false;
  // Found on the first follow: a plot scrolled out of its container shows no tooltip.
  let clippers: HTMLElement[] | null = null;

  // When the caller supplies per-series unit formatters, value and unit render
  // in two separate columns (value right-aligned, unit left-aligned) so values
  // stay decimal-aligned across signals regardless of unit length.
  const hasUnits = !!config.formatUnits;

  const show = (): void => {
    if (rootEl && !visible) { rootEl.style.display = 'block'; visible = true; }
  };
  const hide = (): void => {
    if (rootEl && visible) { rootEl.style.display = 'none'; visible = false; }
  };
  const onEnter = (): void => { hovered = true; show(); };
  const onLeave = (): void => { hovered = false; hide(); };

  return {
    hooks: {
      init: (u: uPlot) => {
        overEl = u.over;

        // On the page, not in the plot: a widget card clips its content, and the
        // tooltip may extend over neighbouring widgets (positioned in setCursor).
        const root = document.createElement('div');
        root.className = 'text-sm text-gray-700';
        root.dataset.webcanCursorTooltip = '';
        Object.assign(root.style, {
          position: 'fixed',
          top: '0',
          left: '0',
          pointerEvents: 'none',
          // Above GridStack's resize handles (100), below the dashboard widget menu (200).
          zIndex: '150',
          overflow: 'hidden',
          display: 'none',
          minWidth: '220px',
          padding: '6px 10px',
          // Themed via host CSS vars so the tooltip stays readable in dark mode;
          // falls back to the light appearance for standalone consumers that do
          // not define these tokens.
          background: 'var(--color-tooltip-bg, rgba(255, 255, 255, 0.85))',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.12)',
          border: '1px solid var(--color-tooltip-border, rgba(0, 0, 0, 0.06))',
          borderRadius: '6px',
          willChange: 'transform',
        });

        const time = document.createElement('div');
        // Monospace for the fixed-width timestamp so digits align vertically
        // across consecutive updates.
        time.className = 'font-mono font-bold text-gray-900 mb-1';
        root.appendChild(time);

        const rows = document.createElement('div');
        Object.assign(rows.style, {
          display: 'grid',
          // Label column: min 140px, grows with content. Value column: min 9ch
          // (fits "XXXX.XXXX"), grows for longer numbers (rare); tabular-nums +
          // right-align keep decimals aligned across signals. When units are
          // supplied, a third left-aligned column holds the unit / value-table
          // description (the caller caps its length) so it never shifts values.
          gridTemplateColumns: hasUnits
            ? 'minmax(140px, max-content) minmax(9ch, max-content) max-content'
            : 'minmax(140px, max-content) minmax(9ch, max-content)',
          rowGap: '2px',
          columnGap: '12px',
          alignItems: 'center',
        });

        // Build one row per data series (skip series[0] which is the Time axis).
        valueEls = [];
        unitEls = [];
        for (let i = 1; i < u.series.length; i++) {
          const s = u.series[i];
          const stroke = config.colors[i - 1] ?? '#888';

          const nameCell = document.createElement('span');
          Object.assign(nameCell.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            minWidth: '0',
          });

          const swatch = document.createElement('span');
          // Outlined circle matching uPlot's bottom-legend marker (2px colored
          // border, transparent interior). Inline-block so width/height apply.
          Object.assign(swatch.style, {
            display: 'inline-block',
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            border: `2px solid ${stroke}`,
            boxSizing: 'border-box',
            flexShrink: '0',
          });

          const nameText = document.createElement('span');
          nameText.className = 'truncate text-gray-700';
          nameText.textContent = typeof s.label === 'string' ? s.label : '';

          nameCell.appendChild(swatch);
          nameCell.appendChild(nameText);

          const valueCell = document.createElement('span');
          // Monospace + tabular-nums so columns of numbers line up even as
          // digit counts change between updates.
          valueCell.className = 'font-mono text-gray-900 tabular-nums';
          Object.assign(valueCell.style, { textAlign: 'right' });
          valueEls.push(textNode(valueCell, '--'));

          rows.appendChild(nameCell);
          rows.appendChild(valueCell);

          if (hasUnits) {
            // Separate left-aligned column for the unit / value-table label, so
            // its (variable) length never shifts the right-aligned value column.
            const unitCell = document.createElement('span');
            unitCell.className = 'text-gray-500';
            Object.assign(unitCell.style, { textAlign: 'left', whiteSpace: 'nowrap' });
            unitEls.push(textNode(unitCell, ''));
            rows.appendChild(unitCell);
          }
        }

        root.appendChild(rows);
        document.body.appendChild(root);

        overEl.addEventListener('mouseenter', onEnter);
        overEl.addEventListener('mouseleave', onLeave);
        // A plot rebuilt under a still pointer (e.g. Chart view signal scrolling) gets no mouseenter.
        overEl.addEventListener('mousemove', () => { hovered = true; });

        rootEl = root;
        timeEl = textNode(time, '');
      },

      setCursor: (u: uPlot) => {
        if (!rootEl || !timeEl) return;
        const { left, top, idx } = u.cursor;
        if (idx == null || left == null || top == null || left < 0 || top < 0 || (!hovered && !config.showWhenSynced)) {
          hide();
          return;
        }

        // Cursor coords are CSS pixels relative to u.over; the tooltip is placed in
        // window coordinates. (u.bbox is in device pixels, so it is not used here.)
        const rect = overEl!.getBoundingClientRect();
        let anchorX = rect.left + left;
        let anchorY = rect.top + top;
        if (!hovered) {
          clippers ??= clippingAncestors(overEl!);
          const anchor = followerAnchor(anchorX, anchorY, rect, [
            ...clippers.map(c => c.getBoundingClientRect()),
            { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight },
          ]);
          if (!anchor) { hide(); return; }
          ({ x: anchorX, y: anchorY } = anchor);
        }
        show();

        const xRaw = u.data[0][idx] as number | null | undefined;
        setText(timeEl, `${config.headerLabel ?? 'Time'}: ${xRaw != null ? config.formatTime(xRaw as number) : '--'}`);

        const times = u.data[0] as ArrayLike<number | null | undefined>;
        for (let i = 0; i < valueEls.length; i++) {
          const series = u.data[i + 1] as ArrayLike<number | null | undefined> | undefined;
          const raw = series ? lookupSeriesValueAtCursor(times, series, idx, config.carryForwardSec) : undefined;
          const format = config.formatValues?.[i] ?? config.formatValue;
          setText(valueEls[i], format(raw));
          if (hasUnits) {
            const formatUnit = config.formatUnits?.[i];
            setText(unitEls[i], formatUnit ? formatUnit(raw) : '');
          }
        }

        rootEl.style.maxHeight = '';
        const { x, y, maxHeight } = placeCursorTooltip(
          anchorX, anchorY, rootEl.offsetWidth, rootEl.offsetHeight, window.innerWidth, window.innerHeight,
        );
        rootEl.style.maxHeight = `${maxHeight}px`;
        rootEl.style.transform = `translate(${x}px, ${y}px)`;
      },

      // The tooltip lives on the page, so it goes with its chart (rebuilds tear charts down often).
      destroy: () => {
        rootEl?.remove();
        rootEl = null;
        timeEl = null;
      },
    },
  };
}
