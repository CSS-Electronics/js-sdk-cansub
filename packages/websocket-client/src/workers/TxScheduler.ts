/**
 * TxScheduler - generic timed WebSocket-TX engine (the reusable heart of playback
 * and any future client-driven WS TX feature).
 *
 * Plays back a {@link TxSchedule}: paces frames against a monotonic clock, coalesces
 * all frames due at a given moment into one HDLC batch per bus (shared CRC), and
 * honors socket backpressure. It is fully environment-agnostic - the clock, the
 * byte sink, the buffered-amount probe and the timer are all injected - so the same
 * code runs inside `CommunicationWorker` (real WebSocket), in a Node harness against
 * a real device, and in unit tests driven by a fake clock.
 *
 * Timing model (mirrors python-can's `MessageSync`):
 *  - Absolute-time anchoring: each frame's target wall time is `anchor + schedOffset`,
 *    NOT a cumulative sleep, so a late tick never pushes later frames (self-correcting).
 *  - ~100 us floor: gaps below the floor are not waited on - the frames burst out as
 *    fast as the socket accepts, which is how sub-ms spacing / 5K fps is achieved.
 *  - Optional skip of long idle gaps (excess subtracted from the anchor).
 *
 * See {@link TxSchedule} for the schedule format.
 */

import type { CanBusName } from "../types/CanBusTypes";
import { encodeHdlcFrame } from "../protocol/CANSubProtocol";
import type { TxSchedule, TxScheduleOptions } from "../protocol/TxSchedule";

/** Opaque timer handle returned by the injected `setTimer`. */
export type TxTimer = unknown;

export type TxStatus = "idle" | "playing" | "paused" | "complete";

/** Snapshot of playback progress, emitted (throttled) via `onProgress`. */
export interface TxProgress {
  status: TxStatus;
  /** Index of the next frame to send within the current pass (0..frameCount). */
  index: number;
  /** Total frames sent across all loop iterations. */
  sentCount: number;
  /** Times sending was held because a bus socket was congested. */
  underruns: number;
  /** Largest `bufferedAmount` observed on any bus (bytes). */
  maxBufferedBytes: number;
  /** Synchronous send failures. */
  txErrors: number;
  /** Completed loop iterations. */
  loopIteration: number;
}

/** Injected environment for the scheduler. */
export interface TxSchedulerDeps {
  /** Monotonic clock in milliseconds (e.g. `performance.now`). */
  now: () => number;
  /** Write pre-framed HDLC bytes to a bus. May throw; the scheduler counts + reports it. */
  send: (bus: CanBusName, bytes: Uint8Array) => void;
  /** Current outgoing buffered bytes for a bus (e.g. `WebSocket.bufferedAmount`); 0 if unknown. */
  bufferedAmount: (bus: CanBusName) => number;
  /** Schedule `cb` after `ms` (e.g. `setTimeout`). */
  setTimer: (cb: () => void, ms: number) => TxTimer;
  /** Cancel a previously scheduled callback. */
  clearTimer: (h: TxTimer) => void;
  /**
   * Backpressure threshold (bytes): hold sending on a bus whose socket has more
   * than this buffered. This is the determinism-vs-throughput knob - a tighter
   * value keeps less in flight (so a fast link can't overflow the device's TX
   * queue), a looser value keeps a high-latency link (e.g. LTE) fuller. Defaults
   * to MAX_BUFFERED.
   */
  maxBufferedBytes?: number;
  onProgress?: (p: TxProgress) => void;
  onComplete?: () => void;
  onError?: (message: string) => void;
}

// Tunables ------------------------------------------------------------------

/** Gaps below this (ms) are not waited on - frames burst out (100 us). */
const FLOOR_MS = 0.1;
/** Coalesce a bus batch up to this many body bytes before flushing (near MTU). */
const FLUSH_BYTES = 1200;
/**
 * Default backpressure threshold: hold sending on a bus whose socket has more than
 * this many buffered bytes. Standalone default for the package; the webCAN app
 * overrides it from `WS_TX_MAX_BUFFERED_BYTES` (Constants.ts) via WorkerBridge.init.
 * A tight value paces delivery to the device's real intake so its TX queue can't
 * overflow on a fast link (loss-free); a looser value better fills a high-latency
 * link. 8 KB is loss-free at full bus rate on low-latency links (validated on USB).
 */
const MAX_BUFFERED = 8 * 1024;
/** Max synchronous work per pump before yielding to the event loop. */
const TICK_BUDGET_MS = 8;
/** Retry delay after a backpressure hold. */
const BACKPRESSURE_RETRY_MS = 4;
/** Throttle progress emits to ~10 Hz. */
const PROGRESS_INTERVAL_MS = 100;
/** Cap a scheduled wait so progress still ticks during long idle gaps. */
const PROGRESS_MAX_WAIT_MS = 100;

const BUS_NAMES: readonly CanBusName[] = ["CAN1", "CAN2", "CAN3", "CAN4"];

interface BusBatch {
  buf: Uint8Array;
  len: number;
}

export class TxScheduler {
  private readonly deps: TxSchedulerDeps;

  private schedule: TxSchedule | null = null;
  private opts: TxScheduleOptions | null = null;

  private status: TxStatus = "idle";
  private cursor = 0;

  /** Wall time (ms) corresponding to schedule-offset 0 of the current pass. */
  private anchorMs = 0;
  /** Schedule offset (µs, speed/skip-adjusted) of the frame at `cursor`. */
  private pendingOffsetUs = 0;
  /** Accumulated skipped idle time (µs) up to `cursor`. */
  private skippedUs = 0;
  /**
   * Schedule elapsed time (ms) captured at pause, so resume preserves the remaining gap.
   * Negative while paused inside a loop's inter-file gap (the anchor sits in the future);
   * resume() then re-establishes the same future anchor so the remaining gap is honored.
   */
  private pausedElapsedMs = 0;

  private sentCount = 0;
  private underruns = 0;
  private maxBufferedBytes = 0;
  private txErrors = 0;
  private loopIteration = 0;
  /** True while holding on a congested socket (so underruns count rising edges, not retries). */
  private congestedHold = false;

  private lastProgressMs = -Infinity;
  /** Last emitted snapshot, to skip redundant periodic posts while nothing changes. */
  private lastEmitted: TxProgress | null = null;
  private timer: TxTimer | null = null;

  private readonly batches = new Map<CanBusName, BusBatch>();
  private maxBuffered: number;

  constructor(deps: TxSchedulerDeps) {
    this.deps = deps;
    this.maxBuffered = deps.maxBufferedBytes && deps.maxBufferedBytes > 0 ? deps.maxBufferedBytes : MAX_BUFFERED;
  }

  /** Update the backpressure threshold (bytes). Used by the worker to apply the app config. */
  setMaxBufferedBytes(bytes: number): void {
    if (bytes > 0) this.maxBuffered = bytes;
  }

  // --- Public control API ---------------------------------------------------

  /** Load (or replace) the schedule. Resets to idle at frame 0. */
  load(schedule: TxSchedule): void {
    this.clearTimer();
    this.schedule = schedule;
    this.opts = { ...schedule.options, speed: schedule.options.speed > 0 ? schedule.options.speed : 1 };
    this.status = "idle";
    this.cursor = 0;
    this.resetCounters();
    this.computeOffsetAt(0);
    // Emit so consumers never sit on the previous job's snapshot (e.g. "complete").
    this.emitProgress();
  }

  /** Begin playing from the current cursor (0 unless `seek` moved it). Resets counters. */
  start(): void {
    if (!this.schedule) return;
    this.clearTimer();
    this.status = "playing";
    this.resetCounters();
    this.computeOffsetAt(this.cursor);
    this.anchorMs = this.deps.now() - this.pendingOffsetUs / 1000;
    this.emitProgress();
    this.pump();
  }

  /** Pause at the current position, remembering how far into the timeline we are. */
  pause(): void {
    if (this.status !== "playing") return;
    this.clearTimer();
    this.flushAll();
    // Deliberately unclamped: a negative value means we paused while waiting out a
    // loop's inter-file gap, and resume() must keep honoring the remaining gap
    // (clamping to 0 would fire the next pass immediately on resume).
    this.pausedElapsedMs = this.deps.now() - this.anchorMs;
    this.status = "paused";
    this.emitProgress();
  }

  /** Resume from a paused position, preserving the remaining gap to the next frame. */
  resume(): void {
    if (this.status !== "paused" || !this.schedule) return;
    this.status = "playing";
    this.anchorMs = this.deps.now() - this.pausedElapsedMs;
    this.emitProgress();
    this.pump();
  }

  /** Jump to `index`; keeps playing if playing, otherwise positions while paused. */
  seek(index: number): void {
    // Reject non-finite input (NaN would corrupt the cursor); this is a reusable
    // primitive, so do not rely on callers sanitizing.
    if (!this.schedule || !Number.isFinite(index)) return;
    const clamped = Math.max(0, Math.min(Math.floor(index), this.schedule.frameCount));
    this.clearTimer();
    this.cursor = clamped;
    this.computeOffsetAt(clamped);
    if (this.status === "playing") {
      // Jump: the target frame becomes due immediately.
      this.anchorMs = this.deps.now() - this.pendingOffsetUs / 1000;
      this.emitProgress();
      this.pump();
    } else {
      // Positioned while paused: elapsed reflects the seeked frame's offset.
      this.status = "paused";
      this.pausedElapsedMs = this.pendingOffsetUs / 1000;
      this.emitProgress();
    }
  }

  /** Stop and reset to idle at frame 0 (schedule stays loaded). */
  stop(): void {
    this.clearTimer();
    this.discardBatches();
    this.status = "idle";
    this.cursor = 0;
    this.resetCounters();
    if (this.schedule) this.computeOffsetAt(0);
    this.emitProgress();
  }

  getStatus(): TxStatus {
    return this.status;
  }

  // --- Timing core ----------------------------------------------------------

  private pump = (): void => {
    this.timer = null;
    if (this.status !== "playing" || !this.schedule || !this.opts) return;
    const s = this.schedule;
    const startNow = this.deps.now();
    let now = startNow;
    let congested = false;

    while (this.cursor < s.frameCount) {
      const targetMs = this.anchorMs + this.pendingOffsetUs / 1000;
      const waitMs = targetMs - now;
      if (waitMs > FLOOR_MS) {
        // Next frame is not due yet - flush what we have and sleep until it is.
        this.flushAll();
        this.scheduleTick(waitMs);
        this.maybeProgress(now);
        return;
      }

      const bus = this.resolveBus(this.cursor);
      const buffered = this.deps.bufferedAmount(bus);
      if (buffered > this.maxBufferedBytes) this.maxBufferedBytes = buffered;
      if (buffered > this.maxBuffered) {
        // Socket congested - hold and retry shortly.
        congested = true;
        break;
      }
      this.congestedHold = false;

      const batch = this.batchFor(bus);
      this.appendBody(batch, s.bodies, s.bodyOffset[this.cursor], s.bodyLen[this.cursor]);
      if (batch.len >= FLUSH_BYTES) this.flush(bus, batch);

      this.cursor++;
      this.sentCount++;
      this.advanceOffset();

      // Keep the worker responsive during long "as fast as possible" bursts.
      if ((this.sentCount & 0x3f) === 0) {
        now = this.deps.now();
        if (now - startNow > TICK_BUDGET_MS) {
          this.flushAll();
          this.scheduleTick(0);
          this.maybeProgress(now);
          return;
        }
      }
    }

    this.flushAll();

    if (congested) {
      // Count and surface an underrun on the rising edge only (not every retry).
      if (!this.congestedHold) {
        this.congestedHold = true;
        this.underruns++;
        this.emitProgress(this.deps.now());
      }
      this.scheduleTick(BACKPRESSURE_RETRY_MS);
      return;
    }

    // End of pass reached.
    if (this.opts.loop) {
      this.loopIteration++;
      this.cursor = 0;
      this.computeOffsetAt(0);
      this.anchorMs = this.deps.now() + this.opts.interFileSpacingMs;
      this.emitProgress();
      this.scheduleTick(this.opts.interFileSpacingMs);
      return;
    }

    this.status = "complete";
    this.emitProgress();
    this.deps.onComplete?.();
  };

  /** Recompute `pendingOffsetUs` for the current `cursor` (incremental, called after advance). */
  private advanceOffset(): void {
    const s = this.schedule!;
    const opts = this.opts!;
    const i = this.cursor;
    if (i >= s.frameCount) return;
    if (opts.fixedSpacingUs !== null) {
      this.pendingOffsetUs += opts.fixedSpacingUs / opts.speed;
      return;
    }
    const gapUs = s.tOffsetUs[i] - s.tOffsetUs[i - 1];
    if (opts.skipGapUs !== null && gapUs > opts.skipGapUs) {
      this.skippedUs += gapUs - opts.skipGapUs;
    }
    this.pendingOffsetUs = (s.tOffsetUs[i] - this.skippedUs) / opts.speed;
  }

  /** Compute `pendingOffsetUs` + `skippedUs` for an arbitrary index (for seek/start). */
  private computeOffsetAt(index: number): void {
    const s = this.schedule!;
    const opts = this.opts!;
    this.skippedUs = 0;
    if (index <= 0 || index >= s.frameCount) {
      // At the start (or at/after the end, where the pump immediately ends the
      // pass) the offset base is 0.
      this.pendingOffsetUs = 0;
      return;
    }
    if (opts.fixedSpacingUs !== null) {
      this.pendingOffsetUs = (index * opts.fixedSpacingUs) / opts.speed;
      return;
    }
    if (opts.skipGapUs === null) {
      this.pendingOffsetUs = s.tOffsetUs[index] / opts.speed;
      return;
    }
    // Skip enabled: walk to accumulate skipped idle time up to `index`.
    let skipped = 0;
    for (let i = 1; i <= index; i++) {
      const gap = s.tOffsetUs[i] - s.tOffsetUs[i - 1];
      if (gap > opts.skipGapUs) skipped += gap - opts.skipGapUs;
    }
    this.skippedUs = skipped;
    this.pendingOffsetUs = (s.tOffsetUs[index] - skipped) / opts.speed;
  }

  private resolveBus(i: number): CanBusName {
    const opts = this.opts!;
    if (opts.targetBus !== "fromFile") return opts.targetBus;
    return BUS_NAMES[this.schedule!.bus[i] - 1] ?? BUS_NAMES[0];
  }

  // --- Batching / flushing --------------------------------------------------

  private batchFor(bus: CanBusName): BusBatch {
    let b = this.batches.get(bus);
    if (!b) {
      b = { buf: new Uint8Array(FLUSH_BYTES + 128), len: 0 };
      this.batches.set(bus, b);
    }
    return b;
  }

  private appendBody(b: BusBatch, bodies: Uint8Array, off: number, len: number): void {
    if (b.len + len > b.buf.length) {
      const grown = new Uint8Array(Math.max(b.buf.length * 2, b.len + len));
      grown.set(b.buf.subarray(0, b.len));
      b.buf = grown;
    }
    b.buf.set(bodies.subarray(off, off + len), b.len);
    b.len += len;
  }

  private flush(bus: CanBusName, b: BusBatch): void {
    if (b.len === 0) return;
    try {
      this.deps.send(bus, encodeHdlcFrame(b.buf.subarray(0, b.len)));
    } catch (e) {
      this.txErrors++;
      this.deps.onError?.(e instanceof Error ? e.message : String(e));
    }
    b.len = 0;
  }

  private flushAll(): void {
    for (const [bus, b] of this.batches) if (b.len > 0) this.flush(bus, b);
  }

  private discardBatches(): void {
    for (const b of this.batches.values()) b.len = 0;
  }

  // --- Progress / timer -----------------------------------------------------

  private scheduleTick(delayMs: number): void {
    this.clearTimer();
    const d = delayMs <= FLOOR_MS ? 0 : Math.min(delayMs, PROGRESS_MAX_WAIT_MS);
    this.timer = this.deps.setTimer(this.pump, d);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      this.deps.clearTimer(this.timer);
      this.timer = null;
    }
  }

  private maybeProgress(now: number): void {
    if (now - this.lastProgressMs < PROGRESS_INTERVAL_MS) return;
    // Skip the post when nothing changed since the last emit; the periodic 100 ms wakeups
    // while waiting out a long recorded gap would otherwise re-post identical payloads.
    const l = this.lastEmitted;
    if (
      l &&
      l.status === this.status &&
      l.index === Math.min(this.cursor, this.schedule?.frameCount ?? 0) &&
      l.sentCount === this.sentCount &&
      l.underruns === this.underruns &&
      l.maxBufferedBytes === this.maxBufferedBytes &&
      l.txErrors === this.txErrors &&
      l.loopIteration === this.loopIteration
    ) {
      return;
    }
    this.emitProgress(now);
  }

  private emitProgress(now?: number): void {
    this.lastProgressMs = now ?? this.deps.now();
    const frameCount = this.schedule?.frameCount ?? 0;
    const p: TxProgress = {
      status: this.status,
      index: Math.min(this.cursor, frameCount),
      sentCount: this.sentCount,
      underruns: this.underruns,
      maxBufferedBytes: this.maxBufferedBytes,
      txErrors: this.txErrors,
      loopIteration: this.loopIteration,
    };
    this.lastEmitted = p;
    this.deps.onProgress?.(p);
  }

  private resetCounters(): void {
    this.sentCount = 0;
    this.underruns = 0;
    this.maxBufferedBytes = 0;
    this.txErrors = 0;
    this.loopIteration = 0;
    this.congestedHold = false;
    this.lastProgressMs = -Infinity;
  }
}
