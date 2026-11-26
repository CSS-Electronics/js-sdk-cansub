/**
 * TxSchedule - compact, transferable description of a timed WebSocket-TX job.
 *
 * This is the generic unit the {@link TxScheduler} plays back: a list of frames
 * (in transmit order) with pre-encoded message bodies and per-frame timing/bus
 * metadata, plus options controlling pacing, routing and looping. Playback builds
 * one of these from a loaded CSV clip, but any future client-driven WS TX feature
 * (signal generators, scripted bursts, ...) can build one too.
 *
 * Layout is columnar (one typed array per field), so a schedule is compact and cheap to
 * structured-clone to the worker on load. The clone is deliberate: the caller's arrays
 * (the loaded clip) stay intact for replays. A Transferable-based zero-copy handover is
 * possible if a one-shot consumer ever needs it, but no current consumer does.
 *
 *   frame i:
 *     tOffsetUs[i]  - recorded offset from the first frame, microseconds
 *     bus[i]        - 1..4 (used only when options.targetBus === 'fromFile')
 *     body bytes    - bodies[bodyOffset[i] .. bodyOffset[i] + bodyLen[i])
 *
 * `body` = the pre-encoded per-frame message body (timestamp+flags+id+data, no
 * CRC/HDLC) from `encodeTxFrameBody`. The scheduler concatenates the bodies of a
 * batch and wraps them in a single HDLC frame (shared CRC) in the hot send loop.
 */

import type { CanBusName } from "../types/CanBusTypes";

/** Options controlling how a schedule is paced, routed and looped. */
export interface TxScheduleOptions {
  /** Restart from the top when the schedule completes. */
  loop: boolean;
  /** Gap (ms) inserted between loop iterations (only used when `loop`). */
  interFileSpacingMs: number;
  /**
   * Fixed spacing between consecutive frames in microseconds, or `null` to use
   * the recorded `tOffsetUs` deltas ("as in file"). A value at/below the pacing
   * floor (~100 us, including 0) means "as fast as possible" (burst).
   */
  fixedSpacingUs: number | null;
  /**
   * Skip recorded idle gaps longer than this many microseconds; the excess is
   * subtracted from the timing anchor so subsequent frames keep their relative
   * spacing. `null` = never skip (preserve all gaps). Ignored for fixed spacing.
   */
  skipGapUs: number | null;
  /** Route every frame to this bus, or `'fromFile'` to use each frame's own `bus[i]`. */
  targetBus: CanBusName | "fromFile";
  /** Playback speed multiplier (1 = realtime, 2 = twice as fast). Must be > 0. */
  speed: number;
}

/** Default options: play the recorded timing on the file's own buses, once, at 1x. */
export const DEFAULT_TX_SCHEDULE_OPTIONS: TxScheduleOptions = {
  loop: false,
  interFileSpacingMs: 0,
  fixedSpacingUs: null,
  skipGapUs: null,
  targetBus: "fromFile",
  speed: 1,
};

/** Compact, transferable schedule. All typed arrays have length `frameCount`. */
export interface TxSchedule {
  /** Number of frames. */
  frameCount: number;
  /** Per-frame offset from the first frame (µs), monotonic non-decreasing. */
  tOffsetUs: Float64Array;
  /** Per-frame source bus 1..4 (used when options.targetBus === 'fromFile'). */
  bus: Uint8Array;
  /** Concatenated pre-encoded message bodies (encodeTxFrameBody output). */
  bodies: Uint8Array;
  /** Per-frame start offset into `bodies`. */
  bodyOffset: Uint32Array;
  /** Per-frame body length within `bodies` (a CAN body is <= 75 bytes). */
  bodyLen: Uint16Array;
  /** Pacing/routing/loop options. */
  options: TxScheduleOptions;
}
