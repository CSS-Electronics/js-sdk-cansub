/**
 * Row-level TP category — coarser than per-frame `TpRole`. Used by the
 * Filter Panel to label a `(bus, arbId)` row when `tpMode` is on, and exposed
 * on `MessageInfo.tpType`. Per-frame distinctions (CM-BAM vs CM-RTS, DT seq,
 * etc.) are intentionally collapsed since a single carrier ID can serve
 * multiple sub-modes.
 *
 * - `ASSEMBLED` — assembled synthetic (any protocol)
 * - `CM`        — J1939 TP.CM carrier (PGN 0xEC00)
 * - `DT`        — J1939 TP.DT carrier (PGN 0xEB00)
 * - `ISO`       — ISO-TP carrier (rule rx ID)
 * - `FP`        — NMEA 2000 Fast Packet carrier
 *
 * Lives in `@csselectronics/can-types` (not `@csselectronics/can-tp`) because it's a UI
 * labeling primitive — the values are produced by TP runtime, but the type
 * is consumed by filter-state and view code that doesn't pull in TP itself.
 * `@csselectronics/can-tp/tp/TpMeta` re-exports this so existing `import { TpRowType }
 * from '.../tp/TpMeta'` sites keep working.
 */
export type TpRowType = 'ASSEMBLED' | 'CM' | 'DT' | 'ISO' | 'FP';
