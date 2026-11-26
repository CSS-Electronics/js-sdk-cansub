import type uPlot from 'uplot';
import { EDGE_EXTEND_ENABLED, EDGE_EXTEND_THRESHOLD_MS } from './constants';

/**
 * Convert absolute-epoch timestamps to relative (time-lag) timestamps,
 * optionally extending the last point beyond the visible right edge.
 *
 * All points pass through; uPlot clips via the x-scale range. When edge-
 * extension is enabled and the last point is fresh enough (within
 * `EDGE_EXTEND_THRESHOLD_MS`), an extension point at x = -delay is appended
 * so stepped-path lines reach the right edge for slow signals.
 *
 * @param absTimestamps Absolute epoch timestamps (seconds).
 * @param values Corresponding signal values (null/undefined preserved).
 * @param frameEnd Reference epoch (seconds) the timestamps relativize against.
 * @param delay Adaptive right-edge delay (seconds); extension target = -delay.
 */
export function relativize(
  absTimestamps: number[],
  values: (number | null | undefined)[],
  frameEnd: number,
  delay: number = 0,
): uPlot.AlignedData {
  const n = absTimestamps.length;
  if (n === 0) return [[], []];

  const lastRel = absTimestamps[n - 1] - frameEnd;
  const isFresh = lastRel >= -(EDGE_EXTEND_THRESHOLD_MS / 1000);
  const extend = EDGE_EXTEND_ENABLED && isFresh;

  const outLen = extend ? n + 1 : n;
  const outTs = new Array<number>(outLen);
  const outVals = new Array<number | null | undefined>(outLen);

  for (let i = 0; i < n; i++) {
    outTs[i] = absTimestamps[i] - frameEnd;
    outVals[i] = values[i];
  }

  if (extend) {
    outTs[n] = -delay;
    outVals[n] = values[n - 1];
  }

  return [outTs, outVals];
}

/**
 * Compute padded min/max Y range from a values array.
 *
 * Applies ±10% padding around the data range and clamps so that padding
 * does not cross zero when the actual data didn't. Always returns a valid
 * range with max > min (falls back to [0, 1] for empty/missing data).
 */
export function paddedRange(
  values: ArrayLike<number | null | undefined>,
): { min: number; max: number } {
  let dataMin = Infinity;
  let dataMax = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v !== null && v !== undefined) {
      if (v < dataMin) dataMin = v;
      if (v > dataMax) dataMax = v;
    }
  }
  if (dataMin === Infinity) return { min: 0, max: 1 };

  const padding = (dataMax - dataMin) * 0.1;
  let yMin = dataMin - padding;
  let yMax = dataMax + padding;

  if (dataMin >= 0 && yMin < 0) yMin = 0;
  if (dataMax <= 0 && yMax > 0) yMax = 0;

  if (yMax <= yMin) { yMin -= 1; yMax += 1; }

  return { min: yMin, max: yMax };
}
