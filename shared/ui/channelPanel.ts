import { effect, untracked } from '@preact/signals-core';
import type { CanBusName } from '@csselectronics/websocket-client/types/CanBusTypes';
import {
  findConfigByTiming,
  formatBitrate,
  formatSamplePoint,
  getTiming,
} from '@csselectronics/rest-client/utils/BitrateConfigurations';
import { resolvePhySelection, type PhySelection } from '@csselectronics/rest-client/utils/PhySelection';
import { formatApiError } from '@csselectronics/can-types/utils/ErrorFormatter';
import type { CansubSession } from './session';
import { h, replaceChildren } from './dom';

export interface ChannelPanelOptions {
  /** Show the bit-rate and PHY settings (default true). Off: connect/disconnect only. */
  phy?: boolean;
}

/**
 * One tab per device channel with connect/disconnect, the bit rate (nominal, data,
 * sample point from the CANsub bit-timing table) and listen-only, auto-reset and
 * error frames. PHY settings apply to the device at once and are locked while the
 * channel is connected, since the device only accepts them on a closed channel.
 * TX ack frames are always on, as in webCAN, so the app receives its own transmitted frames.
 */
export function mountChannelPanel(container: HTMLElement, session: CansubSession, options: ChannelPanelOptions = {}): () => void {
  const cards = new Map<CanBusName, ChannelCard>();
  const tabs = h('div', { class: 'cs-tabs', role: 'tablist' });
  const panes = h('div', { class: 'cs-tab-panes' });
  let active: CanBusName | null = null;

  function renderTabs(): void {
    const connected = session.connection.connectedBuses.value;
    replaceChildren(tabs, ...[...cards.keys()].map(bus => h('button', {
      class: `cs-tab${bus === active ? ' cs-tab-on' : ''}`,
      role: 'tab',
      'aria-selected': String(bus === active),
      title: connected.has(bus) ? `${bus} is connected` : `${bus} is not connected`,
      onclick: () => { active = bus; renderTabs(); },
    }, h('span', { class: `cs-dot${connected.has(bus) ? ' cs-dot-on' : ''}` }), bus)));
    for (const [bus, card] of cards) card.el.hidden = bus !== active;
  }

  const disposeDevice = effect(() => {
    const device = session.device.value;
    untracked(() => {
      for (const card of cards.values()) card.dispose();
      cards.clear();
      if (!device) {
        replaceChildren(container, h('p', { class: 'cs-muted' }, 'Check a device to see its CAN channels.'));
        return;
      }
      for (const channel of device.channels) {
        const card = new ChannelCard(session, channel, options.phy ?? true);
        cards.set(card.bus, card);
      }
      if (!active || !cards.has(active)) active = cards.keys().next().value ?? null;
      replaceChildren(panes, ...[...cards.values()].map(c => c.el));
      replaceChildren(container, tabs, panes);
      renderTabs();
    });
  });
  const disposeTabs = effect(renderTabs);
  return () => {
    disposeDevice();
    disposeTabs();
    for (const card of cards.values()) card.dispose();
  };
}

class ChannelCard {
  readonly bus: CanBusName;
  readonly el: HTMLElement;
  private selection: PhySelection = { nominalBitrate: 500_000, dataBitrate: 2_000_000, samplePoint: 80 };
  private flags = { listenOnly: false, autoReset: true, errorFrames: false };
  private busy = false;
  private toggling = false;
  private error: string | null = null;
  private note: string | null = null;
  private readonly body = h('div', { class: 'cs-channel-body' });
  private readonly disposeEffect: () => void;

  constructor(private readonly session: CansubSession, private readonly channel: number, private readonly showPhy: boolean) {
    this.bus = `CAN${channel}` as CanBusName;
    this.el = h('div', { class: 'cs-channel', role: 'tabpanel' }, this.body);
    this.disposeEffect = effect(() => {
      session.connection.connectedBuses.value;
      this.render();
    });
    if (showPhy) void this.readPhy();
  }

  dispose(): void {
    this.disposeEffect();
  }

  private get connected(): boolean {
    return this.session.isConnected(this.bus);
  }

  private async readPhy(): Promise<void> {
    const api = this.session.api;
    if (!api) return;
    try {
      const phy = await api.apiCanChannelPhyGet({ channel: this.channel });
      this.flags = {
        listenOnly: phy.listenOnly ?? false,
        autoReset: phy.autoReset ?? true,
        errorFrames: phy.errorFrames ?? false,
      };
      const config = phy.timing && phy.timingData ? findConfigByTiming(phy.timing, phy.timingData) : null;
      if (config) {
        this.selection = { nominalBitrate: config.nominalBitrate, dataBitrate: config.dataBitrate, samplePoint: config.samplingPoint };
        this.note = null;
      } else {
        this.note = 'The device uses a bit timing that is not in the table. Pick a bit rate to replace it.';
      }
    } catch (e) {
      this.error = `Could not read the PHY settings: ${await formatApiError(e)}`;
    }
    this.render();
  }

  private async applyPhy(selection: PhySelection, flags = this.flags): Promise<void> {
    const api = this.session.api;
    if (!api) return;
    const resolved = resolvePhySelection(selection);
    const timing = getTiming(resolved.nominalBitrate, resolved.dataBitrate, resolved.samplePoint);
    if (!timing) return;
    this.busy = true;
    this.render();
    try {
      await api.apiCanChannelPhyPut({
        channel: this.channel,
        // The device takes the whole PHY object; TX acks stay on as in webCAN.
        phy: { ...flags, txAckFrames: true, timing: timing.timing, timingData: timing.timingData },
      });
      this.selection = resolved;
      this.flags = flags;
      this.error = null;
      this.note = null;
    } catch (e) {
      this.error = `Could not apply the PHY settings: ${await formatApiError(e)}`;
      await this.readPhy();
    } finally {
      this.busy = false;
      this.render();
    }
  }

  private async toggleConnection(): Promise<void> {
    this.busy = this.toggling = true;
    this.error = null;
    this.render();
    try {
      if (this.connected) await this.session.disconnect(this.bus);
      else await this.session.connect(this.bus);
    } catch (e) {
      this.error = `${e instanceof Error ? e.message : e}. Is the channel in use in another tab or app?`;
    } finally {
      this.busy = this.toggling = false;
      this.render();
    }
  }

  private render(): void {
    const connected = this.connected;
    const label = this.toggling
      ? (connected ? 'disconnecting…' : 'connecting…')
      : (connected ? 'disconnect' : 'connect');
    replaceChildren(
      this.body,
      this.showPhy ? this.renderPhy(connected) : null,
      this.note ? h('p', { class: 'cs-note' }, this.note) : null,
      this.error ? h('p', { class: 'cs-error' }, this.error) : null,
      h('button', {
        class: `cs-btn cs-btn-block${connected ? ' cs-btn-danger' : ''}`,
        disabled: this.busy,
        onclick: () => void this.toggleConnection(),
      }, label),
    );
  }

  private renderPhy(connected: boolean): HTMLElement {
    const locked = connected || this.busy;
    const { options } = resolvePhySelection(this.selection);
    const select = (label: string, values: number[], current: number, format: (v: number) => string, key: keyof PhySelection) =>
      h('label', { class: 'cs-field' },
        h('span', {}, label),
        h('select', {
          disabled: locked,
          onchange: (e: Event) => void this.applyPhy({ ...this.selection, [key]: Number((e.target as HTMLSelectElement).value) }),
        }, ...values.map(v => h('option', { value: v, selected: v === current }, format(v)))),
      );
    const check = (label: string, key: keyof ChannelCard['flags'], title: string) =>
      h('label', { class: 'cs-check', title },
        h('input', {
          type: 'checkbox',
          checked: this.flags[key],
          disabled: locked,
          onchange: (e: Event) => void this.applyPhy(this.selection, { ...this.flags, [key]: (e.target as HTMLInputElement).checked }),
        }),
        label,
      );
    return h('div', { class: 'cs-phy', title: connected ? 'Disconnect to change the PHY settings' : '' },
      h('h3', { class: 'cs-channel-title' }, 'Device PHY Settings'),
      select('Nominal:', options.nominalBitrates, this.selection.nominalBitrate, formatBitrate, 'nominalBitrate'),
      select('Data:', options.dataBitrates, this.selection.dataBitrate, formatBitrate, 'dataBitrate'),
      select('Sample Point:', options.samplePoints, this.selection.samplePoint, formatSamplePoint, 'samplePoint'),
      h('div', { class: 'cs-checks' },
        check('Listen Only', 'listenOnly', 'Receive without acknowledging frames or transmitting'),
        check('Auto Reset', 'autoReset', 'Recover automatically from bus-off'),
        check('Error Frames', 'errorFrames', 'Report CAN error frames'),
      ),
    );
  }
}
