import type { CanFrame } from '@csselectronics/websocket-client/models/CanFrame';

/**
 * Base statistics with derived rate fields.
 */
export interface SummaryBase  {
  totalFrames: number;
  firstEpoch: number;
  lastEpoch: number;
  framesPerSecond: number;
  windowStartEpoch: number;
  windowFrameCount: number;
  /**
   * Change token: a new (monotonically increasing) value on every mutation of
   * this summary. Optional so hand-built summaries remain valid.
   */
  revision?: number;
}

/**
 * Summary statistics for a specific CAN message (bus + arbitration ID combination)
 */
export interface MessageSummary extends SummaryBase {
  messageKey: string;              // "bus_arbitrationId" - unique identifier
  latestFrameId: number;           // frame.id (IDX column) - latest frame index
  latestLen: number;               // frame.len - declared byte length of latest frame (== data.length for non-RTR; == dlc2len(wire_dlc) for RTR)
  latestIde: boolean;              // frame.ide - extended ID flag of latest frame
  latestIsTx: boolean;             // frame.is_tx - transmission direction (true = TX)
  latestIsFd: boolean;             // frame.is_fd - CAN-FD frame flag
  latestIsBrs: boolean;            // frame.is_brs - bit rate switching (CAN-FD)
  latestIsEsi: boolean;            // frame.is_esi - error state indicator (CAN-FD)
  latestIsRtr: boolean;            // frame.is_rtr - remote transmission request
  latestData: Uint8Array;          // frame.data - raw bytes of latest frame
  isError: boolean;                // frame.is_error - error frame flag
  /** Latest frame ingested under this key. Lets Summary look up TP meta via `tpService.getMeta`. */
  latestFrame?: CanFrame;
}


/** Value display mode for the Summary panel decoded view */
export type SignalValueMode = 'LAST' | 'MIN' | 'AVG' | 'MAX';

/**
 * Base signal statistics (raw counters)
 */
export interface SignalSummary extends SummaryBase {
  signalKey: string;               // "CAN1_123_SignalName"
  minimumValue: number;            // Minimum decoded value (physical, NaN-safe)
  maximumValue: number;            // Maximum decoded value (physical, NaN-safe)
  latestValue: number;             // Latest decoded value (physical)
  valueSum: number;                // Running sum of valid (non-NaN) values
  valueCount: number;              // Count of valid (non-NaN) values
  latestFrameId: number;           // frame.id (IDX column) - latest frame index
  latestLen: number;               // frame.len - declared byte length of latest frame
  latestIde: boolean;              // frame.ide - extended ID flag of latest frame
  latestIsTx: boolean;             // frame.is_tx - transmission direction (true = TX)
  latestData: Uint8Array;          // frame.data - raw bytes of latest frame
}

