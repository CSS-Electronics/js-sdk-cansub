import uPlot from 'uplot';
import { EDGE_EXTEND_ENABLED, EDGE_EXTEND_THRESHOLD_MS } from '../constants';
import { relativize } from '../relativize';
import type { SignalSeriesData } from './createPlotEngine';

/**
 * Several signals aligned on one absolute time column, joined once per data change, so a
 * frame only shifts the times (`relativizeJoined`) instead of re-running `uPlot.join`.
 * The result equals joining each signal's `relativize()` output (see joinedSeries.test.ts).
 */
export interface JoinedSeries {
  /** `uPlot.join` of the absolute series; null when they share one time column (see `relativizeJoined`). */
  table: uPlot.AlignedData | null;
  /** The series as given, for the shared-column case. */
  entries: (SignalSeriesData | null)[];
  /** Each series' last absolute time (NaN when empty) and last value, for the right-edge extension point. */
  lastTimes: number[];
  lastValues: (number | null | undefined)[];
}

const EMPTY: uPlot.AlignedData = [[], []] as unknown as uPlot.AlignedData;

/** True when every series has the same time column, which `uPlot.join` aligns without merging. */
function sameTimes(entries: (SignalSeriesData | null)[]): boolean {
  const t0 = entries[0]?.times ?? [];
  return entries.every(e => {
    const t = e?.times ?? [];
    if (t === t0) return true;
    if (t.length !== t0.length) return false;
    for (let i = 0; i < t.length; i++) if (t[i] !== t0[i]) return false;
    return true;
  });
}

export function joinAbsolute(entries: (SignalSeriesData | null)[]): JoinedSeries {
  const lastTimes = entries.map(e => (e && e.times.length > 0 ? e.times[e.times.length - 1] : NaN));
  const lastValues = entries.map(e => (e && e.values.length > 0 ? e.values[e.values.length - 1] : undefined));
  const table = sameTimes(entries)
    ? null
    : uPlot.join(entries.map(e => (e && e.times.length > 0 ? [e.times, e.values] as unknown as uPlot.AlignedData : EMPTY)));
  return { table, entries, lastTimes, lastValues };
}

/** First index whose value is at or above `x` (ascending `xs`). */
function lowerBound(xs: ArrayLike<number>, x: number): number {
  let lo = 0;
  let hi = xs.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (xs[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * The joined series relative to `frameEnd`, with the edge-extension point at `-delay` for
 * each fresh series, as `relativize()` adds it. Series sharing one time column take the
 * plain per-signal path, which `uPlot.join` handles without merging.
 */
export function relativizeJoined(j: JoinedSeries, frameEnd: number, delay: number): uPlot.AlignedData {
  if (!j.table) {
    return uPlot.join(j.entries.map(e => (e && e.times.length > 0 ? relativize(e.times, e.values, frameEnd, delay) : EMPTY)));
  }

  const absX = j.table[0] as number[];
  const n = absX.length;
  const relX = new Array<number>(n);
  for (let i = 0; i < n; i++) relX[i] = absX[i] - frameEnd;
  const ys = j.table.slice(1) as (number | null | undefined)[][];

  const fresh = j.lastTimes.map(t => EDGE_EXTEND_ENABLED && t - frameEnd >= -(EDGE_EXTEND_THRESHOLD_MS / 1000));
  if (!fresh.includes(true)) return [relX, ...ys] as unknown as uPlot.AlignedData;

  const ext = -delay;
  const k = lowerBound(relX, ext);
  if (k < n && relX[k] === ext) {
    // The extension lands on an existing time: it overwrites that row, as the later value does in a join.
    const out = ys.map((y, s) => {
      if (!fresh[s]) return y;
      const copy = y.slice();
      copy[k] = j.lastValues[s];
      return copy;
    });
    return [relX, ...out] as unknown as uPlot.AlignedData;
  }

  relX.splice(k, 0, ext);
  const out = ys.map((y, s) => {
    const copy = new Array<number | null | undefined>(n + 1);
    for (let i = 0; i < k; i++) copy[i] = y[i];
    copy[k] = fresh[s] ? j.lastValues[s] : undefined;
    for (let i = k; i < n; i++) copy[i + 1] = y[i];
    return copy;
  });
  return [relX, ...out] as unknown as uPlot.AlignedData;
}
