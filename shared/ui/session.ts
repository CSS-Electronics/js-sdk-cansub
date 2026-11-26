import { effect, signal, untracked, type Signal } from '@preact/signals-core';
import { WorkerBridge } from '@csselectronics/websocket-client/workers/WorkerBridge';
import { ConnectionService } from '@csselectronics/websocket-client/services/pipeline/ConnectionService';
import type { CanFrame } from '@csselectronics/websocket-client/models/CanFrame';
import { formatCanId } from '@csselectronics/websocket-client/utils/DataFormatter';
import type { CanBusName } from '@csselectronics/websocket-client/types/CanBusTypes';
import { createApiClient } from '@csselectronics/rest-client/createApiClient';
import { API_VERSION } from '@csselectronics/rest-client/descriptions/ApiDescriptions';
import { findConfigByTiming } from '@csselectronics/rest-client/utils/BitrateConfigurations';
import type { DefaultApi } from '@csselectronics/rest-client';
import { RenderSignals } from '@csselectronics/can-types/services/render/RenderSignals';
import type { SignalInfo } from '@csselectronics/can-types/types/FilterTypes';
import { FullFrameStorageService } from '@csselectronics/can-pipeline/services/pipeline/storage/FullFrameStorageService';
import { FiltFrameStorageService } from '@csselectronics/can-pipeline/services/pipeline/storage/FiltFrameStorageService';
import { FilterSelectionService } from '@csselectronics/can-pipeline/services/pipeline/FilterSelectionService';
import { TimeControlService } from '@csselectronics/can-pipeline/services/pipeline/TimeControlService';
import { DbcManagerService } from '@csselectronics/can-decode/services/pipeline/dbc/DbcManagerService';
import { DbcAssignmentService } from '@csselectronics/can-decode/services/pipeline/dbc/DbcAssignmentService';
import { DecodingService, UNMATCHED } from '@csselectronics/can-decode/services/pipeline/DecodingService';
import InlineWorker from '../worker.ts?worker&inline';
import { saveDeviceUrl } from './deviceUrl';

/** What `CansubSession.open()` learns about the device. */
export interface DeviceSummary {
  url: string;
  id: string;
  hwVer: string;
  fwVer: string;
  /** REST API version, e.g. `05.00` */
  apiVersion: string;
  /** CAN channel numbers, e.g. [1, 2] on a CANsub.2 */
  channels: number[];
}

export interface SessionOptions {
  /** Frames kept in memory across all channels; the oldest are dropped first. */
  frameCapacity?: number;
  /** Memory budget for stored frames, in bytes. */
  memoryBytes?: number;
}

/** Device time differences up to this are left alone. */
const TIME_SYNC_THRESHOLD_MS = 5000;

/**
 * One connection to a CANsub: the REST client, the WebSocket streams and the same
 * frame pipeline webCAN uses (storage, DBC decoding, message registry, chart clock).
 *
 * Every frame is decoded and stored once, before `onFrames` listeners see it. The UI
 * panels in this folder all work on a session; an app can also use it headless.
 */
export class CansubSession {
  readonly bridge = new WorkerBridge(new InlineWorker());
  readonly connection = new ConnectionService(this.bridge);
  /** Per-batch ticks (~10 Hz) for rendering. */
  readonly ticks = new RenderSignals(this.bridge);
  readonly storage: FullFrameStorageService;
  /** Registry of every message and decoded signal seen so far, with message selection. */
  readonly messages = new FilterSelectionService(this.ticks.frameUpdate);
  /** The frames of the selected messages (`messages`), e.g. for a filtered trace. */
  readonly filteredStorage: FiltFrameStorageService;
  /** Time window and the smoothed live clock charts run on. */
  readonly time: TimeControlService;
  /** Loaded DBC files. */
  readonly dbcFiles = new DbcManagerService();
  /** DBC files per channel, in decoding priority order. */
  readonly dbcAssignment = new DbcAssignmentService(this.dbcFiles);
  readonly decoding: DecodingService;

  /** REST client; null until `open()` succeeds. */
  api: DefaultApi | null = null;
  /** The open device (ID, hardware, firmware and API versions, channels); null until `open()` succeeds. */
  readonly device: Signal<DeviceSummary | null> = signal(null);
  /** Changes when the DBC assignment changes, so signal lists can refresh. */
  readonly dbcVersion = signal(0);

  private readonly frameListeners = new Set<(frames: CanFrame[]) => void>();
  private busesInitialised = '';

  constructor(options: SessionOptions = {}) {
    this.storage = new FullFrameStorageService(
      options.frameCapacity ?? 1_000_000,
      options.memoryBytes ?? 500_000_000,
      this.connection.connectedBuses,
    );
    this.filteredStorage = new FiltFrameStorageService(
      this.storage,
      this.messages.activeMessageKeys,
      this.messages.hasActiveFiltering,
      this.connection,
      50_000,
      this.ticks.statusUpdate,
    );
    this.time = new TimeControlService(this.storage, this.filteredStorage);
    this.decoding = new DecodingService(this.dbcAssignment, this.messages);
    this.bridge.onBatch(frames => this.ingest(frames));
  }

  /**
   * Point the session at a device: checks the API version, reads the device info and
   * channels, and sets the device clock to this PC's clock when they differ by more
   * than 5 s (unless PTP is about to set it). Throws when the device is unreachable.
   */
  async open(url: string): Promise<DeviceSummary> {
    if (this.connection.connectedBuses.value.size > 0) {
      throw new Error('Disconnect all channels before changing the device');
    }
    const api = createApiClient(url);
    const apiVersion = await api.apiVersionGet();
    if (apiVersion !== API_VERSION) {
      throw new Error(`Device API version ${apiVersion} is not supported (expected ${API_VERSION}). Update the CANsub firmware or the SDK.`);
    }
    const info = await api.apiInfoGet();
    await syncDeviceTime(api);
    const channels = await api.apiCanGet();

    this.api = api;
    this.bridge.init(url);
    this.connection.setAvailableChannels(channels);
    if (this.busesInitialised !== channels.join()) {
      this.dbcAssignment.initBuses(channels, this.connection);
      this.busesInitialised = channels.join();
    }
    saveDeviceUrl(url);
    const summary = { url, id: info.id.toUpperCase(), hwVer: info.hwVer, fwVer: info.fwVer, apiVersion, channels };
    this.device.value = summary;
    return summary;
  }

  /** Bus names of the device's channels, e.g. ['CAN1', 'CAN2']. */
  get buses(): CanBusName[] {
    return this.connection.getAvailableBusNames();
  }

  isConnected(bus: CanBusName): boolean {
    return this.connection.connectedBuses.value.has(bus);
  }

  connect(bus: CanBusName): Promise<void> {
    return this.connection.connectBus(bus);
  }

  disconnect(bus: CanBusName): Promise<void> {
    return this.connection.disconnectBus(bus);
  }

  /**
   * Called when a channel connects or disconnects (not for the state at the time of
   * the call; read that with `isConnected`). Returns a function that stops it.
   */
  onConnectionChange(listener: (bus: CanBusName, connected: boolean) => void): () => void {
    let previous: ReadonlySet<CanBusName> | null = null;
    return effect(() => {
      const current = this.connection.connectedBuses.value;
      const before = previous;
      previous = new Set(current);
      if (!before) return;
      untracked(() => {
        for (const bus of current) if (!before.has(bus)) listener(bus, true);
        for (const bus of before) if (!current.has(bus)) listener(bus, false);
      });
    });
  }

  /**
   * The bit rate a channel is set to on the device, from its PHY timing and the CANsub
   * bit-timing table. Null when no device is open or the timing is not in the table.
   */
  async getBitrate(bus: CanBusName): Promise<{ nominalBitrate: number; dataBitrate: number; samplePoint: number } | null> {
    if (!this.api) return null;
    const phy = await this.api.apiCanChannelPhyGet({ channel: Number(bus.slice(3)) });
    const config = phy.timing && phy.timingData ? findConfigByTiming(phy.timing, phy.timingData) : null;
    return config ? { nominalBitrate: config.nominalBitrate, dataBitrate: config.dataBitrate, samplePoint: config.samplingPoint } : null;
  }

  /** Called with every batch of frames (~10 Hz), after they are decoded and stored. */
  onFrames(listener: (frames: CanFrame[]) => void): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  /**
   * Called once per batch (~10 Hz, in step with the data, like webCAN's views):
   * update the DOM here, never in `onFrames`. Quiet while no frames arrive.
   */
  onUpdate(listener: () => void): () => void {
    return this.ticks.frameUpdate.subscribe(() => listener());
  }

  /**
   * Set the DBC files that decode a channel, in priority order (first match wins).
   * Takes effect for the next frames; frames already stored keep their decoded values.
   */
  setChannelDbcs(bus: CanBusName, fileNames: string[]): void {
    const assignment = this.dbcAssignment.getAssignment(bus);
    if (!assignment) return;
    assignment.dbcFilenames.value = fileNames;
    if (this.isConnected(bus)) this.dbcAssignment.resolveForBus(bus);
    this.decoding.clearRegistrationCache();
    this.dbcVersion.value = this.dbcVersion.peek() + 1;
  }

  /**
   * Decoded signals seen on the bus so far, keyed by signal key
   * (`<frame key>_<signal name>`, e.g. `CAN1_2_IDE0_DIR0_RTR0_TP0_TLTempHR`).
   */
  getSignals(): Map<string, SignalInfo> {
    const result = new Map<string, SignalInfo>();
    for (const [key, info] of this.messages.getAvailableSignals()) {
      if (info.signal.name && info.signal.name !== UNMATCHED) result.set(key, info);
    }
    return result;
  }

  /**
   * Keys of the decoded signals named `signalName` seen so far, e.g. to show a fixed
   * set of signals without a picker. Optionally narrowed to one channel, message or
   * direction (`tx: false` for received frames only). A name can have several keys
   * (channels, CAN IDs, TX), and none until decoded frames arrive: Look keys up per
   * update, not once at startup.
   */
  findSignalKeys(signalName: string, where: { bus?: CanBusName; messageName?: string; tx?: boolean } = {}): string[] {
    const keys: string[] = [];
    for (const [key, info] of this.getSignals()) {
      if (info.signal.name !== signalName) continue;
      if (where.bus && info.bus !== where.bus) continue;
      if (where.messageName && info.message.name !== where.messageName) continue;
      if (where.tx !== undefined && !!info.isTx !== where.tx) continue;
      keys.push(key);
    }
    return keys;
  }

  /**
   * Display label for a signal key, as in webCAN's filter panel: Channel, CAN ID,
   * message and signal, plus ` RTR` / ` TX` (`CAN1 0x002 ThermocoupleHrTop TLTempHR`).
   * The label tells apart signals of the same name; `name` is the bare signal name and
   * `unit` its unit, for the app to show as it likes.
   */
  describeSignal(key: string): { label: string; name: string; unit: string; info: SignalInfo | undefined } {
    const info = this.messages.getAvailableSignals().get(key);
    if (!info) {
      // Not seen yet: the key is `<bus>_<decimal id>_IDE_DIR_RTR_TP_<signal name>`.
      const parts = key.split('_');
      const name = parts.slice(6).join('_') || key;
      const id = Number(parts[1]);
      const label = Number.isInteger(id) ? `${parts[0]} ${formatCanId(id, parts[2] === 'IDE1')} ${name}` : key;
      return { label, name, unit: '', info };
    }
    const label = `${info.bus} ${info.displayLabel}${info.isRtr ? ' RTR' : ''}${info.isTx ? ' TX' : ''}`;
    return { label, name: info.signal.name, unit: info.signal.unit ?? '', info };
  }

  // Same per-frame order as webCAN: register, decode, store.
  private ingest(frames: CanFrame[]): void {
    for (const f of frames) {
      this.storage.assignId(f);
      this.messages.registerMessage(f.bus, f.arbitration_id, f.ide, f.is_rtr, f.is_tx, f.is_error, f.synthetic);
      this.decoding.decodeFrame(f);
      this.storage.addFrame(f);
      this.filteredStorage.handleNewFrame(f);
    }
    const last = frames[frames.length - 1];
    if (last) {
      this.storage.recordArrival(last.epoch);
      this.storage.enforceBatchCapacity(last);
    }
    for (const listener of this.frameListeners) listener(frames);
  }
}

async function syncDeviceTime(api: DefaultApi): Promise<void> {
  const ptp = await api.apiTimePtpGet().catch(() => null);
  // PTP is about to give the device a better clock than this PC can.
  if (ptp && ptp.master !== null && ptp.state !== 'disabled') return;
  const deviceTime = (await api.apiTimeGet()).utc;
  if (isNaN(deviceTime.getTime())) return;
  if (Math.abs(deviceTime.getTime() - Date.now()) <= TIME_SYNC_THRESHOLD_MS) return;
  // ratePpb 0: no clock-rate correction is known.
  await api.apiTimePut({ time: { utc: new Date(), ratePpb: 0 } });
}
