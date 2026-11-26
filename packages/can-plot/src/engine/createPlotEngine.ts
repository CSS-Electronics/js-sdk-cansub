import uPlot from 'uplot';
import type { FrameClock } from '../frameClock';
import type { PlotStateRef } from '../buildPlotOptions';
import { relativize } from '../relativize';
import { UPDATE_INTERVAL_MS } from '../constants';
import { legendLayout } from './legendLayout';
import { joinAbsolute, relativizeJoined, type JoinedSeries } from './joinedSeries';

/**
 * Plain-shape time-series data for one signal — matches what
 * `host.charts.querySignals` returns per entry.
 */
export interface SignalSeriesData {
  times: number[];
  values: (number | null | undefined)[];
  frameEnd: number;
}

export interface PlotEngineConfig {
  container: HTMLElement;
  signalIds: string[];
  frameClock: FrameClock;
  /**
   * Pull the latest absolute-epoch data for one signal id, or null if no
   * data is available yet. The engine relativizes the data internally
   * before calling `setData` on the uPlot instance.
   */
  getQueryResult(signalId: string): SignalSeriesData | null;
  /**
   * Build a uPlot.Options object for the given dimensions. The engine
   * provides the mutable `stateRef` formatters close over, so axis labels
   * stay live without rebuilding the chart.
   */
  buildOptions: (w: number, h: number, stateRef: PlotStateRef) => uPlot.Options;
  /** Called after each data sync (e.g. for computing avg/stat values). */
  onDataUpdate?: (data: uPlot.AlignedData) => void;
  /**
   * Optional zoom signals for change detection. When provided, the engine
   * triggers a redraw whenever the zoom min/max change between ticks.
   */
  zoomSignals?: { min: { peek(): number | null }; max: { peek(): number | null } };
  /** Tick interval (ms). Defaults to {@link UPDATE_INTERVAL_MS} (50 Hz). */
  updateIntervalMs?: number;
}

export interface PlotEngine {
  /** Tear down and re-mount the underlying uPlot instance. */
  rebuild(): void;
  /** Tear down without re-mount. Idempotent. */
  destroy(): void;
  /** Latest cached data for the primary (signalIds[0]) signal. */
  getCachedPrimary(): SignalSeriesData | null;
}

/**
 * Size a chart to its container, leaving room below the plot for uPlot's legend:
 * up to two rows (see legendLayout), with a longer legend scrolling inside that.
 */
function fitToContainer(plot: uPlot, width: number, height: number): void {
  plot.setSize({ width, height: legendFitHeight(plot.root, width, height) });
}

/** The plot height that leaves room for the legend, after capping the legend to fit. */
function legendFitHeight(root: HTMLElement, width: number, height: number): number {
  const legend = root.querySelector<HTMLElement>('.u-legend');
  if (!legend) return height;
  // An explicit width: uPlot applies setSize in a later batch, so the legend would
  // otherwise still wrap at the old plot width when measured below.
  legend.style.width = `${width}px`;
  legend.style.overflowY = 'auto';
  // A label longer than the legend is cut rather than adding a horizontal scrollbar.
  legend.style.overflowX = 'hidden';
  legend.style.maxHeight = '';
  const rowHeights = [...legend.querySelectorAll<HTMLElement>('.u-series')].map(r => r.offsetHeight).filter(h => h > 0);
  if (rowHeights.length === 0) return height;
  const { legendMaxHeight, plotHeight } = legendLayout(height, Math.min(...rowHeights), legend.offsetHeight);
  legend.style.maxHeight = `${legendMaxHeight}px`;
  return plotHeight;
}

/**
 * Generic uPlot lifecycle engine: measure container → build options →
 * create instance → ResizeObserver → 50 Hz render loop → cleanup. The plot
 * leaves room for its legend (up to two rows; a longer legend scrolls).
 *
 * Used both by the Preact `useUPlotChart` hook and by plain-TS apps. The
 * engine never reads from a host's reactive store — all time-state comes
 * via `frameClock`, all data via `getQueryResult`. The caller owns when
 * to rebuild (via the returned `rebuild()`).
 */
export function createPlotEngine(cfg: PlotEngineConfig): PlotEngine {
  const {
    container, signalIds, frameClock, getQueryResult, buildOptions,
    onDataUpdate, zoomSignals,
    updateIntervalMs = UPDATE_INTERVAL_MS,
  } = cfg;

  let plotInstance: uPlot | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let deferredMountObserver: ResizeObserver | null = null;
  let rafId: number | null = null;
  let lastRenderTs = -Infinity;
  let containerWidth = 0;
  let containerHeight = 0;
  let destroyed = false;

  const minIntervalMs = updateIntervalMs > 0 ? Math.max(0, updateIntervalMs - 4) : 0;

  // Cached absolute-epoch data for the primary signal (index 0).
  let cachedPrimary: SignalSeriesData | null = null;
  // Per-signal cache for multi-signal mode (referential change detection).
  const cachedEntries = new Map<string, SignalSeriesData>();
  // Multi-signal data joined on absolute time, rebuilt only when a signal's query result changes.
  let joined: JoinedSeries | null = null;

  // Mutable state ref the buildOptions formatters close over.
  const stateRef: PlotStateRef = { frameEnd: 0, timeOffset: 0, isHistoryMode: false };

  // Last-seen zoom for change detection.
  let lastZoomMin: number | null = zoomSignals?.min.peek() ?? null;
  let lastZoomMax: number | null = zoomSignals?.max.peek() ?? null;

  /**
   * Sync `stateRef` from the frame clock. Always refreshes the orientation
   * flags (`timeOffset`, `isHistoryMode`) so axis/cursor formatters reflect
   * the current mode even when there is no data to draw. Returns false when
   * the clock has no `frameEnd` yet (e.g. no live arrivals; CSV-only data
   * with disabled `recordArrival`) — callers must skip relativization in
   * that case, since coercing `frameEnd` to 0 makes ancient absolute epochs
   * look "fresh" relative to it and triggers spurious edge-extension at the
   * right edge.
   */
  const syncStateRef = (): boolean => {
    stateRef.timeOffset = frameClock.timeOffset.value;
    stateRef.isHistoryMode = frameClock.isHistoryMode();
    const fe = frameClock.computeFrameEnd();
    if (fe === null) return false;
    stateRef.frameEnd = fe;
    return true;
  };

  const emptyAlignedData = (): uPlot.AlignedData => {
    if (signalIds.length <= 1) return [[]] as unknown as uPlot.AlignedData;
    const perSignal: uPlot.AlignedData[] = [];
    for (let i = 0; i < signalIds.length; i++) {
      perSignal.push([[], []] as unknown as uPlot.AlignedData);
    }
    return uPlot.join(perSignal);
  };

  const buildInitialData = (frameEnd: number, delay: number): uPlot.AlignedData => {
    if (signalIds.length <= 1) {
      const entry = getQueryResult(signalIds[0]);
      if (!entry) return [[]] as unknown as uPlot.AlignedData;
      return relativize(entry.times, entry.values, frameEnd, delay);
    }
    return buildMultiSignalData(frameEnd, delay);
  };

  const buildMultiSignalData = (frameEnd: number, delay: number): uPlot.AlignedData => {
    const entries = signalIds.map(id => getQueryResult(id));
    if (!joined || entries.some((e, i) => e !== joined!.entries[i])) joined = joinAbsolute(entries);
    return relativizeJoined(joined, frameEnd, delay);
  };

  const mount = (): void => {
    if (signalIds.length === 0 || destroyed) return;

    // Measure content box (excludes padding) to match ResizeObserver's contentRect.
    const cs = getComputedStyle(container);
    const w = container.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const h = container.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    if (w <= 0 || h <= 0) {
      // Container has no layout yet (zero-sized div before browser paints,
      // or hidden parent). Watch for the first non-zero size, then retry.
      // The webCAN host's flex containers always size at construction so
      // this branch is dead there; plain-TS apps with arbitrary HTML need it.
      if (deferredMountObserver) return;
      deferredMountObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
            deferredMountObserver?.disconnect();
            deferredMountObserver = null;
            mount();
            return;
          }
        }
      });
      deferredMountObserver.observe(container);
      return;
    }
    containerWidth = w;
    containerHeight = h;

    // Seed stateRef before building options (formatters read from it).
    // When the clock has no frameEnd yet, mount with empty data — the tick
    // loop will redraw once both data and clock become available.
    const haveClock = syncStateRef();

    // Seed caches from the data source.
    cachedPrimary = haveClock ? getQueryResult(signalIds[0]) : null;
    cachedEntries.clear();
    if (haveClock) {
      for (const id of signalIds) {
        const entry = getQueryResult(id);
        if (entry) cachedEntries.set(id, entry);
      }
    }

    const opts = buildOptions(w, h, stateRef);
    const data = haveClock
      ? buildInitialData(stateRef.frameEnd, frameClock.getDelay())
      : emptyAlignedData();

    const plot = new uPlot(opts, data, container);
    plotInstance = plot;
    fitToContainer(plot, w, h);
    onDataUpdate?.(data);

    // ResizeObserver — handles container resize without uPlot rebuild.
    resizeObserver = new ResizeObserver((entries) => {
      if (!plotInstance) return;
      for (const entry of entries) {
        const newW = Math.round(entry.contentRect.width);
        const newH = Math.round(entry.contentRect.height);
        if (newW > 0 && newH > 0 && (newW !== containerWidth || newH !== containerHeight)) {
          containerWidth = newW;
          containerHeight = newH;
          fitToContainer(plotInstance, newW, newH);
        }
      }
    });
    resizeObserver.observe(container);

    // rAF-driven render loop. Using `requestAnimationFrame` instead of
    // `setInterval` lets the browser back-pressure: when the GPU/compositor
    // can't keep up with stroke-heavy redraws (volatile signals on long
    // windows), the next callback fires after the previous frame is
    // presented instead of piling up behind it.
    const tick = (now: DOMHighResTimeStamp): void => {
      rafId = requestAnimationFrame(tick);
      if (!plotInstance) return;
      if (now - lastRenderTs < minIntervalMs) return;

      let dataChanged = false;
      let sourceCleared = false;

      if (signalIds.length <= 1) {
        const latest = getQueryResult(signalIds[0]);
        if (latest === null) {
          if (cachedPrimary !== null) {
            cachedPrimary = null;
            sourceCleared = true;
          }
        } else {
          dataChanged = latest !== cachedPrimary;
          cachedPrimary = latest;
        }
        if (cachedPrimary === null && !sourceCleared) return;
      } else {
        let anyEntry = false;
        for (const id of signalIds) {
          const latest = getQueryResult(id);
          if (latest === null) continue;
          anyEntry = true;
          if (latest !== cachedEntries.get(id)) {
            cachedEntries.set(id, latest);
            dataChanged = true;
          }
        }
        if (!anyEntry) {
          if (cachedEntries.size > 0) {
            cachedEntries.clear();
            cachedPrimary = null;
            sourceCleared = true;
          }
        } else {
          const primary = cachedEntries.get(signalIds[0]);
          if (primary) cachedPrimary = primary;
        }
        if (cachedEntries.size === 0 && !sourceCleared) return;
      }

      let zoomChanged = false;
      if (zoomSignals) {
        const zm = zoomSignals.min.peek();
        const zx = zoomSignals.max.peek();
        zoomChanged = zm !== lastZoomMin || zx !== lastZoomMax;
        if (zoomChanged) { lastZoomMin = zm; lastZoomMax = zx; }
      }

      if (!frameClock.isLive.value && !dataChanged && !zoomChanged && !sourceCleared) return;

      // When the source went null, clear the canvas without relativizing
      // (a null-clock fallback to frameEnd=0 would make ancient epochs look
      // fresh and trigger spurious edge-extension at the right edge).
      if (sourceCleared) {
        // Sync orientation flags so axis/cursor formatters reflect the
        // current mode (e.g. flip away from history-mode absolute timestamps
        // when the user has just returned to live).
        syncStateRef();
        const empty = emptyAlignedData();
        plotInstance.setData(empty);
        plotInstance.redraw(false, true);
        onDataUpdate?.(empty);
        lastRenderTs = now;
        return;
      }

      // Skip the redraw entirely when the clock is unavailable — relativizing
      // against `frameEnd = 0` would draw stale data at the right edge.
      if (!syncStateRef()) return;
      const delay = frameClock.getDelay();

      let extended: uPlot.AlignedData;
      if (signalIds.length <= 1) {
        extended = relativize(
          cachedPrimary!.times, cachedPrimary!.values,
          stateRef.frameEnd, delay,
        );
      } else {
        extended = buildMultiSignalData(stateRef.frameEnd, delay);
      }

      plotInstance.setData(extended);
      plotInstance.redraw(false, true);
      if (dataChanged) onDataUpdate?.(extended);

      lastRenderTs = now;
    };
    rafId = requestAnimationFrame(tick);
  };

  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    deferredMountObserver?.disconnect();
    deferredMountObserver = null;
    resizeObserver?.disconnect();
    resizeObserver = null;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (plotInstance) {
      plotInstance.destroy();
      plotInstance = null;
    }
  };

  mount();

  return {
    rebuild(): void {
      // Tear down and re-create. The host's `useUPlotChart` hook handles
      // debouncing of consecutive rebuilds (e.g. signal scrolling) — the
      // engine itself rebuilds eagerly when asked.
      destroy();
      destroyed = false;
      mount();
    },
    destroy,
    getCachedPrimary(): SignalSeriesData | null {
      return cachedPrimary;
    },
  };
}
