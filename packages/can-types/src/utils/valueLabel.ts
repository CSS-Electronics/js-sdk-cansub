/**
 * Shared resolver for the text shown in a decoded signal's UNIT slot: the DBC
 * value-table (`VAL_`) description when the value matches an entry, otherwise
 * the engineering unit.
 *
 * Single source of truth reused by every display site (Summary, Trace, and the
 * Chart / Dashboard tooltip closures and the Stat widget) so the unit↔label
 * rendering can never drift. Lives here in `@csselectronics/can-types` (the shared
 * vocabulary layer, no `@csselectronics/can-decode` dependency) rather than in
 * `@csselectronics/can-plot`, which must stay uplot-only.
 *
 * The numeric value itself is always formatted independently by each caller, so
 * the raw value stays visible regardless of whether a description applies.
 */

/**
 * Return the value-table description for an exact integer match of `value`,
 * else the engineering `unit`.
 *
 * Value-table keys are integers (enumerations are identity-scale, so the
 * physical value equals the raw integer key); a non-integer value — e.g. an
 * averaged value — simply misses and yields the unit.
 *
 * `maxLen` (used only by the chart cursor tooltip, which has no CSS truncation)
 * truncates the result with an ellipsis when longer; table cells omit it and
 * rely on CSS `truncate` + a native `title` for full-text-on-hover.
 */
export function signalUnitOrLabel(
  value: number,
  valueTable: ReadonlyMap<number, string> | undefined,
  unit: string,
  maxLen?: number,
): string {
  let text = valueTable?.get(value) ?? unit;
  if (maxLen !== undefined && text.length > maxLen) text = text.slice(0, maxLen) + '…';
  return text;
}
