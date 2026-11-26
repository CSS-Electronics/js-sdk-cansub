import { effect, signal, type ReadonlySignal } from '@preact/signals-core';
import type { WorkerBridge } from '@csselectronics/websocket-client/workers/WorkerBridge';

/**
 * RenderSignals - Batch-driven update notifications for UI panels
 *
 * All UI render signals are coupled directly to worker batch arrivals
 * (rate = WORKER_POST_INTERVAL_MS, default 100 ms = 10 Hz).
 * This eliminates phase drift between data arrival and UI renders.
 *
 * Signals:
 * - frameUpdate:      increments per batch while live (stops while the view is frozen)
 * - statusUpdate:     increments per batch ALWAYS (drives eviction, timeline, trace orange zone)
 * - chartQueryUpdate: increments per batch while live (drives chart data queries)
 * - paused:           true exactly while the view is frozen; follows the live state bound
 *                     via followLiveState(), never written by UI code
 *
 * Constructor injection for testability:
 * - Subscribes to WorkerBridge batch events in constructor
 * - Makes dependency explicit and mockable in tests
 */
export class RenderSignals {
  // Increments once per worker batch while live.
  // Drives: FilterSelectionService rebuild, chart scaffolding reactivity.
  public readonly frameUpdate = signal<number>(0);

  // Increments once per worker batch ALWAYS (even when frozen).
  // Drives: SummaryPanel, Trace scaffolding, TimelineSlider, eviction sync.
  public readonly statusUpdate = signal<number>(0);

  // Increments once per worker batch while live.
  // Drives: chart data queries (10 Hz query pipeline).
  public readonly chartQueryUpdate = signal<number>(0);

  private readonly _paused = signal<boolean>(false);
  /** True exactly while the view is frozen; frameUpdate and chartQueryUpdate do not increment then. */
  public readonly paused: ReadonlySignal<boolean> = this._paused;

  private followingLiveState = false;

  constructor(workerBridge: Pick<WorkerBridge, 'onBatchDone'>) {
    // All UI updates fire once per worker batch arrival.
    workerBridge.onBatchDone(() => {
      this.statusUpdate.value++;
      if (!this._paused.value) {
        this.frameUpdate.value++;
        this.chartQueryUpdate.value++;
      }
    });
  }

  /**
   * Derive `paused` from the time control's live state (paused = !isLive), so the
   * two can never disagree. Called once, after the time control exists.
   */
  followLiveState(isLive: ReadonlySignal<boolean>): void {
    if (this.followingLiveState) throw new Error('RenderSignals already follows a live state');
    this.followingLiveState = true;
    effect(() => { this._paused.value = !isLive.value; });
  }
}
