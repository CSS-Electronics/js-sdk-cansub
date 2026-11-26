import { useEffect, useRef } from 'preact/hooks';
import type uPlot from 'uplot';
import {
  createPlotEngine,
  type PlotEngine,
  type SignalSeriesData,
} from '../engine/createPlotEngine';
import type { FrameClock } from '../frameClock';
import type { PlotStateRef } from '../buildPlotOptions';
import { RENDER_DEBOUNCE_MS } from '../constants';

/**
 * Config consumed by {@link useUPlotChart}.
 *
 * Mirrors {@link import('../engine/createPlotEngine').PlotEngineConfig} but adds
 * Preact-specific extras: `containerRef` (effect-friendly), `extraDeps` (extra
 * effect deps that trigger a rebuild), and `debounceCreate` (defer rebuilds
 * after the first mount).
 */
export interface UseUPlotChartConfig {
  signalIds: string[];
  containerRef: { current: HTMLElement | null };
  frameClock: FrameClock;
  getQueryResult(signalId: string): SignalSeriesData | null;
  buildOptions: (w: number, h: number, stateRef: PlotStateRef) => uPlot.Options;
  onDataUpdate?: (data: uPlot.AlignedData) => void;
  /** Optional zoom signals for change detection. */
  zoomSignals?: { min: { peek(): number | null }; max: { peek(): number | null } };
  /** Defer engine rebuild on subsequent mounts (used by Chart-view signal scrolling). */
  debounceCreate?: boolean;
  /** Additional effect deps that should trigger a rebuild. */
  extraDeps?: unknown[];
  /** Tick interval (ms). Engine default: 20 (50 Hz). */
  updateIntervalMs?: number;
}

/**
 * Preact hook that drives a `createPlotEngine` instance over a div ref.
 *
 * Owns the effect lifecycle: creates the engine on mount, rebuilds when
 * `signalIds` (or `extraDeps`) change, debounces consecutive rebuilds when
 * `debounceCreate` is true (avoiding uPlot create/destroy thrash during
 * signal scrolling), and tears down on unmount.
 *
 * Returns a `cachedPrimaryRef` exposing the latest absolute-epoch entry for
 * the primary signal — useful for "scale to data" buttons or external
 * computations that don't want to subscribe to the 50 Hz tick.
 */
export function useUPlotChart(
  cfg: UseUPlotChartConfig,
): { cachedPrimaryRef: { current: SignalSeriesData | null } } {
  const engineRef = useRef<PlotEngine | null>(null);
  const isFirstMount = useRef(true);
  const cachedPrimaryRef = useRef<SignalSeriesData | null>(null);

  // Stable serialized key for signalIds (effect deps).
  const signalIdsKey = JSON.stringify(cfg.signalIds);
  // Read timeWindowSeconds reactively — when the host's signal updates the
  // window size, that's a structural change that warrants a rebuild.
  const timeWindow = cfg.frameClock.timeWindowSeconds.value;

  useEffect(() => {
    const container = cfg.containerRef.current;
    if (!container || cfg.signalIds.length === 0) return;

    const create = (): void => {
      const engine = createPlotEngine({
        container,
        signalIds: cfg.signalIds,
        frameClock: cfg.frameClock,
        getQueryResult: cfg.getQueryResult,
        buildOptions: cfg.buildOptions,
        onDataUpdate: (data) => {
          cachedPrimaryRef.current = engineRef.current?.getCachedPrimary() ?? null;
          cfg.onDataUpdate?.(data);
        },
        zoomSignals: cfg.zoomSignals,
        updateIntervalMs: cfg.updateIntervalMs,
      });
      engineRef.current = engine;
      cachedPrimaryRef.current = engine.getCachedPrimary();
    };

    let timer: ReturnType<typeof setTimeout> | null = null;
    if (isFirstMount.current) {
      isFirstMount.current = false;
      create();
    } else if (cfg.debounceCreate) {
      timer = setTimeout(create, RENDER_DEBOUNCE_MS);
    } else {
      create();
    }

    return () => {
      if (timer) clearTimeout(timer);
      engineRef.current?.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signalIdsKey, timeWindow, ...(cfg.extraDeps ?? [])]);

  return { cachedPrimaryRef };
}
