import { buildPlotOptions, computeChartQueryWindow, COLOR_CYCLE, DOWNSAMPLE_POINTS, type FrameClock } from '@csselectronics/can-plot';
import { createPlotEngine, type PlotEngine, type SignalSeriesData } from '@csselectronics/can-plot/engine';
import { querySignals, type QueryScratch } from '@csselectronics/can-decode/utils/signalQuery';
import type { CansubSession } from './session';
import { h, replaceChildren } from './dom';
import 'uplot/dist/uPlot.min.css';

export interface LiveChartOptions {
  /** Signal keys to plot, e.g. from `mountSignalPicker` or `session.findSignalKeys`. */
  signalKeys?: string[];
  /** Visible time window in seconds (default 10). Shared by every chart of the session. */
  windowSeconds?: number;
  /** Line colours, in signal order (default: the webCAN colour cycle). */
  colors?: string[];
  /** Decimals in the cursor tooltip (default 2). */
  valueDecimals?: number;
}

export interface LiveChart {
  setSignals(keys: string[]): void;
  destroy(): void;
}

/**
 * Live time-series chart of decoded signals, the same way webCAN plots: the session's
 * smoothed clock, a 10 Hz downsampled query over the stored frames and a 50 Hz redraw.
 * Signals from different messages and channels can share one chart.
 */
export function mountLiveChart(container: HTMLElement, session: CansubSession, options: LiveChartOptions = {}): LiveChart {
  const windowSeconds = options.windowSeconds ?? 10;
  const colors: readonly string[] = options.colors ?? COLOR_CYCLE;
  session.time.setTimeWindow(windowSeconds);
  session.time.resetChartClock();

  const time = session.time;
  const clock: FrameClock = {
    computeFrameEnd: () => time.computeChartTimeBoundary()?.frameEnd ?? null,
    getDelay: () => time.getAdaptiveDelay(),
    timeWindowSeconds: time.timeWindowSeconds,
    isLive: time.isLive,
    timeOffset: time.timeOffset,
    isHistoryMode: () => !time.isLive.value,
  };

  const plotEl = h('div', { class: 'cs-chart' });
  replaceChildren(container, plotEl);

  let keys: string[] = [];
  let engine: PlotEngine | null = null;
  let results = new Map<string, SignalSeriesData>();
  const scratch: QueryScratch = { timestamps: [], values: [], counts: new Int32Array(0) };

  function query(): void {
    if (keys.length === 0) return;
    const window = computeChartQueryWindow(clock);
    if (!window) return;
    const next = new Map<string, SignalSeriesData>();
    const raw = querySignals(session.storage, keys, window.qStart, window.qEnd, DOWNSAMPLE_POINTS, { scratch });
    for (const [key, r] of raw) next.set(key, { times: r.times, values: r.values, frameEnd: window.frameEnd });
    results = next;
  }

  function build(): void {
    engine?.destroy();
    engine = null;
    if (keys.length === 0) {
      replaceChildren(plotEl, h('p', { class: 'cs-muted cs-chart-empty' }, 'Select signals to plot.'));
      return;
    }
    replaceChildren(plotEl);
    engine = createPlotEngine({
      container: plotEl,
      signalIds: keys,
      frameClock: clock,
      getQueryResult: key => results.get(key) ?? null,
      buildOptions: (width, height, stateRef) => buildPlotOptions({
        width,
        height,
        stateRef,
        series: keys.map((key, i) => ({ label: legendLabel(key), color: colors[i % colors.length] })),
        getXRange: () => [-(time.timeWindowSeconds.value + clock.getDelay()), -clock.getDelay()],
        valueDecimals: options.valueDecimals ?? 2,
      }),
    });
  }

  function legendLabel(key: string): string {
    const { label, unit } = session.describeSignal(key);
    return unit ? `${label} (${unit})` : label;
  }

  // Query once per batch (~10 Hz); the engine redraws at 50 Hz in between.
  const unsubscribe = session.ticks.chartQueryUpdate.subscribe(query);

  // Labels come from the DBC once a signal is seen; rebuild when a label changes.
  let labels = '';
  const labelTimer = setInterval(() => {
    const next = keys.map(legendLabel).join('|');
    if (next !== labels) { labels = next; build(); }
  }, 1000);

  const chart: LiveChart = {
    setSignals(nextKeys) {
      keys = [...nextKeys];
      labels = keys.map(legendLabel).join('|');
      query();
      build();
    },
    destroy() {
      unsubscribe();
      clearInterval(labelTimer);
      engine?.destroy();
    },
  };
  chart.setSignals(options.signalKeys ?? []);
  return chart;
}
