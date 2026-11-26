/**
 * csv-files: export the frames stored in the session as CSV, and import a CSV file to
 * inspect it. The format is webCAN's raw trace CSV, so the files also work in webCAN
 * and python-can-cansub (e.g. `can_player` to replay a file on a CANsub channel).
 */
import type { CanFrame } from '@csselectronics/websocket-client/models/CanFrame';
import { kWayMergeAscending } from '@csselectronics/can-pipeline/utils/epochQuery';
import { formatCanId, formatDataBytes } from '@csselectronics/websocket-client/utils/DataFormatter';
import { formatEpochLong } from '@csselectronics/websocket-client/utils/EpochFormatter';
import { CansubSession, mountSidebar, csvToFrames, downloadCsv, framesToCsv, h } from '../../shared/ui';

const PREVIEW_ROWS = 50;
const $ = (id: string) => document.getElementById(id)!;

const session = new CansubSession();
mountSidebar($('sidebar'), session, { title: 'CSV files', dbc: false });

// ── Export: the stored frames of every channel in a time window, in time order ─
const exportButton = $('export') as HTMLButtonElement;
session.onUpdate(() => {
  const stored = session.storage.getStoredCount();
  $('stored').textContent = stored.toLocaleString();
  exportButton.disabled = stored === 0;
});
// Epoch seconds; narrow it for e.g. the last 10 s: [lastEpoch - 10, lastEpoch].
const EXPORT_WINDOW: [number, number] = [-Infinity, Infinity];
exportButton.onclick = () => {
  // Per-channel slices merged by time, as webCAN's export does.
  const slices = session.buses.flatMap(bus => session.storage.getFramesInTimeWindowForBus(...EXPORT_WINDOW, bus) ?? []);
  const last = session.storage.getLastFrame();
  if (slices.length && last) downloadCsv(framesToCsv(kWayMergeAscending(slices)), `${fileStamp(last.epoch)}-CANsub-export-raw.csv`);
};

/** `YYMMDD-HHMMSS` in local time, as in webCAN's export file names. */
function fileStamp(epoch: number): string {
  const d = new Date(epoch * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getFullYear() % 100)}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// ── Import: parse a file and summarise it (the session storage is not touched) ─
const fileInput = $('file') as HTMLInputElement;
$('pick').onclick = () => fileInput.click();
fileInput.onchange = () => { if (fileInput.files?.[0]) void importFile(fileInput.files[0]); };
const drop = $('drop');
drop.ondragover = e => { e.preventDefault(); drop.classList.add('cs-drop-over'); };
drop.ondragleave = () => drop.classList.remove('cs-drop-over');
drop.ondrop = e => {
  e.preventDefault();
  drop.classList.remove('cs-drop-over');
  const file = e.dataTransfer?.files[0];
  if (file) void importFile(file);
};

async function importFile(file: File): Promise<void> {
  const { frames, errors } = csvToFrames(await file.text());
  const errorBox = $('import-errors');
  errorBox.hidden = errors.length === 0;
  errorBox.textContent = errors.length ? `${errors.length} rows skipped. ${errors.slice(0, 3).join('; ')}` : '';

  const first = frames[0]?.epoch ?? 0;
  const last = frames[frames.length - 1]?.epoch ?? 0;
  $('import-stats').replaceChildren(
    h('div', {}, 'File: ', h('b', {}, file.name)),
    h('div', {}, 'Frames: ', h('b', {}, frames.length.toLocaleString())),
    h('div', {}, 'Channels: ', h('b', {}, [...new Set(frames.map(f => f.bus))].sort().join(', ') || '-')),
    h('div', {}, 'Duration: ', h('b', {}, `${(last - first).toFixed(1)} s`)),
  );

  // One row per channel and CAN ID (frame.key also tells IDE, direction and RTR apart).
  const ids = new Map<string, { frame: CanFrame; count: number; first: number }>();
  for (const f of frames) {
    const entry = ids.get(f.key);
    if (entry) { entry.count++; entry.frame = f; } else ids.set(f.key, { frame: f, count: 1, first: f.epoch });
  }
  $('id-tbody').replaceChildren(...[...ids.values()]
    .sort((a, b) => a.frame.bus.localeCompare(b.frame.bus) || a.frame.arbitration_id - b.frame.arbitration_id)
    .map(({ frame: f, count, first: start }) => h('tr', {},
      h('td', {}, f.bus),
      h('td', {}, `${formatCanId(f.arbitration_id, f.ide)}${f.is_tx ? ' TX' : ''}`),
      h('td', { class: 'cs-num' }, count.toLocaleString()),
      h('td', { class: 'cs-num' }, f.epoch > start ? ((count - 1) / (f.epoch - start)).toFixed(1) : '-'),
      h('td', { class: 'cs-num' }, f.len),
      h('td', {}, formatDataBytes(f.data)),
    )));
  $('row-tbody').replaceChildren(...frames.slice(0, PREVIEW_ROWS).map(f => h('tr', {},
    h('td', {}, formatEpochLong(f.epoch)),
    h('td', {}, f.bus),
    h('td', {}, formatCanId(f.arbitration_id, f.ide)),
    h('td', {}, f.is_tx ? 'TX' : 'RX'),
    h('td', { class: 'cs-num' }, f.len),
    h('td', {}, formatDataBytes(f.data)),
  )));
}
