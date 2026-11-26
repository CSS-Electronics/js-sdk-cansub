/**
 * Per-bus CommunicationWorker (Web Worker)
 *
 * One WebSocket per bus, binary HDLC protocol with CRC32.
 * Decoded frames are batched and transferred to the main thread.
 */

import type { WorkerRequest, WorkerResponse } from "../types/WorkerTypes";
import type { CanBusName } from "../types/CanBusTypes";
import { Buffer } from "../protocol/Buffer";
import { cansub_decode_into, cansub_encode_frame, FrameBatchWriter } from "../protocol/CANSubProtocol";
import type { TxFrame } from "../protocol/CANSubProtocol";
import { TxScheduler } from "./TxScheduler";
/** Device base URL. Defaults to worker origin; overridden via 'init' message. */
let deviceBaseUrl = self.location.origin;

/** Batch flush interval - defaults to 100ms (10 Hz). Overridable via 'init' message. */
let workerPostIntervalMs = 100;

/** Channel mapping: Bus name → channel number (1-4) */
const CHANNEL_MAP: Record<CanBusName, number> = {
  CAN1: 1,
  CAN2: 2,
  CAN3: 3,
  CAN4: 4,
};

/** Per-bus WebSocket connection state */
interface BusConnection {
  ws: WebSocket;
}

/** Active bus connections */
const connections = new Map<CanBusName, BusConnection>();

/** Reusable input buffer - safe because worker is single-threaded */
const _inputBuf = new Buffer();

// ============================================================================
// postMessage batching - accumulate decoded frames, flush on timer
// ============================================================================

/** Batch writer - accumulates decoded frames into a flat ArrayBuffer */
const _batchWriter = new FrameBatchWriter();

/** Handle for the scheduled drain timeout (null = no drain pending) */
let drainTimer: ReturnType<typeof setTimeout> | null = null;

/** Schedule a drain if one isn't already pending */
function scheduleDrain(): void {
  if (drainTimer !== null) return;
  drainTimer = setTimeout(flushFrames, workerPostIntervalMs);
}

/** Flush accumulated frames to the main thread via transferable ArrayBuffer */
function flushFrames(): void {
  // Cancel pending drain to prevent orphaned timers (e.g. when called from disconnectBus)
  if (drainTimer !== null) {
    clearTimeout(drainTimer);
  }
  drainTimer = null;
  if (_batchWriter.frameCount === 0) return;
  const buffer = _batchWriter.finish();
  const msg: WorkerResponse = { type: "rxFrameBatch", buffer };
  (self as unknown as Worker).postMessage(msg, [buffer]);
  _batchWriter.reset();
}

/** Get WebSocket URL for a specific bus. */
function getWebSocketUrl(bus: CanBusName): string {
  const channel = CHANNEL_MAP[bus];
  return `${deviceBaseUrl}/api/can/${channel}/ws`;
}

/**
 * Handle binary data from WebSocket
 */
function handleBinaryData(bus: CanBusName, data: ArrayBuffer): void {
  const conn = connections.get(bus);
  if (!conn) return;

  // Reuse module-level buffer (safe: worker is single-threaded)
  _inputBuf.loadFrom(new Uint8Array(data));
  const buffer = _inputBuf;

  // Decode all CAN messages in this HDLC frame directly into the batch writer
  const channel = CHANNEL_MAP[bus];
  let decoded: number;
  try {
    decoded = cansub_decode_into(buffer, channel, _batchWriter);
  } catch (error) {
    console.error(`[Worker] ${bus} decode error:`, error);
    return;
  }

  if (decoded > 0) {
    scheduleDrain();
  }
}

/**
 * Connect to a specific bus
 */
function connectBus(bus: CanBusName): void {
  // Check if already connected
  if (connections.has(bus)) return;

  const url = getWebSocketUrl(bus);
  const ws = new WebSocket(url);
  ws.binaryType = "arraybuffer";

  const conn: BusConnection = {
    ws: ws,
  };

  connections.set(bus, conn);

  ws.onopen = () => {
    self.postMessage({ type: "connectionStatus", bus, connected: true } satisfies WorkerResponse);
  };

  ws.onmessage = (event: MessageEvent) => {
    if (event.data instanceof ArrayBuffer) {
      handleBinaryData(bus, event.data);
    }
  };

  ws.onerror = (error) => {
    console.error(`[Worker] ${bus} WebSocket error:`, error);
    self.postMessage({
      type: "error",
      message: `WebSocket error on ${bus}`
    } satisfies WorkerResponse);
  };

  ws.onclose = () => {
    connections.delete(bus);
    self.postMessage({ type: "connectionStatus", bus, connected: false } satisfies WorkerResponse);
  };
}

/**
 * Disconnect from a specific bus
 */
function disconnectBus(bus: CanBusName): void {
  const conn = connections.get(bus);
  if (!conn) return;

  // Flush any pending frames before closing
  flushFrames();
  conn.ws.close();
  // Cleanup happens in ws.onclose
}

/**
 * Transmit a single CAN frame on a bus's open WebSocket.
 * Encodes the frame to HDLC wire bytes and writes them to the socket.
 * Reports a txError (rather than throwing) if the socket is not open or the
 * write/encode fails, so the main thread can surface it to the user.
 */
function sendFrame(bus: CanBusName, frame: TxFrame): void {
  const conn = connections.get(bus);
  if (!conn || conn.ws.readyState !== WebSocket.OPEN) {
    self.postMessage({
      type: "txError",
      bus,
      message: `Cannot transmit on ${bus}: WebSocket not open`,
    } satisfies WorkerResponse);
    return;
  }

  try {
    conn.ws.send(cansub_encode_frame(frame).buffer);
  } catch (error) {
    self.postMessage({
      type: "txError",
      bus,
      message: `Transmit failed on ${bus}: ${error instanceof Error ? error.message : String(error)}`,
    } satisfies WorkerResponse);
  }
}

// ============================================================================
// Playback / bulk WS TX - worker-side timed transmit scheduler
// ============================================================================

/** Throttle txJobError posts so a disconnected bus can't spam the main thread. */
let lastTxJobErrorMs = -Infinity;

/**
 * The scheduler sends pre-framed HDLC bytes straight to a bus's WebSocket (no
 * per-frame postMessage), coalescing due frames into one send. It is co-located
 * with the sockets precisely so the hot path stays on this thread.
 */
const txScheduler = new TxScheduler({
  now: () => performance.now(),
  send: (bus, bytes) => {
    const conn = connections.get(bus);
    if (!conn || conn.ws.readyState !== WebSocket.OPEN) {
      throw new Error(`bus ${bus} not open`);
    }
    conn.ws.send(bytes);
  },
  bufferedAmount: (bus) => {
    const conn = connections.get(bus);
    // Not open -> report 0 so the scheduler attempts a send and surfaces the error.
    return conn && conn.ws.readyState === WebSocket.OPEN ? conn.ws.bufferedAmount : 0;
  },
  setTimer: (cb, ms) => setTimeout(cb, ms),
  clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  onProgress: (progress) => {
    self.postMessage({ type: "txJobProgress", progress } satisfies WorkerResponse);
  },
  onError: (message) => {
    const now = performance.now();
    if (now - lastTxJobErrorMs < 500) return; // throttle
    lastTxJobErrorMs = now;
    self.postMessage({ type: "txJobError", message } satisfies WorkerResponse);
  },
});

/**
 * Worker message handler
 */
self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;

  switch (msg.type) {
    case "init": {
      // Empty deviceUrl keeps the default (this worker's own origin) - lets the app
      // always call init to push tunables without overriding the production URL.
      if (msg.deviceUrl) {
        deviceBaseUrl = msg.deviceUrl;
      }
      if (msg.workerPostIntervalMs != null) {
        workerPostIntervalMs = msg.workerPostIntervalMs;
      }
      if (msg.wsTxMaxBufferedBytes != null) {
        txScheduler.setMaxBufferedBytes(msg.wsTxMaxBufferedBytes);
      }
      break;
    }

    case "connect": {
      connectBus(msg.bus);
      break;
    }

    case "disconnect": {
      disconnectBus(msg.bus);
      break;
    }

    case "send": {
      sendFrame(msg.bus, msg.frame);
      break;
    }

    case "txJobLoad": {
      txScheduler.load(msg.schedule);
      break;
    }

    case "txJobStart": {
      txScheduler.start();
      break;
    }

    case "txJobPause": {
      txScheduler.pause();
      break;
    }

    case "txJobResume": {
      txScheduler.resume();
      break;
    }

    case "txJobSeek": {
      txScheduler.seek(msg.index);
      break;
    }

    case "txJobStop": {
      txScheduler.stop();
      break;
    }

    default: {
      console.error(`[Worker] Unknown message type:`, msg);
      break;
    }
  }
};
