import { signal } from "@preact/signals-core";
import type { Signal } from "@preact/signals-core";
import type { WorkerRequest, WorkerResponse } from "../types/WorkerTypes";
import type { CanBusName } from "../types/CanBusTypes";
import type { CanFrame } from "../models/CanFrame";
import { parseFrameBatch } from "../protocol/CANSubProtocol";
import type { TxFrame } from "../protocol/CANSubProtocol";
import type { TxSchedule } from "../protocol/TxSchedule";
import type { TxProgress } from "./TxScheduler";

/**
 * Bridge between the main thread and the CommunicationWorker.
 *
 * Manages the worker lifecycle, dispatches connect/disconnect commands,
 * and forwards incoming CAN frames to registered listeners.
 * Each bus gets its own WebSocket inside the worker; connect/disconnect
 * return Promises that resolve on the worker's ack (with a 10 s timeout).
 *
 * Frame delivery is batch-oriented:
 *   onBatch(fn)     - receives the full CanFrame[] per worker flush
 *   onBatchDone(fn) - no-arg notification after batch processing (drives UI signals)
 */
export class WorkerBridge {
  private worker: Worker;
  private batchListeners = new Set<(frames: CanFrame[]) => void>();
  private batchDoneListeners = new Set<() => void>();
  private txErrorListeners = new Set<(bus: CanBusName, message: string) => void>();
  private busClosedListeners = new Set<(bus: CanBusName) => void>();

  // Track which buses are connected (one WebSocket per bus)
  private connectedBuses = new Set<CanBusName>();

  /**
   * Latest timed-TX (playback / bulk WS TX) progress from the worker scheduler.
   * Includes `status` ('idle'|'playing'|'paused'|'complete'). Consumed reactively
   * by WsTransmitService (prefer signals over onX(handler) per the app conventions).
   */
  public readonly txJobProgress: Signal<TxProgress | null> = signal(null);

  /** Last timed-TX error message (e.g. a bus dropped mid-playback); null = none. */
  public readonly txJobError: Signal<string | null> = signal(null);

  // Per-bus pending connection/disconnection acks
  private pendingBusConnect = new Map<CanBusName, (value: void) => void>();
  private pendingBusDisconnect = new Map<CanBusName, (value: void) => void>();

  constructor(worker: Worker) {
    this.worker = worker;

    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;

      switch (msg.type) {
        case 'rxFrameBatch': {
          const frames = parseFrameBatch(msg.buffer);
          this.batchListeners.forEach(fn => fn(frames));
          this.batchDoneListeners.forEach(fn => fn());
          break;
        }

        case 'connectionStatus':
          if (msg.connected) {
            this.connectedBuses.add(msg.bus);
            const resolver = this.pendingBusConnect.get(msg.bus);
            if (resolver) {
              resolver();
              this.pendingBusConnect.delete(msg.bus);
            }
          } else {
            this.connectedBuses.delete(msg.bus);
            const resolver = this.pendingBusDisconnect.get(msg.bus);
            if (resolver) {
              resolver();
              this.pendingBusDisconnect.delete(msg.bus);
            } else {
              // No pending ack, so nobody asked for this close: the device dropped us
              // (reboot, power loss, socket taken elsewhere). Consumers use this to stop
              // reporting the bus as connected.
              this.busClosedListeners.forEach(fn => fn(msg.bus));
            }
          }
          break;

        case 'txError':
          if (this.txErrorListeners.size > 0) {
            this.txErrorListeners.forEach(fn => fn(msg.bus, msg.message));
          } else {
            console.error('Worker TX error:', msg.message);
          }
          break;

        case 'txJobProgress':
          this.txJobProgress.value = msg.progress;
          break;

        case 'txJobError':
          this.txJobError.value = msg.message;
          break;

        case 'error':
          console.error('Worker error:', msg.message);
          break;
      }
    };

    this.worker.onerror = (error) => {
      console.error('Worker error:', error);
    };
  }

  private send(msg: WorkerRequest) {
    this.worker.postMessage(msg);
  }

  /** Initialize the worker with the device base URL. Must be called before connect(). */
  init(deviceUrl: string, workerPostIntervalMs?: number, wsTxMaxBufferedBytes?: number): void {
    this.send({ type: 'init', deviceUrl, workerPostIntervalMs, wsTxMaxBufferedBytes });
  }

  /** Terminate the worker. All WebSocket connections are closed. */
  terminate(): void {
    this.worker.terminate();
  }

  /**
   * Connect to a bus (opens a dedicated WebSocket for this bus)
   * Returns a Promise that resolves when the bus WebSocket is connected and ready
   */
  async connect(bus: CanBusName): Promise<void> {
    if (this.connectedBuses.has(bus) || this.pendingBusConnect.has(bus)) {
      return;
    }

    let timerId: ReturnType<typeof setTimeout>;

    const busPromise = new Promise<void>((resolve) => {
      this.pendingBusConnect.set(bus, resolve);
    });

    // 10-second timeout
    const timeoutPromise = new Promise<void>((_, reject) => {
      timerId = setTimeout(() => {
        if (this.pendingBusConnect.has(bus)) {
          this.pendingBusConnect.delete(bus);
          console.error(`${bus} connection timeout (10s)`);
          reject(new Error(`Connection timeout for ${bus} after 10 seconds`));
        }
      }, 10000);
    });

    this.send({ type: 'connect', bus });

    try {
      await Promise.race([busPromise, timeoutPromise]);
    } finally {
      clearTimeout(timerId!);
    }
  }

  /**
   * Disconnect from a bus (closes this bus's dedicated WebSocket)
   * Returns a Promise that resolves when the bus WebSocket is disconnected
   */
  async disconnect(bus: CanBusName): Promise<void> {
    if (!this.connectedBuses.has(bus) && !this.pendingBusDisconnect.has(bus)) {
      return;
    }

    let timerId: ReturnType<typeof setTimeout>;

    const busPromise = new Promise<void>((resolve) => {
      this.pendingBusDisconnect.set(bus, resolve);
    });

    // 10-second timeout
    const timeoutPromise = new Promise<void>((_, reject) => {
      timerId = setTimeout(() => {
        if (this.pendingBusDisconnect.has(bus)) {
          this.pendingBusDisconnect.delete(bus);
          console.error(`${bus} disconnection timeout (10s)`);
          reject(new Error(`Disconnection timeout for ${bus} after 10 seconds`));
        }
      }, 10000);
    });

    // Send disconnect command (don't wait for WebSocket to close yet)
    this.send({ type: 'disconnect', bus });

    // Wait for per-bus ack (or timeout)
    try {
      await Promise.race([busPromise, timeoutPromise]);
    } finally {
      clearTimeout(timerId!);
    }
  }

  /**
   * Transmit a single CAN frame on a bus's open WebSocket (client -> device).
   * Fire-and-forget: the frame is queued to the worker, which serializes and
   * writes it. Throws if the bus is not connected (fast pre-check); WebSocket-level
   * failures surface asynchronously via onTxError.
   */
  sendFrame(bus: CanBusName, frame: TxFrame): void {
    if (!this.connectedBuses.has(bus)) {
      throw new Error(`Cannot transmit on ${bus}: not connected`);
    }
    this.send({ type: 'send', bus, frame });
  }

  // ============================================================================
  // Timed WS TX job (playback / bulk transmit) - driven by the worker's TxScheduler.
  // Progress/errors arrive on the txJobProgress / txJobError signals above.
  // ============================================================================

  /**
   * Load a schedule into the worker scheduler (replacing any current one).
   * The schedule's typed arrays are structured-cloned to the worker, so the
   * caller's copy (e.g. the loaded clip) is preserved and reusable.
   */
  loadTxJob(schedule: TxSchedule): void {
    this.clearTxJobError();
    this.send({ type: 'txJobLoad', schedule });
  }

  /** Clear the latched timed-TX error (main-thread signal only; no worker round trip). */
  clearTxJobError(): void {
    this.txJobError.value = null;
  }

  /** Start the loaded job from its current position. */
  startTxJob(): void {
    this.send({ type: 'txJobStart' });
  }

  /** Pause the running job. */
  pauseTxJob(): void {
    this.send({ type: 'txJobPause' });
  }

  /** Resume a paused job. */
  resumeTxJob(): void {
    this.send({ type: 'txJobResume' });
  }

  /** Jump to a frame index. */
  seekTxJob(index: number): void {
    this.send({ type: 'txJobSeek', index });
  }

  /** Stop and reset the job to its start. */
  stopTxJob(): void {
    this.send({ type: 'txJobStop' });
  }

  /** Subscribe to transmit errors (bus not open / send failed on the worker side). */
  onTxError(fn: (bus: CanBusName, message: string) => void): () => void {
    this.txErrorListeners.add(fn);
    return () => this.txErrorListeners.delete(fn);
  }

  /**
   * Subscribe to unexpected bus closes: the socket closed without a disconnect having been
   * requested. Does not fire for a user-initiated disconnect, which always registers a
   * pending ack first.
   */
  onBusClosed(fn: (bus: CanBusName) => void): () => void {
    this.busClosedListeners.add(fn);
    return () => this.busClosedListeners.delete(fn);
  }

  /** Subscribe to frame batches (called once per worker flush with the full CanFrame[]). */
  onBatch(fn: (frames: CanFrame[]) => void): () => void {
    this.batchListeners.add(fn);
    return () => this.batchListeners.delete(fn);
  }

  /** Subscribe to batch-done notifications (no-arg, fires after all onBatch listeners). */
  onBatchDone(fn: () => void): () => void {
    this.batchDoneListeners.add(fn);
    return () => this.batchDoneListeners.delete(fn);
  }

}
