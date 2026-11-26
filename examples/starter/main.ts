/**
 * starter: the template for your own app. The sidebar handles the device, channels,
 * bit rates and DBC files; the code below is the app itself. Replace the table with
 * whatever you want to build from the decoded signals (or raw frames).
 */
import { CansubSession, mountSidebar, mountSignalPicker, h } from '../../shared/ui';
// Imported (not fetched) so the built single-file app works on its own.
import canmodTempDbc from '../../sample-data/canmod-temp.dbc?raw';

const session = new CansubSession();

const picker = h('div');
mountSidebar(document.getElementById('sidebar')!, session, {
  title: 'Starter',
  dbc: { defaults: [{ name: 'canmod-temp.dbc', content: canmodTempDbc }] },
  extra: h('section', { class: 'cs-section' }, h('h2', { class: 'cs-section-title' }, 'Signals'), picker),
});

// ── App state: the latest value of each selected signal ─────────────────────
let selectedKeys: string[] = [];
const latest = new Map<string, number>();
let frameCount = 0;

session.onFrames(frames => {
  frameCount += frames.length;
  for (const frame of frames) {
    const keys = frame.getSignalKeys();
    for (let i = 0; i < keys.length; i++) latest.set(keys[i], frame.getSignalValueByIndex(i));
  }
});

// ── Rendering: once per batch (~10 Hz), never per frame ─────────────────────
const tbody = document.getElementById('values')!;
function render(): void {
  document.getElementById('frame-count')!.textContent = frameCount.toLocaleString();
  document.getElementById('signal-count')!.textContent = String(session.getSignals().size);
  tbody.replaceChildren(...selectedKeys.map(key => {
    const value = latest.get(key);
    const { label, unit } = session.describeSignal(key);
    return h('tr', {},
      h('td', {}, label),
      h('td', { class: 'cs-num' }, value === undefined ? '-' : value.toFixed(2)),
      h('td', {}, unit),
    );
  }));
}
session.onUpdate(render);
mountSignalPicker(picker, session, { onChange: keys => { selectedKeys = keys; render(); } });
