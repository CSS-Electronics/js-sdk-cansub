/**
 * `FrameClock` — the time-state contract `@csselectronics/can-plot` consumers implement so
 * the engine and `computeChartQueryWindow` can drive their work without
 * knowing about webCAN's `TimeControlService` (or any other concrete clock).
 *
 * Implementations are user-supplied:
 * - The webCAN host wraps `TimeControlService` via `HostChartsService.getFrameClock()`.
 * - Plain-TS apps (e.g. the `signal-chart` example in `web-app-sdk-cansub`)
 *   write their own thin impl that wraps whatever clock-calibration they use.
 *
 * The two `{ value: T }` fields (`isLive`, `timeOffset`, `timeWindowSeconds`)
 * are shaped to match Preact-signals / mobx-style readable refs but only
 * `.value` is required — the engine never subscribes through them.
 */
export interface FrameClock {
  /**
   * Latest absolute-epoch right-edge of the live window (seconds).
   * Returns null when no time baseline exists yet (e.g. before the first
   * batch arrives).
   */
  computeFrameEnd(): number | null;

  /** Adaptive right-edge delay (seconds). Hides batch-timing jitter. */
  getDelay(): number;

  /** Width of the live time window (seconds). */
  timeWindowSeconds: { value: number };

  /** True while the chart tracks live data; false while paused / scrubbing. */
  isLive: { value: boolean };

  /**
   * History-mode time offset (seconds, ≥ 0). When > 0 the visible window
   * trails the live edge by this amount.
   */
  timeOffset: { value: number };

  /**
   * Convenience boolean for axis formatters and engine branches.
   * Typically `!isLive.value`, but consumers may override.
   */
  isHistoryMode(): boolean;
}
