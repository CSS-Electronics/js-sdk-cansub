/**
 * Raw CAN frames to and from CSV in webCAN's raw trace format, so files move freely
 * between an app, webCAN (Trace view export/import) and python-can-cansub
 * (`can.LogReader`, `can_player`, `can_logger`).
 */
import { CanFrame } from '@csselectronics/websocket-client/models/CanFrame';
import { dlc2len, len2dlc } from '@csselectronics/websocket-client/protocol/CANSubProtocol';
import type { CanBusName } from '@csselectronics/websocket-client/types/CanBusTypes';

/** The header row; columns are separated by `;`. */
export const CSV_HEADER = 'TimestampEpoch;BusChannel;ID;IDE;DLC;DataLength;Dir;EDL;BRS;ESI;RTR;DataBytes';

const HEX = /^[0-9A-Fa-f]*$/;
const bit = (b: boolean): string => (b ? '1' : '0');
const hex = (data: Uint8Array): string => Array.from(data, b => b.toString(16).toUpperCase().padStart(2, '0')).join('');

/** Seconds with 6 decimals, rounded via whole microseconds like webCAN. */
function formatEpoch(epoch: number): string {
  const us = Math.round(epoch * 1_000_000);
  return `${Math.floor(us / 1_000_000)}.${String(us % 1_000_000).padStart(6, '0')}`;
}

/**
 * CSV text for frames in the order given (sort by `epoch` first to mix channels).
 * Error frames and frames reassembled from transport protocols are left out, as in
 * webCAN's export.
 */
export function framesToCsv(frames: Iterable<CanFrame>): string {
  const lines = [CSV_HEADER];
  for (const f of frames) {
    if (f.is_error || f.synthetic) continue;
    lines.push([
      formatEpoch(f.epoch),
      f.bus.slice(3),
      f.arbitration_id.toString(16).toUpperCase().padStart(f.ide ? 8 : 3, '0'),
      bit(f.ide),
      String(len2dlc(f.len)),
      String(f.len),
      bit(f.is_tx),
      bit(f.is_fd),
      bit(f.is_brs),
      bit(f.is_esi),
      bit(f.is_rtr),
      hex(f.data),
    ].join(';'));
  }
  return lines.join('\n');
}

/**
 * Frames from CSV text in the format of `framesToCsv`. Rows that do not parse are
 * skipped and reported in `errors` (`Row 12: invalid CAN ID "XYZ"`); error-frame rows
 * are skipped silently. The frames keep the file's order.
 */
export function csvToFrames(text: string): { frames: CanFrame[]; errors: string[] } {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines[0]?.trim() !== CSV_HEADER) {
    return { frames: [], errors: [`Not a raw CAN CSV file. The first line must be: ${CSV_HEADER}`] };
  }
  const frames: CanFrame[] = [];
  const errors: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const result = parseRow(lines[i].split(';'), frames.length);
    if (typeof result === 'string') errors.push(`Row ${i + 1}: ${result}`);
    else if (result) frames.push(result);
  }
  return { frames, errors };
}

/** A frame, an error message, or null for a row to skip. */
function parseRow(c: string[], id: number): CanFrame | string | null {
  if (c.length < 12) return `expected 12 columns, got ${c.length}`;
  if (c[11] === 'Error frame') return null;
  const epoch = parseFloat(c[0]);
  if (!(epoch > 0)) return `invalid timestamp "${c[0]}"`;
  const channel = Number(c[1]);
  if (!Number.isInteger(channel) || channel < 1 || channel > 4) return `invalid channel "${c[1]}" (expected 1-4)`;
  const ide = c[3] === '1';
  const canId = parseInt(c[2], 16);
  if (!c[2] || !HEX.test(c[2]) || canId > (ide ? 0x1fffffff : 0x7ff)) return `invalid CAN ID "${c[2]}"`;
  const isFd = c[7] === '1';
  const dlc = parseInt(c[4], 10);
  if (!isFd && dlc > 8) return `classic CAN frame with DLC ${dlc} (use DLC 8)`;
  let len: number;
  try {
    len = dlc2len(dlc);
  } catch {
    return `invalid DLC "${c[4]}"`;
  }
  const isRtr = c[10] === '1';
  if (c[11].length % 2 || !HEX.test(c[11])) return `invalid data bytes "${c[11]}"`;
  const data = isRtr ? new Uint8Array(0) : Uint8Array.from(c[11].match(/../g) ?? [], b => parseInt(b, 16));
  if (!isRtr && data.length !== len) return `DLC ${dlc} (${len} bytes) disagrees with ${data.length} data bytes`;
  return new CanFrame(id, `CAN${channel}` as CanBusName, canId, epoch, data, ide, len,
    c[6] === '1', isFd, c[8] === '1', c[9] === '1', isRtr);
}

/** Save text as a `.csv` file through the browser's download. */
export function downloadCsv(text: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: fileName });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
