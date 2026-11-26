/**
 * message-summary: one row per CAN ID with frame count, frame rate and the latest data,
 * plus each channel's frame rate and bus load as measured by the device.
 */
import { StatisticsService } from '@csselectronics/can-pipeline/services/pipeline/StatisticsService';
import { compareItemKeys } from '@csselectronics/can-pipeline/utils/compareItemKeys';
import { formatDataBytes } from '@csselectronics/websocket-client/utils/DataFormatter';
import { formatEpochLong } from '@csselectronics/websocket-client/utils/EpochFormatter';
import { CansubSession, mountSidebar, h } from '../../shared/ui';

const session = new CansubSession();
mountSidebar(document.getElementById('sidebar')!, session, { title: 'Message summary', dbc: false });

const statistics = new StatisticsService();
session.onFrames(frames => {
  for (const f of frames) statistics.addFrame(f);
});

// Device-side rates, polled every second like webCAN's status bar. Unlike values computed
// in onUpdate (which only runs while frames arrive), they drop to 0 when the bus goes quiet.
setInterval(async () => {
  const api = session.api;
  if (!api) return;
  try {
    const statuses = await Promise.all(session.buses.map(async bus => ({ bus, status: await api.apiCanChannelGet({ channel: Number(bus.slice(3)) }) })));
    const connected = statuses.filter(s => session.isConnected(s.bus));
    document.getElementById('fps')!.textContent = String(connected.reduce((sum, s) => sum + s.status.frameRate, 0));
    document.getElementById('channel-status')!.replaceChildren(...statuses.map(({ bus, status }) =>
      h('div', {}, `${bus}: `, h('b', {}, `${status.frameRate} frames/s, ${status.busLoad} % bus load`))));
  } catch { /* device not reachable: keep the last values */ }
}, 1000);

const tbody = document.getElementById('msg-tbody')!;
session.onUpdate(() => {
  // The session registers every message it sees; keys sort by channel, then ID.
  const messages = session.messages.getAvailableMessages();
  const total = statistics.getTotalStatistics();
  document.getElementById('msg-count')!.textContent = messages.size.toLocaleString();
  document.getElementById('frame-count')!.textContent = total.totalFrames.toLocaleString();

  tbody.replaceChildren(...[...messages.keys()].sort(compareItemKeys).flatMap(key => {
    const info = messages.get(key)!;
    const summary = statistics.getMessageSummary(key);
    if (!summary) return [];
    return [h('tr', {},
      h('td', {}, info.bus),
      h('td', {}, `${info.displayLabel}${info.isTx ? ' TX' : ''}`),
      h('td', { class: 'cs-num' }, summary.totalFrames.toLocaleString()),
      h('td', { class: 'cs-num' }, summary.framesPerSecond.toFixed(1)),
      h('td', { class: 'cs-num' }, summary.latestLen),
      h('td', {}, formatDataBytes(summary.latestData)),
      h('td', {}, formatEpochLong(summary.lastEpoch)),
    )];
  }));
});

