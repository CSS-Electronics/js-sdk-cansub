/**
 * Centralized epoch formatting utilities.
 *
 * Two canonical formats:
 * - Long: HH:MM:SS.ffffff (microsecond precision) - trace rows, summary, chart cursor
 * - Short: HH:MM:SS - chart axis ticks
 *
 * Two implementations: 'manual' (default, ~5-10x faster) and 'intl' (Intl.DateTimeFormat).
 * Switchable via setEpochFormatterMode() for benchmarking (see EpochFormatter.bench.ts).
 */
type FormatterMode = 'manual' | 'intl';
let currentMode: FormatterMode = 'manual';

export function setEpochFormatterMode(mode: FormatterMode): void {
  currentMode = mode;
}

export function getEpochFormatterMode(): FormatterMode {
  return currentMode;
}

// ── Shared state ───────────────────────────────────────────────────────────

const sharedDate = new Date();

const intlHmsFormatter = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

// ── Manual implementation ──────────────────────────────────────────────────

function manualFormatLong(epochSeconds: number): string {
  const totalUs = Math.round(epochSeconds * 1_000_000);
  const fracUs = totalUs % 1_000_000;
  sharedDate.setTime((totalUs - fracUs) / 1_000);
  const h = String(sharedDate.getHours()).padStart(2, '0');
  const m = String(sharedDate.getMinutes()).padStart(2, '0');
  const s = String(sharedDate.getSeconds()).padStart(2, '0');
  const ms = String(Math.floor(fracUs / 1000)).padStart(3, '0');
  const us = String(fracUs % 1000).padStart(3, '0');
  return `${h}:${m}:${s}.${ms}${us}`;
}

function manualFormatShort(epochSeconds: number): string {
  sharedDate.setTime(epochSeconds * 1000);
  const h = String(sharedDate.getHours()).padStart(2, '0');
  const m = String(sharedDate.getMinutes()).padStart(2, '0');
  const s = String(sharedDate.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// ── Intl implementation ────────────────────────────────────────────────────

function intlFormatLong(epochSeconds: number): string {
  const totalUs = Math.round(epochSeconds * 1_000_000);
  const fracUs = totalUs % 1_000_000;
  sharedDate.setTime((totalUs - fracUs) / 1_000);
  const timeStr = intlHmsFormatter.format(sharedDate);
  const ms = String(Math.floor(fracUs / 1000)).padStart(3, '0');
  const us = String(fracUs % 1000).padStart(3, '0');
  return `${timeStr}.${ms}${us}`;
}

function intlFormatShort(epochSeconds: number): string {
  sharedDate.setTime(epochSeconds * 1000);
  return intlHmsFormatter.format(sharedDate);
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Format epoch as HH:MM:SS.ffffff (microsecond precision).
 * Used for trace rows, summary rows, chart cursor hover, timeline slider.
 */
export function formatEpochLong(epochSeconds: number): string {
  return currentMode === 'intl'
    ? intlFormatLong(epochSeconds)
    : manualFormatLong(epochSeconds);
}

/**
 * Parse "HH:MM:SS.ffffff" back into epoch seconds using the date from a reference epoch.
 * Accepts 1–6 fractional digits (e.g. "14:32:15.123", "14:32:15.123456").
 * Returns null if the format is invalid or values are out of range.
 *
 * @param timeStr - Time string in HH:MM:SS.ffffff format
 * @param referenceEpoch - Epoch seconds used to extract the date (year/month/day)
 */
export function parseEpochLong(timeStr: string, referenceEpoch: number): number | null {
  const match = timeStr.match(/^(\d{2}):(\d{2}):(\d{2})\.(\d{1,6})$/);
  if (!match) return null;

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);
  const fracStr = match[4].padEnd(6, '0');
  const microseconds = parseInt(fracStr, 10);

  if (hours > 23 || minutes > 59 || seconds > 59) return null;

  const date = new Date(referenceEpoch * 1000);
  date.setHours(hours, minutes, seconds, 0);

  return date.getTime() / 1000 + microseconds / 1_000_000;
}

/**
 * Format epoch as "YYMMDD HH:MM:SS.ffffff" - date-prefixed variant for contexts
 * where the buffer may span midnight (e.g. export time-range picker).
 */
export function formatEpochDated(epochSeconds: number): string {
  const timePart = manualFormatLong(epochSeconds);
  // sharedDate was already set inside manualFormatLong — reuse for date components
  const yy = String(sharedDate.getFullYear() % 100).padStart(2, '0');
  const mo = String(sharedDate.getMonth() + 1).padStart(2, '0');
  const dd = String(sharedDate.getDate()).padStart(2, '0');
  return `${yy}${mo}${dd} ${timePart}`;
}

/**
 * Parse "YYMMDD HH:MM:SS.ffffff" back into epoch seconds.
 * Accepts 1–6 fractional digits. Returns null if invalid.
 */
export function parseEpochDated(str: string): number | null {
  const match = str.match(/^(\d{2})(\d{2})(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\.(\d{1,6})$/);
  if (!match) return null;

  const year = 2000 + parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  const hours = parseInt(match[4], 10);
  const minutes = parseInt(match[5], 10);
  const seconds = parseInt(match[6], 10);
  const fracStr = match[7].padEnd(6, '0');
  const microseconds = parseInt(fracStr, 10);

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hours > 23 || minutes > 59 || seconds > 59) return null;

  const date = new Date(year, month - 1, day, hours, minutes, seconds, 0);
  // Validate that the date components round-trip (catches e.g. Feb 30)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return date.getTime() / 1000 + microseconds / 1_000_000;
}

/**
 * Format epoch as HH:MM:SS (no fractional seconds).
 * Used for chart axis ticks in history mode.
 */
export function formatEpochShort(epochSeconds: number): string {
  return currentMode === 'intl'
    ? intlFormatShort(epochSeconds)
    : manualFormatShort(epochSeconds);
}
