/**
 * raw-frame-viewer — the minimal can-protocol-only example.
 *
 * Uses *only* `@csselectronics/websocket-client` — no `@csselectronics/can-types`, no
 * `@csselectronics/can-pipeline`, no `@csselectronics/can-decode`. Demonstrates the smallest
 * possible integration: open a WebSocket to a CANsub device, stream raw
 * `CanFrame`s, and render the most recent one on screen.
 *
 * Drop-in template for node-red bridges, custom data forwarders, or
 * anything else that just wants "frames in" without aggregation or
 * decoding. Roughly 30 lines of business logic.
 */

import { WorkerBridge } from '@csselectronics/websocket-client';
import { formatCanId, formatDataBytes } from '@csselectronics/websocket-client/utils/DataFormatter';
import { formatEpochLong } from '@csselectronics/websocket-client/utils/EpochFormatter';
import type { CanFrame } from '@csselectronics/websocket-client/models/CanFrame';
import InlineWorker from '../../shared/worker.ts?worker&inline';
import { connectForm } from '../../shared/ConnectForm';

const { url, bus } = await connectForm(document.getElementById('connect-bar')!);

const bridge = new WorkerBridge(new InlineWorker());

// ── State ──────────────────────────────────────────────────────────────────
// Just two counters and the most recent frame. No storage, no statistics.
let totalFrames = 0;
let latestFrame: CanFrame | null = null;
let lastBatchAt = 0;
let batchesPerSecond = 0;

// ── DOM refs ───────────────────────────────────────────────────────────────
const statusEl       = document.getElementById('status')!;
const totalEl        = document.getElementById('total')!;
const bpsEl          = document.getElementById('bps')!;
const busEl          = document.getElementById('latest-bus')!;
const idEl           = document.getElementById('latest-id')!;
const dirEl          = document.getElementById('latest-dir')!;
const lenEl          = document.getElementById('latest-len')!;
const dataEl         = document.getElementById('latest-data')!;
const epochEl        = document.getElementById('latest-epoch')!;

// ── Frame ingestion ────────────────────────────────────────────────────────
bridge.onBatch((frames: CanFrame[]) => {
  totalFrames += frames.length;
  if (frames.length > 0) latestFrame = frames[frames.length - 1];
  const now = performance.now();
  if (lastBatchAt > 0) {
    const dt = (now - lastBatchAt) / 1000;
    batchesPerSecond = 1 / dt;
  }
  lastBatchAt = now;
});

bridge.onBatchDone(render);

// ── Rendering ──────────────────────────────────────────────────────────────
function render(): void {
  totalEl.textContent = totalFrames.toLocaleString();
  bpsEl.textContent = batchesPerSecond.toFixed(1);

  if (!latestFrame) return;
  const f = latestFrame;
  busEl.textContent   = f.bus;
  idEl.textContent    = formatCanId(f.arbitration_id, f.ide);
  dirEl.textContent   = f.is_tx ? 'TX' : 'RX';
  lenEl.textContent   = String(f.len);
  dataEl.textContent  = formatDataBytes(f.data) || '(empty)';
  epochEl.textContent = formatEpochLong(f.epoch);
}

// ── Connect ────────────────────────────────────────────────────────────────
if (url) bridge.init(url);
statusEl.textContent = `Connecting on ${bus}...`;

try {
  await bridge.connect(bus);
  statusEl.innerHTML = `Connected on <b>${bus}</b>`;
} catch (e) {
  statusEl.innerHTML = `<span class="cs-error">Connection failed: ${e}</span>`;
}
