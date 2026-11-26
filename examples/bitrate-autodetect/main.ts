/**
 * bitrate-autodetect: find the bit rate of an unknown CAN bus.
 *
 * Shows the two base packages working together: `@csselectronics/rest-client` sets each
 * candidate bit rate on the device, `@csselectronics/websocket-client` listens for frames.
 * The detection is one self-contained function, `detectBitrate()`: Copy it into your own
 * app when you need it. webCAN's auto-detect works the same way.
 */
import {
  createApiClient,
  formatBitrate,
  formatSamplePoint,
  getTiming,
  type DefaultApi,
} from '@csselectronics/rest-client';
import { WorkerBridge } from '@csselectronics/websocket-client/workers/WorkerBridge';
import { ConnectionService } from '@csselectronics/websocket-client/services/pipeline/ConnectionService';
import type { CanFrame } from '@csselectronics/websocket-client/models/CanFrame';
import type { CanBusName } from '@csselectronics/websocket-client/types/CanBusTypes';
import InlineWorker from '../../shared/worker.ts?worker&inline';
import { connectForm } from '../../shared/ConnectForm';

// ── Detection ──────────────────────────────────────────────────────────────

/** A bit rate to try: nominal and data bit rate (bit/s), sample point (%). */
interface Candidate { nominal: number; data: number; samplePoint: number }

/** Most common first: classical CAN rates, then CAN FD data rates at 500k and 1M. */
const SEQUENCE: Candidate[] = [
  { nominal: 250_000, data: 1_000_000, samplePoint: 80 },
  { nominal: 500_000, data: 1_000_000, samplePoint: 80 },
  { nominal: 1_000_000, data: 1_000_000, samplePoint: 80 },
  { nominal: 800_000, data: 1_000_000, samplePoint: 80 },
  { nominal: 200_000, data: 1_000_000, samplePoint: 80 },
  { nominal: 125_000, data: 1_000_000, samplePoint: 80 },
  { nominal: 100_000, data: 1_000_000, samplePoint: 80 },
  { nominal: 50_000, data: 1_000_000, samplePoint: 80 },
  { nominal: 500_000, data: 2_000_000, samplePoint: 80 },
  { nominal: 500_000, data: 4_000_000, samplePoint: 80 },
  { nominal: 500_000, data: 5_000_000, samplePoint: 81.25 },
  { nominal: 1_000_000, data: 2_000_000, samplePoint: 80 },
  { nominal: 1_000_000, data: 4_000_000, samplePoint: 80 },
  { nominal: 1_000_000, data: 5_000_000, samplePoint: 81.25 },
];

/** How long to listen at each bit rate. */
const LISTEN_MS = 1000;

/** 'valid': a frame arrived (right bit rate). 'error': only error frames (wrong bit rate). 'none': silence. */
type ListenResult = 'valid' | 'error' | 'none';

interface DetectOptions {
  signal?: AbortSignal;
  onAttempt?: (candidate: Candidate, index: number, total: number) => void;
  onResult?: (candidate: Candidate, index: number, result: ListenResult) => void;
}

/**
 * Try each candidate bit rate on a channel until a valid frame arrives. Returns the match,
 * or null when none matched or `signal` aborted. Afterwards the channel is disconnected and
 * its PHY holds the original flags with the detected timing (or the original PHY when
 * nothing matched), so the app can connect in its usual mode.
 */
async function detectBitrate(
  api: DefaultApi,
  connection: ConnectionService,
  bridge: WorkerBridge,
  bus: CanBusName,
  options: DetectOptions = {},
): Promise<Candidate | null> {
  const channel = Number(bus.slice(3));
  const original = await api.apiCanChannelPhyGet({ channel });
  let detected: Candidate | null = null;

  try {
    for (let i = 0; i < SEQUENCE.length && !options.signal?.aborted; i++) {
      const candidate = SEQUENCE[i];
      const timing = getTiming(candidate.nominal, candidate.data, candidate.samplePoint);
      if (!timing) continue;
      options.onAttempt?.(candidate, i, SEQUENCE.length);

      // The device only accepts PHY changes on a closed channel.
      await connection.disconnectBus(bus);
      // Listen-only stays passive on a bus we don't know yet. Error frames tell a wrong bit
      // rate (errors) apart from a silent bus (nothing at all).
      await api.apiCanChannelPhyPut({
        channel,
        phy: { listenOnly: true, autoReset: true, errorFrames: true, txAckFrames: true, ...timing },
      });
      await connection.connectBus(bus);

      const result = await listen(bridge, bus, LISTEN_MS, options.signal);
      if (options.signal?.aborted) break;
      options.onResult?.(candidate, i, result);
      if (result === 'valid') {
        detected = candidate;
        break;
      }
    }
  } finally {
    // Runs on success, failure, stop and errors, so the device never stays in detection mode.
    await connection.disconnectBus(bus).catch(() => {});
    const timing = detected && getTiming(detected.nominal, detected.data, detected.samplePoint);
    await api.apiCanChannelPhyPut({ channel, phy: timing ? { ...original, ...timing } : original });
  }
  return detected;
}

/** Listen on a bus: resolves 'valid' at the first valid frame, else 'error' or 'none' after `ms`. */
function listen(bridge: WorkerBridge, bus: CanBusName, ms: number, signal?: AbortSignal): Promise<ListenResult> {
  return new Promise(resolve => {
    let sawError = false;
    const done = (result: ListenResult) => {
      clearTimeout(timer);
      unsubscribe();
      signal?.removeEventListener('abort', onAbort);
      resolve(result);
    };
    const timer = setTimeout(() => done(sawError ? 'error' : 'none'), ms);
    const unsubscribe = bridge.onBatch((frames: CanFrame[]) => {
      for (const frame of frames) {
        if (frame.bus !== bus) continue;
        if (!frame.is_error) return done('valid');
        sawError = true;
      }
    });
    const onAbort = () => done('none');
    signal?.addEventListener('abort', onAbort);
  });
}

// ── Page ───────────────────────────────────────────────────────────────────

const RESULT_TEXT: Record<ListenResult, string> = {
  valid: 'frames received: match',
  error: 'error frames only',
  none: 'no frames',
};

const { url, bus } = await connectForm(document.getElementById('connect-bar')!, { label: 'detect' });

const api = createApiClient(url);
const bridge = new WorkerBridge(new InlineWorker());
bridge.init(url);
const connection = new ConnectionService(bridge);

const statusEl = document.getElementById('status')!;
const tbody = document.getElementById('attempts')!;
const stopBtn = document.getElementById('stop') as HTMLButtonElement;
const againBtn = document.getElementById('again') as HTMLButtonElement;

const label = (c: Candidate) =>
  `${formatBitrate(c.nominal)} | data ${formatBitrate(c.data)} | sample point ${formatSamplePoint(c.samplePoint)}`;

async function run(): Promise<void> {
  const abort = new AbortController();
  stopBtn.hidden = false;
  againBtn.hidden = true;
  stopBtn.onclick = () => abort.abort();
  tbody.replaceChildren();
  const rows: HTMLTableRowElement[] = [];

  try {
    const detected = await detectBitrate(api, connection, bridge, bus, {
      signal: abort.signal,
      onAttempt: (c, i, total) => {
        statusEl.textContent = `Trying ${formatBitrate(c.nominal)} on ${bus} (${i + 1}/${total})…`;
        const row = document.createElement('tr');
        row.innerHTML = `<td class="cs-num">${i + 1}</td><td>${formatBitrate(c.nominal)}</td><td>${formatBitrate(c.data)}</td><td>${formatSamplePoint(c.samplePoint)}</td><td class="cs-muted">listening…</td>`;
        rows[i] = row;
        tbody.append(row);
      },
      onResult: (_c, i, result) => {
        const cell = rows[i].lastElementChild!;
        cell.textContent = RESULT_TEXT[result];
        cell.className = result === 'valid' ? 'ok' : 'cs-muted';
      },
    });
    statusEl.innerHTML = detected
      ? `<b>Detected on ${bus}: ${label(detected)}</b>. The device now uses this bit rate with your original PHY settings.`
      : abort.signal.aborted
        ? 'Stopped. The original PHY settings are restored.'
        : 'No matching bit rate found. Is the channel wired to a bus with traffic? The original PHY settings are restored.';
  } catch (e) {
    statusEl.innerHTML = `<span class="cs-error">Detection failed: ${e instanceof Error ? e.message : e}</span>`;
  } finally {
    for (const row of rows) {
      const cell = row?.lastElementChild;
      if (cell?.textContent === 'listening…') cell.textContent = 'stopped';
    }
    stopBtn.hidden = true;
    againBtn.hidden = false;
  }
}

againBtn.onclick = () => void run();
void run();
