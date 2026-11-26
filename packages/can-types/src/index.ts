/**
 * @csselectronics/can-types — Shared CAN domain types, formatters, and render-tick signals.
 *
 * Sits above `@csselectronics/websocket-client` (the wire-format layer) and below
 * `@csselectronics/can-pipeline` (the private aggregation engine). Contains the vocabulary
 * any consumer above raw parsing uses to talk about CAN data — filter-state
 * shapes, decoded-signal interfaces, summary types — plus J1939 / PGN helpers,
 * error formatters, and the 10 Hz `RenderSignals` UI tick.
 *
 * Useful for both standalone web apps (e.g. `web-app-sdk-cansub`) and webCAN
 * view plugins. Contains no proprietary aggregation logic.
 *
 * @module
 */

// ── Domain types ────────────────────────────────────────────────────────────
export type { ICanMessage, ICanSignal } from './types/DecodingTypes';
export type {
  FilterableItem,
  MessageInfo,
  SignalInfo,
  SortedKeyView,
} from './types/FilterTypes';
export type {
  SummaryBase,
  MessageSummary,
  SignalSummary,
  SignalValueMode,
} from './types/SummaryTypes';
export type { TpRowType } from './types/TpTypes';

// ── Utilities ───────────────────────────────────────────────────────────────
export { parseCanId, validateCanId } from './utils/CanIdParser';
export {
  extractPgn,
  extractSA,
  formatPgn,
  formatSA,
  pgnMaskFor,
} from './utils/j1939';
export { formatApiError } from './utils/ErrorFormatter';
export { signalUnitOrLabel } from './utils/valueLabel';
export { nameWithDescription } from './utils/nameWithDescription';

// ── Render-tick signals (used by UI consumers) ──────────────────────────────
export { RenderSignals } from './services/render/RenderSignals';
