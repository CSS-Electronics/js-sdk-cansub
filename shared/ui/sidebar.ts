import type { CansubSession } from './session';
import { h } from './dom';
import { mountDevicePanel } from './devicePanel';
import { mountChannelPanel } from './channelPanel';
import { mountDbcPanel, type DbcPanelOptions } from './dbcPanel';

export interface SidebarOptions {
  /** App name shown at the top. */
  title?: string;
  /** Show bit-rate and PHY settings per channel (default true). */
  phy?: boolean;
  /** DBC section: false hides it, an object configures it (e.g. bundled default files). Default shown. */
  dbc?: boolean | DbcPanelOptions;
  /** Extra content at the bottom of the sidebar, e.g. a signal picker. */
  extra?: HTMLElement;
}

/**
 * The standard left panel: device URL, one card per channel (connect, bit rate)
 * and the DBC files. Each section is also available on its own (`mountDevicePanel`,
 * `mountChannelPanel`, `mountDbcPanel`) for custom layouts.
 */
export function mountSidebar(container: HTMLElement, session: CansubSession, options: SidebarOptions = {}): () => void {
  const section = (title: string, body: HTMLElement) =>
    h('section', { class: 'cs-section' }, h('h2', { class: 'cs-section-title' }, title), body);

  const device = h('div');
  const channels = h('div');
  const dbc = options.dbc === false ? null : h('div');

  container.classList.add('cs-sidebar');
  container.replaceChildren(
    options.title ? h('h1', { class: 'cs-app-title' }, options.title) : '',
    section('Device', device),
    section('CAN channels', channels),
    dbc ? section('DBC files', dbc) : '',
    options.extra ?? '',
  );

  const disposers = [
    mountDevicePanel(device, session),
    mountChannelPanel(channels, session, { phy: options.phy }),
  ];
  if (dbc) disposers.push(mountDbcPanel(dbc, session, typeof options.dbc === 'object' ? options.dbc : {}));
  return () => disposers.forEach(d => d());
}
