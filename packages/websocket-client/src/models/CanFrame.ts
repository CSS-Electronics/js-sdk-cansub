import type { CanBusName } from "../types/CanBusTypes";
import { formatCanId, formatDataBytes, formatFlags } from "../utils/DataFormatter";
import { formatEpochLong } from "../utils/EpochFormatter";
import { getErrorTypeName } from "./CanErrorTypes";

/**
 * Interned bus string constants to save memory
 * All frames reference these 4 shared string instances
 */
export const BUS_INTERN = {
  CAN1: 'CAN1' as CanBusName,
  CAN2: 'CAN2' as CanBusName,
  CAN3: 'CAN3' as CanBusName,
  CAN4: 'CAN4' as CanBusName,
} as const;


/**
 * CAN frame received from the device.
 *
 * Display strings are computed on-demand via getter methods rather than
 * stored, since only a small subset of frames is rendered at any time.
 */
export class CanFrame {
  /** Unique frame ID for UI keys */
  readonly id: number;
  /**
   * Canonical frame identity, used by every per-bucket consumer (Stats
   * Maps, Filter Panel rows, storage filter predicate, decoded-signal
   * cache, byte heatmap, signal-key prefix).
   *
   * Format:
   *   - Normal frames: `${bus}_${arbId}_IDE<0|1>_DIR<0|1>_RTR<0|1>_TP<0|1>`
   *   - Error frames:  `${bus}_ERR_${type}` (no IDE/DIR/RTR/TP suffix —
   *     error frames have no CAN-message semantics for those dimensions
   *     and we use the symbolic `_ERR_` slot to avoid namespace collision
   *     with real CAN frames at the matching numeric arbId, e.g. 0x0).
   *
   * Bit allocation in the flag suffix (always present for normal frames,
   * fixed positions so `parseMessageKey` is unambiguous):
   *   - `IDE<n>`: 0 = standard 11-bit, 1 = extended 29-bit
   *   - `DIR<n>`: 0 = RX, 1 = TX
   *   - `RTR<n>`: 0 = data frame, 1 = remote-transmission request
   *   - `TP<n>`:  0 = raw / wire frame, 1 = TP-assembled synthetic
   *
   * DBC matching does **not** consult `key` — it uses the `(arbId, ide)`
   * pair via `DbcDefinition.getMessageInfo(arbId, isExtended)`. So `key`
   * captures display / row identity, not DBC-message identity. A given
   * DBC message may decode frames from up to 8 different `key` buckets
   * (TX×RX × RTR×non-RTR × raw×synthetic, though RTR/synthetic combos are
   * rare in practice).
   *
   * Interned per `(bus, arbId, flagByte)` tuple — see `keyCache`.
   * Use `buildKey` / `parseMessageKey` for the format.
   */
  readonly key: string;
  /** Interned string (references BUS_INTERN) */
  readonly bus: CanBusName;
  /** CAN ID */
  readonly arbitration_id: number;
  /** Timestamp */
  readonly epoch: number;
  /** Raw data bytes */
  readonly data: Uint8Array;
  /** Extended ID flag */
  readonly ide: boolean;
  /**
   * Declared payload byte length. For non-RTR frames `len === data.length`.
   * For RTR `len === dlc2len(wire_dlc)` (the requested length) while
   * `data.length === 0`. Use `len` for displays / summaries / CSV; use
   * `data.length` only when iterating or bounds-checking the actual buffer
   * (byte rendering, signal decoding, memory budgeting).
   */
  readonly len: number;
  readonly is_tx: boolean;      // Transmission direction (true = TX, false = RX)
  readonly is_fd: boolean;      // CAN-FD frame
  readonly is_brs: boolean;     // Bit rate switching (CAN-FD only)
  readonly is_esi: boolean;     // Error state indicator (CAN-FD only)
  readonly is_rtr: boolean;     // Remote transmission request (classic CAN only)
  readonly is_error: boolean;   // Error frame indicator
  /**
   * True for TP-assembled synthetics from `TpAssemblyEngine`. Flows through
   * the same ingestion pipeline as raw frames but bypasses the global
   * total counter (StatisticsService) and the ByteHeatmapService so
   * raw counts + heatmap stay raw-only.
   */
  readonly synthetic: boolean;
  /** Decoded signal keys (shared across frames via DecodingService cache) */
  private _signalKeys?: readonly string[];
  /** Decoded signal values (Float64Array, one per frame) */
  private _signalValues?: Float64Array;
  /** True when real per-frame decoded signals are attached (not shared UNMATCHED) */
  private _isDecoded = false;

  /**
   * Interned `key` strings: keyed by bus → arbId → flag byte
   * `(ide?1:0) | (isTx?2:0) | (rtr?4:0) | (synthetic?8:0)`. 16 possible
   * flag values per `(bus, arbId)` tuple. Normal-frame keys live here.
   */
  private static keyCache = new Map<CanBusName, Map<number, Map<number, string>>>();
  /**
   * Separate key cache for error frames (`${bus}_ERR_${type}`) to avoid
   * namespace collision with real CAN frames at the matching numeric arbId.
   */
  private static errorKeyCache = new Map<CanBusName, Map<number, string>>();

  constructor(
    id: number,
    bus: CanBusName,
    arbitration_id: number,
    epoch: number,
    data: Uint8Array,
    ide: boolean,
    len: number,
    is_tx: boolean = false,
    is_fd: boolean = false,
    is_brs: boolean = false,
    is_esi: boolean = false,
    is_rtr: boolean = false,
    is_error: boolean = false,
    synthetic: boolean = false
  ) {
    this.id = id;
    this.bus = bus;
    this.arbitration_id = arbitration_id;
    this.epoch = epoch;
    this.data = data;
    this.ide = ide;
    this.len = len;
    this.is_tx = is_tx;
    this.is_fd = is_fd;
    this.is_brs = is_brs;
    this.is_esi = is_esi;
    this.is_rtr = is_rtr;
    this.is_error = is_error;
    this.synthetic = synthetic;
    if (is_error) {
      let perBus = CanFrame.errorKeyCache.get(bus);
      if (!perBus) { perBus = new Map(); CanFrame.errorKeyCache.set(bus, perBus); }
      let cached = perBus.get(arbitration_id);
      if (!cached) { cached = `${bus}_ERR_${getErrorTypeName(arbitration_id)}`; perBus.set(arbitration_id, cached); }
      this.key = cached;
    } else {
      // Intern `key` per (bus, arbId, flagByte). 4-bit packed flags:
      // bit 0 = ide, bit 1 = isTx, bit 2 = isRtr, bit 3 = synthetic.
      const flagByte =
        (ide ? 1 : 0) |
        (is_tx ? 2 : 0) |
        (is_rtr ? 4 : 0) |
        (synthetic ? 8 : 0);
      let perBus = CanFrame.keyCache.get(bus);
      if (!perBus) { perBus = new Map(); CanFrame.keyCache.set(bus, perBus); }
      let perArb = perBus.get(arbitration_id);
      if (!perArb) { perArb = new Map(); perBus.set(arbitration_id, perArb); }
      let cached = perArb.get(flagByte);
      if (!cached) {
        cached =
          `${bus}_${arbitration_id}` +
          `_IDE${ide ? 1 : 0}` +
          `_DIR${is_tx ? 1 : 0}` +
          `_RTR${is_rtr ? 1 : 0}` +
          `_TP${synthetic ? 1 : 0}`;
        perArb.set(flagByte, cached);
      }
      this.key = cached;
    }
  }

  /**
   * Format CAN ID as hex string
   * @returns "0x123" for standard IDs (3 hex digits), "0x00001234" for extended IDs (8 hex digits)
   */
  getIdFormatted(): string {
    if (this.is_error) return 'ERR:' + getErrorTypeName(this.arbitration_id);
    return formatCanId(this.arbitration_id, this.ide);
  }

  /**
   * Format timestamp as HH:MM:SS.ffffff (microsecond precision)
   * @returns "14:32:15.123456"
   */
  getTimeFormatted(): string {
    return CanFrame.formatEpoch(this.epoch);
  }

  /**
   * Get direction as formatted string
   * @returns "TX" for transmitted, "RX" for received
   */
  getDirectionFormatted(): string {
    if (this.is_error) return '';
    return this.is_tx ? "TX" : "RX";
  }

  /**
   * Get combined flags as space-separated string
   * @returns e.g. "FD BRS ESI", "RTR", "FD BRS", or "" for standard frames
   */
  getFlagsFormatted(): string {
    if (this.is_error) return '';
    return formatFlags(this.is_fd, this.is_brs, this.is_esi, this.is_rtr);
  }

  /**
   * Get data as formatted hex string, or "Error frame" for error frames
   * @returns e.g. "01 02 AB FF" or "Error frame"
   */
  getDataFormatted(): string {
    if (this.is_error) return '';
    return formatDataBytes(this.data);
  }

  // ============================================================================
  // Memory estimation
  // ============================================================================

  /**
   * Estimate heap memory consumed by this frame (bytes).
   * Used by FullFrameStorageService for byte-based eviction budgeting.
   *
   * Formula (derived from V8 heap measurements at 2M frames):
   *   Raw:     242 + data.length
   *   Decoded: 242 + data.length + 130 + signalCount * 8
   *
   * 242 = CanFrame object overhead, 130 = per-frame decode overhead
   * (Float64Array + ArrayBuffer headers), 8 = per-signal float64 value.
   * UNMATCHED synthetic signals use shared keys/values, so no decode overhead.
   */
  estimateBytes(): number {
    const base = 242 + this.data.length;
    if (!this._isDecoded) return base;
    return base + 130 + this.getSignalCount() * 8;
  }

  // ============================================================================
  // Decoded Signals API (memory-optimized parallel arrays)
  // ============================================================================

  /** Check if frame has decoded signals */
  hasDecodedSignals(): boolean {
    return this._signalKeys !== undefined && this._signalKeys.length > 0;
  }

  /** Get decoded value for a specific signal ID (linear search, fast for n < 10) */
  getSignalValue(signalId: string): number | undefined {
    if (!this._signalKeys || !this._signalValues) return undefined;
    const idx = this._signalKeys.indexOf(signalId);
    return idx >= 0 ? this._signalValues[idx] : undefined;
  }

  /** Get all signal keys (readonly) */
  getSignalKeys(): readonly string[] {
    return this._signalKeys ?? [];
  }

  /** Get number of decoded signals */
  getSignalCount(): number {
    return this._signalKeys?.length ?? 0;
  }

  /** Get decoded signal value by index (0-based). No bounds checking. */
  getSignalValueByIndex(i: number): number {
    return this._signalValues![i];
  }

  /** Set decoded signals (called once by DecodingService) */
  setDecodedSignals(keys: string[], values: Float64Array): void {
    this._signalKeys = keys;
    this._signalValues = values;
    this._isDecoded = true;
  }

  /** Assign shared decoded signals (e.g. UNMATCHED synthetic). Zero per-frame allocation. */
  setDecodedSignalsDirect(keys: readonly string[], values: Float64Array): void {
    this._signalKeys = keys;
    this._signalValues = values;
  }

  /** Format epoch (seconds) as HH:MM:SS.ffffff with microsecond precision. */
  public static formatEpoch(epochSeconds: number): string {
    return formatEpochLong(epochSeconds);
  }

}

// ============================================================================
// Key-format helpers — single source of truth for `CanFrame.key` and
// decoded `signalKey` formats. (`CanFrame.key` and signalKey share the
// same encoding: `signalKey = ${frame.key}_${signal.name}`.)
// ============================================================================

/**
 * Build a `frame.key`-format string for a normal (non-error) frame:
 * `${bus}_${arbId}_IDE<0|1>_DIR<0|1>_RTR<0|1>_TP<0|1>`.
 *
 * Does **not** cover error frames — those use `${bus}_ERR_${type}` and are
 * never built via this helper (the `CanFrame` constructor handles them
 * directly via `errorKeyCache`).
 */
export function buildKey(
  bus: CanBusName,
  arbId: number,
  ide: boolean,
  isRtr: boolean,
  isTx: boolean,
  synthetic: boolean,
): string {
  return (
    `${bus}_${arbId}` +
    `_IDE${ide ? 1 : 0}` +
    `_DIR${isTx ? 1 : 0}` +
    `_RTR${isRtr ? 1 : 0}` +
    `_TP${synthetic ? 1 : 0}`
  );
}

/** Result of `parseMessageKey`. `arbId` is `NaN` for error keys. */
export interface ParsedMessageKey {
  bus: CanBusName;
  arbId: number;
  ide: boolean;
  isTx: boolean;
  isRtr: boolean;
  isSynthetic: boolean;
  isError: boolean;
}

/**
 * Parse a `frame.key` / `messageKey` string back into its components.
 *
 * Accepts both normal-form (`CAN1_273_IDE0_DIR0_RTR0_TP0`) and error-form
 * (`CAN1_ERR_BIT`). For unknown / malformed input returns a best-effort
 * result with `arbId = NaN` so callers can detect failure.
 */
export function parseMessageKey(messageKey: string): ParsedMessageKey {
  const firstUs = messageKey.indexOf('_');
  if (firstUs < 0) {
    return { bus: messageKey as CanBusName, arbId: NaN, ide: false, isTx: false, isRtr: false, isSynthetic: false, isError: false };
  }
  const bus = messageKey.substring(0, firstUs) as CanBusName;
  const rest = messageKey.substring(firstUs + 1);

  if (rest.startsWith('ERR_')) {
    return { bus, arbId: NaN, ide: false, isTx: false, isRtr: false, isSynthetic: false, isError: true };
  }

  // Expected: "${arbId}_IDE<0|1>_DIR<0|1>_RTR<0|1>_TP<0|1>"
  const parts = rest.split('_');
  if (parts.length < 5) {
    return { bus, arbId: NaN, ide: false, isTx: false, isRtr: false, isSynthetic: false, isError: false };
  }
  const arbId = parseInt(parts[0], 10);
  const ide = parts[1] === 'IDE1';
  const isTx = parts[2] === 'DIR1';
  const isRtr = parts[3] === 'RTR1';
  const isSynthetic = parts[4] === 'TP1';
  return { bus, arbId, ide, isTx, isRtr, isSynthetic, isError: false };
}
