import type { ICanMessage, ICanSignal } from './DecodingTypes';
import type { CanBusName } from '@csselectronics/websocket-client/types/CanBusTypes';
import type { TpRowType } from './TpTypes';

/**
 * Base interface for filterable items (messages and signals)
 */
export interface FilterableItem {
  bus: CanBusName;
  displayLabel?: string;
  searchLabel?: string;
}

/**
 * MessageInfo — per-bucket metadata stored in `FilterSelectionService._availableMessages`,
 * keyed by `frame.key` (`${bus}_${arbId}_IDE<n>_DIR<n>_RTR<n>_TP<n>` for raw
 * / synthetic frames, `${bus}_ERR_${type}` for error frames).
 *
 * The fields split into three categories, intentionally distinct:
 *
 * ## (1) Identity dimensions — already in the key
 * `bus`, `arbId`, `ide`, `is_rtr`, `is_tx`, `synthetic` are encoded in
 * `frame.key` itself (the Map key into `_availableMessages`). They define
 * which physical frames bucket into the same row. They live in the key —
 * not as fields here.
 *
 * ## (2) Cached parsed copies — `isRtr`, `isTx`, `isSynthetic`
 * These boolean fields are the same data as the corresponding `RTR<n>` /
 * `DIR<n>` / `TP<n>` token in `frame.key`. They are kept here as a
 * pre-parsed convenience so the Filter Panel render path can read
 * `info.isRtr` instead of running `parseMessageKey(messageKey).isRtr` on
 * every render. `registerMessage` is the single site that writes both the
 * key and these booleans together, so they cannot drift in practice.
 * Removing them in favour of render-time parsing would also work; the
 * caching is a deliberate ergonomic choice, not a duplication.
 *
 * ## (3) Dynamic / derived annotations — `isTpCarrier`, `tpType`,
 *        `pgnFormatted`, `saFormatted`
 * These are **not** in `frame.key` and must live here:
 *  - `isTpCarrier` / `tpType` depend on the current TP rule set. Adding
 *    or removing a TP rule can flip a frame's carrier classification —
 *    if these were in the key, the same physical frame would shift to a
 *    different bucket when rules change. They are bucket-level
 *    *annotations* applied dynamically at registration time.
 *  - `pgnFormatted` / `saFormatted` are pure decompositions of `arbId`
 *    (PGN = `arbId & PDU_mask`, SA = `arbId & 0xFF` for ext J1939 IDs).
 *    Not independent dimensions; cached only to skip the bit math on every
 *    render.
 *
 * ### Subtle asymmetry: `isSynthetic` vs `isTpCarrier`
 * `isSynthetic` (≡ `TP1` in the key) is identity — synthetics get their
 * own bucket distinct from any same-arb raw frames. `isTpCarrier` is a
 * presentation flag — the raw carrier shares its `TP0` bucket with every
 * other non-synthetic frame at that arbId, but gets a ` TP` UI suffix
 * (when `tpMode` is on) so users can recognise it.
 */
export interface MessageInfo extends FilterableItem {
  /**
   * DBC message name for the grouped decode-view header (e.g. "EngineData").
   *
   * Set once by `registerSignal` (the decode path), NOT by `registerMessage`
   * (which has no DBC context). A real signal name always wins over the
   * synthetic "UNMATCHED", so a mux-partial bucket that saw both keeps the
   * real name on its header. Undefined in raw mode and until a bucket's first
   * signal decodes.
   *
   * Memory: this is per-bucket (one entry per unique message in
   * `_availableMessages`, never attached to `CanFrame`), and the value is the
   * same interned string the `CanMessage` DBC singleton already holds — a
   * pointer copy, not a new allocation. Zero per-frame cost.
   */
  messageName?: string;

  // ── (3) Dynamic / derived annotations ──────────────────────────────
  /** Pre-computed PGN hex (e.g. "0x00FEF1"). Undefined for standard 11-bit IDs and error frames. */
  pgnFormatted?: string;
  /** Pre-computed Source Address hex (e.g. "0x42"). Undefined for standard 11-bit IDs and error frames. */
  saFormatted?: string;

  // ── (2) Cached parsed copies of frame.key dimensions ───────────────
  /** Mirror of `RTR1` in `frame.key`. Render uses this; canonical source is the key. */
  isRtr?: boolean;
  /** Mirror of `DIR1` in `frame.key`. */
  isTx?: boolean;
  /** Mirror of `TP1` in `frame.key`. */
  isSynthetic?: boolean;

  // ── (3) Dynamic TP annotations ─────────────────────────────────────
  /**
   * Raw frame that matched an active TP rule (ISO-TP rx, NMEA-FP carrier,
   * or J1939 TP.CM/TP.DT). NOT in `frame.key` — carrier status is dynamic
   * (depends on the rule set, which the user can edit), so it's stored
   * here and re-applied when the rules change. `searchLabel` carries
   * `_tp` so users can search for TP messages regardless of `tpMode`;
   * the visible " TP" suffix is rendered by the Filter Panel only when
   * `tpMode` is on.
   */
  isTpCarrier?: boolean;
  /**
   * Row-level TP category (CM/DT/ISO/FP/ASSEMBLED), set at registration.
   * Filter Panel appends it after " TP" when `tpMode` is on. `searchLabel`
   * encodes the lowercase token so it's narrowable.
   */
  tpType?: TpRowType;
}

/**
 * SignalInfo — per-signal-key metadata. Signal keys have the format
 * `${frame.key}_${signal.name}`, so each `(bus, arbId, ide, dir, rtr,
 * synthetic) × signal-name` tuple gets a distinct entry. The `isRtr` /
 * `isTx` / `isSynthetic` mirrors here are category-(2) cached parsed
 * copies of the corresponding flags in the underlying `frame.key` (see
 * `MessageInfo` docblock). The Filter Panel uses them to render
 * ` RTR` / ` TX` / ` TP` suffixes on decoded signal rows in the same way
 * raw-mode message rows render them, so users can distinguish e.g. the
 * decoded `Speed` signal coming from a TX frame vs an RX frame.
 *
 * @property message - CanMessage singleton containing this signal
 * @property bus - Bus name where signal was seen
 * @property signal - CanSignal singleton
 */
export interface SignalInfo extends FilterableItem {
  message: ICanMessage;   // Required - signals always have a message definition
  signal: ICanSignal;
  formattedId: string;   // Full CAN ID formatted (e.g., "0x18FEF142") - from frame, not message
  /**
   * The canonical `frame.key` this signal was registered under (= the
   * 6-segment prefix of the signal key, without the trailing `_${name}`).
   * Cached so consumers — `activeMessageKeys` derivation, `selectFiltered`'s
   * decode-mode parent-key recovery — can look it up by Map.get instead of
   * walking 6 underscores in the signal-key string per signal. The string
   * is the same interned instance the `CanFrame` constructor produced
   * (passed through `registerSignal`'s `frameKey` parameter), so there's
   * no extra memory cost beyond the property slot.
   */
  frameKey: string;
  /**
   * Raw arbitration ID (the second arg `registerSignal` received). Cached
   * so consumers — CSV export's hex-ID column, future arbId-keyed lookups —
   * can read it directly instead of running `parseSignalId(...)` to recover
   * it from the signal-key string. Same self-documenting pattern as
   * `frameKey` and `formattedId`.
   */
  arbId: number;
  /** Mirror of `RTR1` in the underlying `frame.key`. Cached for render ergonomics. */
  isRtr?: boolean;
  /** Mirror of `DIR1` in the underlying `frame.key`. */
  isTx?: boolean;
  /** Mirror of `TP1` in the underlying `frame.key`. True when the signal was first seen on a TP-assembled synthetic. */
  isSynthetic?: boolean;
}

/**
 * Lightweight lazily-materialised view over a sorted collection of keys.
 *
 * Backed by either an OrderedSet (fast path - O(log N) random access,
 * zero materialisation cost on publish) or a pre-filtered array (slow path).
 * Lets FilterPanel/SummaryPanel render virtualised rows without forcing a
 * full tree-to-array materialisation on every flush tick.
 */
export interface SortedKeyView {
  readonly size: number;
  /** O(log N) for tree-backed, O(1) for array-backed. */
  at(index: number): string | undefined;
  /** Returns a freshly-allocated array. Used by virtualised row renderers. */
  slice(start: number, end: number): string[];
  [Symbol.iterator](): IterableIterator<string>;
  /** Materialises the whole view as an array. Convenience for tests/exports;
   *  do not use on per-frame hot paths. */
  toArray(): string[];
}

/**
 * Row kind in the grouped decode-mode Filter view.
 * `Message` = a CAN message header row; `Signal` = one of its signal rows.
 */
export enum GroupedRowKind {
  Message = 0,
  Signal = 1,
}

/**
 * Indexable view over the flattened grouped decode list (message-header rows
 * interleaved with their signal rows), produced by
 * `FilterSelectionService.groupedFilterItems` in Decode mode.
 *
 * Parallel-array backed to minimise allocation during the initial-discovery
 * burst: `keyAt(i)` returns a `messageKey` when `kindAt(i) === Message`, else a
 * `signalKey`. The backing `keys` array holds references to the already-interned
 * key strings (no new string allocation) and `kinds` is a `Uint8Array`
 * (1 byte/row). `size`/`kindAt`/`keyAt` are all O(1). Mirrors the minimal
 * surface the virtual-scroll renderer needs.
 */
export interface GroupedFilterView {
  readonly size: number;
  kindAt(index: number): GroupedRowKind;
  keyAt(index: number): string;
}

/**
 * Tri-state of a message-header checkbox in the grouped decode view:
 * every signal selected / none selected / some selected (indeterminate).
 */
export type MessageCheckState = 'checked' | 'unchecked' | 'partial';
