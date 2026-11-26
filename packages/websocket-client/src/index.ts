/**
 * @csselectronics/websocket-client — Minimal CANsub WebSocket protocol layer.
 *
 * The slim public package that any consumer above raw wire bytes can install
 * to obtain a `CanFrame` stream from a CANsub device. Designed for standalone
 * integrations (node-red, custom dashboards, headless scripts) as well as
 * being the foundation for the higher-level `@csselectronics/can-types`,
 * `@csselectronics/can-tp`, `@csselectronics/can-pipeline`, `@csselectronics/can-decode`, and `@webcan/plugin-api`
 * packages.
 *
 * ## Minimal integration example
 *
 * ```ts
 * import { WorkerBridge } from '@csselectronics/websocket-client/workers/WorkerBridge';
 * import { ConnectionService } from '@csselectronics/websocket-client/services/pipeline/ConnectionService';
 * import InlineWorker from '@csselectronics/websocket-client/workers/CommunicationWorker?worker';
 * import type { CanFrame } from '@csselectronics/websocket-client/models/CanFrame';
 *
 * const bridge = new WorkerBridge(new InlineWorker());
 * bridge.init('https://2c08fbb4-usb.local');
 * const connection = new ConnectionService(bridge);
 *
 * bridge.onBatch((frames: CanFrame[]) => {
 *   for (const frame of frames) {
 *     // frame.bus ('CAN1'..'CAN4'), frame.arbitration_id, frame.data,
 *     // frame.epoch, frame.ide, frame.is_rtr, frame.is_tx, frame.is_error, frame.dlc
 *     // ... do whatever with the frame
 *   }
 * });
 *
 * await connection.connectBus('CAN1');
 *
 * // Transmit a frame on the open bus (client -> device):
 * connection.send('CAN1', {
 *   arbitration_id: 0x123, is_extended: false, is_fd: false,
 *   is_brs: false, is_rtr: false, data: new Uint8Array([1, 2, 3, 4]),
 * });
 * ```
 *
 * @module
 */

// ── Models ──────────────────────────────────────────────────────────────────
export { CanFrame, BUS_INTERN } from './models/CanFrame';

// ── Types ───────────────────────────────────────────────────────────────────
export type { CanBusName } from './types/CanBusTypes';
export type { WorkerRequest, WorkerResponse } from './types/WorkerTypes';
/** Descriptor for a CAN frame to transmit (client -> device); see ConnectionService.send / WorkerBridge.sendFrame. */
export type { TxFrame } from './protocol/CANSubProtocol';
/** TX encoders: single-frame and the batch/coalescing form (many frames -> one HDLC frame, shared CRC) for bulk WS TX / playback. */
export {
  cansub_encode_frame,
  cansub_encode_frames,
  encodeTxFrameBody,
  encodeHdlcFrame,
} from './protocol/CANSubProtocol';

// ── Workers / transport ─────────────────────────────────────────────────────
export { WorkerBridge } from './workers/WorkerBridge';

// ── Connection lifecycle ────────────────────────────────────────────────────
export { ConnectionService } from './services/pipeline/ConnectionService';

// ── Timed WS TX (playback / bulk transmit) ──────────────────────────────────
export { WsTransmitService } from './services/pipeline/WsTransmitService';
export { TxScheduler } from './workers/TxScheduler';
export type { TxProgress, TxStatus, TxSchedulerDeps, TxTimer } from './workers/TxScheduler';
export { DEFAULT_TX_SCHEDULE_OPTIONS } from './protocol/TxSchedule';
export type { TxSchedule, TxScheduleOptions } from './protocol/TxSchedule';

// ── Frame-format utilities (used by CanFrame's display getters; safe to use
//    standalone too) ─────────────────────────────────────────────────────────
export {
  formatCanId,
  formatDataBytes,
  formatDataLines,
  formatFlags,
} from './utils/DataFormatter';
export {
  formatEpochLong,
  formatEpochShort,
  setEpochFormatterMode,
} from './utils/EpochFormatter';
