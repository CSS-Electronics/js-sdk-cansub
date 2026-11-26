import type { Signal } from "@preact/signals-core";
import type { WorkerBridge } from "../../workers/WorkerBridge";
import type { TxSchedule } from "../../protocol/TxSchedule";
import type { TxProgress } from "../../workers/TxScheduler";

/**
 * WsTransmitService - public API for timed WebSocket-TX jobs (client-driven,
 * scheduled transmission over the WS TX path).
 *
 * This is the reusable sibling of {@link ConnectionService} for the "paced bulk
 * TX" direction: it wraps the {@link WorkerBridge}'s TxScheduler controls and
 * exposes progress/status as signals. Playback is the first consumer; other
 * client-driven WS TX features (signal generators, scripted bursts, ...) can build
 * a {@link TxSchedule} and drive it through the same service.
 *
 * Only one job runs at a time (the worker holds a single scheduler). Loading a new
 * schedule replaces the current one.
 */
export class WsTransmitService {
  /** Latest playback progress (index/sent/underruns/status/...); null until a job runs. */
  public readonly jobProgress: Signal<TxProgress | null>;
  /** Last job error message (e.g. a bus dropped mid-playback); null = none. */
  public readonly jobError: Signal<string | null>;

  private readonly bridge: WorkerBridge;

  constructor(bridge: WorkerBridge) {
    this.bridge = bridge;
    this.jobProgress = bridge.txJobProgress;
    this.jobError = bridge.txJobError;
  }

  /** Load (or replace) the schedule to transmit. Does not start it. */
  loadJob(schedule: TxSchedule): void {
    this.bridge.loadTxJob(schedule);
  }

  /** Start the loaded job from its current position. */
  start(): void {
    this.bridge.startTxJob();
  }

  /** Pause the running job. */
  pause(): void {
    this.bridge.pauseTxJob();
  }

  /** Resume a paused job, preserving timing. */
  resume(): void {
    this.bridge.resumeTxJob();
  }

  /** Jump to a frame index (keeps playing if playing, else positions while paused). */
  seek(index: number): void {
    this.bridge.seekTxJob(index);
  }

  /**
   * Clear the latched job error (main-thread signal only, no worker round trip).
   * Call when deliberately starting/resuming after an error episode so the stale
   * error does not keep masking the live transport state.
   */
  clearError(): void {
    this.bridge.clearTxJobError();
  }

  /** Stop and reset the job to its start. */
  stop(): void {
    this.bridge.stopTxJob();
  }
}
