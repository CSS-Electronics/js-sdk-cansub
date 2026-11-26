import type { CanBusName } from "./CanBusTypes";
import type { TxFrame } from "../protocol/CANSubProtocol";
import type { TxSchedule } from "../protocol/TxSchedule";
import type { TxProgress } from "../workers/TxScheduler";

/**
 * Messages sent FROM main thread TO worker
 *
 * send: transmit a single CAN frame on the bus's open WebSocket. `frame` is a
 * plain, structured-clone-safe descriptor (the worker serializes it to the wire).
 *
 * txJob*: control a timed WebSocket-TX job (playback / bulk TX) run by the
 * worker-side TxScheduler. `txJobLoad` carries a whole TxSchedule (columnar typed
 * arrays; structured-cloned to the worker). The others are lightweight controls.
 */
export type WorkerRequest =
  | { type: 'init'; deviceUrl: string; workerPostIntervalMs?: number; wsTxMaxBufferedBytes?: number }
  | { type: 'connect', bus: CanBusName }
  | { type: 'disconnect', bus: CanBusName }
  | { type: 'send', bus: CanBusName, frame: TxFrame }
  | { type: 'txJobLoad', schedule: TxSchedule }
  | { type: 'txJobStart' }
  | { type: 'txJobPause' }
  | { type: 'txJobResume' }
  | { type: 'txJobSeek', index: number }
  | { type: 'txJobStop' };

/**
 * Messages sent FROM worker TO main thread
 *
 * rxFrameBatch: Transferable ArrayBuffer containing packed CAN frames.
 * See CANSubProtocol.ts (FRAME_HEADER_BYTES / BATCH_HEADER_BYTES) for layout.
 * txError: a transmit request could not be written (bus not open / send failed).
 *
 * txJobProgress: throttled playback progress (index/sent/underruns/...); the final
 * emit carries status 'complete'. txJobError: a scheduler send failed.
 */
export type WorkerResponse =
  | { type: 'rxFrameBatch', buffer: ArrayBuffer }
  | { type: 'connectionStatus', connected: boolean, bus: CanBusName }
  | { type: 'txError', bus: CanBusName, message: string }
  | { type: 'error', message: string }
  | { type: 'txJobProgress', progress: TxProgress }
  | { type: 'txJobError', message: string };
