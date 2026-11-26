/**
 * signal-chart: plot decoded signals live. Pick signals from any message and channel
 * in the sidebar; the chart uses the same clock, query and rendering as webCAN.
 */
import { CansubSession, mountSidebar, mountSignalPicker, mountLiveChart, h } from '../../shared/ui';
// Imported (not fetched) so the built single-file app works on its own.
import canmodTempDbc from '../../sample-data/canmod-temp.dbc?raw';

const session = new CansubSession();

const picker = h('div');
mountSidebar(document.getElementById('sidebar')!, session, {
  title: 'Signal chart',
  dbc: { defaults: [{ name: 'canmod-temp.dbc', content: canmodTempDbc }] },
  extra: h('section', { class: 'cs-section' }, h('h2', { class: 'cs-section-title' }, 'Signals'), picker),
});

const chart = mountLiveChart(document.getElementById('chart')!, session, { windowSeconds: 10 });
mountSignalPicker(picker, session, { onChange: keys => chart.setSignals(keys), max: 8 });

let frameCount = 0;
session.onFrames(frames => { frameCount += frames.length; });
session.onUpdate(() => {
  document.getElementById('frame-count')!.textContent = frameCount.toLocaleString();
});
