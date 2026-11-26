import { signal } from '@preact/signals-core';
import type { Signal } from '@preact/signals-core';
import type { CanBusName } from '../../types/CanBusTypes';
import type { WorkerBridge } from '../../workers/WorkerBridge';
import type { TxFrame } from '../../protocol/CANSubProtocol';

/**
 * ConnectionService - CAN bus connection lifecycle manager.
 *
 * Owns per-bus connection state, available channels, and WebSocket
 * connect/disconnect via WorkerBridge. Other services (storage, filter,
 * stats, ...) react to `connectedBuses` changes via signal effects — see
 * `FullFrameStorageService` for the canonical example of consumer-driven
 * lifecycle binding (it creates per-bus buffers on add, drops them on remove).
 *
 * No reach into downstream services from here — keeping this file in
 * `@csselectronics/websocket-client` means it stays usable by node-red / standalone
 * integrations without dragging in `@csselectronics/can-pipeline`.
 */
export class ConnectionService {
  /** Available channels from device (1-4). Set during initialization. */
  public readonly availableChannels: Signal<number[]> = signal([]);

  /**
   * Connected buses signal (reactive)
   */
  public readonly connectedBuses: Signal<Set<CanBusName>> = signal(new Set());

  private readonly bridge: WorkerBridge;

  constructor(bridge: WorkerBridge) {
    this.bridge = bridge;

    // A socket that closes without anyone asking (device reboot, power loss, the channel
    // taken by another client) must not leave the bus reported as connected: the UI would
    // keep offering Disconnect and keep its config fields locked forever. Reported here
    // rather than notified, since a reboot drops every bus at once.
    this.bridge.onBusClosed((busName) => {
      if (!this.connectedBuses.value.has(busName)) return;
      console.warn(`[ConnectionService] ${busName} closed unexpectedly (device reboot or connection lost)`);
      const updated = new Set(this.connectedBuses.value);
      updated.delete(busName);
      this.connectedBuses.value = updated;
    });
  }

  /** Initialize available channels (called after API fetch). */
  setAvailableChannels(channels: number[]): void {
    this.availableChannels.value = channels;
  }

  /**
   * Get available bus names filtered by device capabilities.
   */
  getAvailableBusNames(): CanBusName[] {
    return this.availableChannels.value.map(ch => `CAN${ch}` as CanBusName);
  }

  // ============================================================================
  // Connection Methods
  // ============================================================================

  /** Connect to a specific bus. Opens WebSocket and updates connectedBuses. */
  async connectBus(busName: CanBusName): Promise<void> {
    // 1. Connect WebSocket via WorkerBridge
    await this.bridge.connect(busName);

    // 2. Update connectedBuses signal
    //    (triggers reactive effects in downstream services: storage allocates
    //    a per-bus buffer, DBC resolves, filtered buffer is created, etc.)
    const updated = new Set(this.connectedBuses.value);
    updated.add(busName);
    this.connectedBuses.value = updated;
  }

  /** Disconnect from a specific bus. Closes WebSocket and updates state. */
  async disconnectBus(busName: CanBusName): Promise<void> {
    if (!this.connectedBuses.value.has(busName)) return;

    // 1. Disconnect WebSocket
    await this.bridge.disconnect(busName);

    // 2. Update connectedBuses signal
    //    (triggers reactive effects: DBC cleanup, filtered buffer removal, etc.)
    const updated = new Set(this.connectedBuses.value);
    updated.delete(busName);
    this.connectedBuses.value = updated;
  }

  /**
   * Transmit a single CAN frame on a connected bus (client -> device).
   *
   * Public mirror of connectBus/disconnectBus for the TX direction. Fire-and-forget:
   * the frame is handed to the WorkerBridge, which serializes it to the wire and
   * writes it on the bus's open WebSocket. Throws if the bus is not connected;
   * WebSocket-level failures surface via WorkerBridge.onTxError.
   */
  send(busName: CanBusName, frame: TxFrame): void {
    if (!this.connectedBuses.value.has(busName)) {
      throw new Error(`Cannot transmit on ${busName}: bus not connected`);
    }
    this.bridge.sendFrame(busName, frame);
  }

  /**
   * Disconnect from all buses
   */
  async disconnectAll(): Promise<void> {
    const buses = Array.from(this.connectedBuses.value);
    await Promise.all(buses.map(bus => this.disconnectBus(bus)));
  }

  /**
   * Toggle bus connection (connect if disconnected, disconnect if connected)
   */
  async toggleBus(busName: CanBusName): Promise<void> {
    if (this.connectedBuses.value.has(busName)) {
      await this.disconnectBus(busName);
    } else {
      try {
        await this.connectBus(busName);
      } catch (error) {
        console.error(`Failed to connect to ${busName}:`, error);
        throw error;
      }
    }
  }
}
