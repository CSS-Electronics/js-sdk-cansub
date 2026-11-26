/**
 * CANsub binary protocol decoder (HDLC with bytestuffing and CRC32)
 *
 * Decode path: cansub_decode_into() + FrameBatchWriter
 *   Decodes HDLC wire data and writes frames into a flat ArrayBuffer
 *   for zero-copy transfer from worker to main thread.
 *
 * Protocol details:
 * - HDLC framing with 0x7E boundary byte
 * - Bytestuffing: 0x7D escape byte XORed with 0x20
 * - CRC32 checksum (big-endian) at end of each frame
 * - Timestamp offset from 2025-01-01 00:00:00 UTC (1735689600)
 */

import { Buffer } from "./Buffer";
import { crc32 } from "./CRC";
import { CanFrame } from "../models/CanFrame";
import { BUS_INTERN } from "../models/CanFrame";
import type { CanBusName } from "../types/CanBusTypes";

const _scratchBuf = new Buffer();

const HDLC_BOUNDARY_BYTE = 0x7E;
const HDLC_ESCAPE_BYTE = 0x7D;
const MSG_ENCODE_HEADER_MIN_SIZE = 9;

/* The encoded timestamp is offset by date 2025/01/01 00:00:00 UTC. */
const MSG_ENCODE_TIME_MIN = 1735689600;

// ============================================================================
// Binary batch format (production path)
// ============================================================================

/**
 * Per-frame header size in the flat batch buffer.
 *
 * Layout (little-endian, per frame):
 *   [0..7]   Float64  epoch (seconds)
 *   [8..11]  Uint32   arbitration_id
 *   [12]     Uint8    bus index (0–3 → CAN1–CAN4)
 *   [13]     Uint8    flags  [7:fd 6:brs 5:esi 4:rtr 3:tx 2:error 1:ide 0:reserved]
 *   [14]     Uint8    len (declared byte length, 0–64; for RTR this is dlc2len(wire_dlc))
 *   [15..]   Uint8[]  data payload (data.length bytes; 0 for RTR — len ≠ data.length there)
 *
 * Stride per frame = FRAME_HEADER_BYTES + data.length.
 * The batch buffer starts with a 4-byte Uint32 frame count.
 */
export const FRAME_HEADER_BYTES = 15;

/** Batch header: 4-byte frame count at offset 0. */
export const BATCH_HEADER_BYTES = 4;

/** Flag bit positions within the packed flags byte. */
const FLAG_FD    = 0x80;
const FLAG_BRS   = 0x40;
const FLAG_ESI   = 0x20;
const FLAG_RTR   = 0x10;
const FLAG_TX    = 0x08;
const FLAG_ERROR = 0x04;
const FLAG_IDE   = 0x02;

/**
 * Accumulates decoded CAN frames into a flat ArrayBuffer
 * for zero-copy transfer via postMessage.
 */
export class FrameBatchWriter {
  private buffer: ArrayBuffer;
  private view: DataView;
  private bytes: Uint8Array;
  private offset = BATCH_HEADER_BYTES; // skip frame-count header
  private count = 0;

  constructor(initialCapacity = 16384) {
    this.buffer = new ArrayBuffer(initialCapacity);
    this.view = new DataView(this.buffer);
    this.bytes = new Uint8Array(this.buffer);
  }

  /** Number of frames written so far. */
  get frameCount(): number { return this.count; }

  /** Ensure the buffer can hold at least `needed` more bytes. */
  private ensureCapacity(needed: number): void {
    const required = this.offset + needed;
    if (required <= this.buffer.byteLength) return;
    let newSize = this.buffer.byteLength * 2;
    while (newSize < required) newSize *= 2;
    const newBuf = new ArrayBuffer(newSize);
    new Uint8Array(newBuf).set(this.bytes.subarray(0, this.offset));
    this.buffer = newBuf;
    this.view = new DataView(this.buffer);
    this.bytes = new Uint8Array(this.buffer);
  }

  /**
   * Write a decoded frame into the batch buffer.
   * All numeric fields use little-endian (platform-native for x86/ARM).
   *
   * `len` is the declared byte length (== dlc2len(wire_dlc)); for RTR this
   * is the requested length even though `dataLen` (actual bytes to copy) is 0.
   */
  writeFrame(
    epoch: number,
    arbitration_id: number,
    busIndex: number,
    len: number,
    dataLen: number,
    data: Uint8Array,
    dataOffset: number,
    is_fd: boolean,
    is_brs: boolean,
    is_esi: boolean,
    is_rtr: boolean,
    is_tx: boolean,
    is_error: boolean,
    is_ide: boolean,
  ): void {
    this.ensureCapacity(FRAME_HEADER_BYTES + dataLen);
    const o = this.offset;
    this.view.setFloat64(o, epoch, true);
    this.view.setUint32(o + 8, arbitration_id, true);
    this.bytes[o + 12] = busIndex;
    this.bytes[o + 13] =
      (is_fd    ? FLAG_FD    : 0) |
      (is_brs   ? FLAG_BRS   : 0) |
      (is_esi   ? FLAG_ESI   : 0) |
      (is_rtr   ? FLAG_RTR   : 0) |
      (is_tx    ? FLAG_TX    : 0) |
      (is_error ? FLAG_ERROR : 0) |
      (is_ide   ? FLAG_IDE   : 0);
    this.bytes[o + 14] = len;
    if (dataLen > 0) {
      this.bytes.set(data.subarray(dataOffset, dataOffset + dataLen), o + FRAME_HEADER_BYTES);
    }
    this.offset += FRAME_HEADER_BYTES + dataLen;
    this.count++;
  }

  /**
   * Finalize the batch: write the frame count header and return a
   * right-sized ArrayBuffer ready for transfer.
   */
  finish(): ArrayBuffer {
    // Write frame count at offset 0
    const out = new ArrayBuffer(this.offset);
    const outView = new DataView(out);
    const outBytes = new Uint8Array(out);
    outView.setUint32(0, this.count, true);
    outBytes.set(this.bytes.subarray(BATCH_HEADER_BYTES, this.offset), BATCH_HEADER_BYTES);
    return out;
  }

  /** Reset for next batch (reuses underlying buffer). */
  reset(): void {
    this.offset = BATCH_HEADER_BYTES;
    this.count = 0;
  }
}

/** Bus index → interned CanBusName (0-indexed: channel 1–4 maps to index 0–3). */
const INDEX_TO_BUS: readonly CanBusName[] = [BUS_INTERN.CAN1, BUS_INTERN.CAN2, BUS_INTERN.CAN3, BUS_INTERN.CAN4];

/**
 * Parse a transferred batch ArrayBuffer into CanFrame instances.
 * Called on the main thread after receiving a transferred buffer from the worker.
 *
 * @param buffer - The transferred ArrayBuffer (batch header + packed frames)
 * @returns Array of CanFrame instances
 */
export function parseFrameBatch(buffer: ArrayBuffer): CanFrame[] {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const count = view.getUint32(0, true);
  const frames: CanFrame[] = new Array(count);

  let offset = BATCH_HEADER_BYTES;
  for (let i = 0; i < count; i++) {
    const epoch = view.getFloat64(offset, true);
    const arbitration_id = view.getUint32(offset + 8, true);
    const busIndex = bytes[offset + 12];
    const flags = bytes[offset + 13];
    const len = bytes[offset + 14];
    const is_rtr = (flags & FLAG_RTR) !== 0;
    // RTR frames carry no payload bytes — `len` is the requested length but the
    // payload stride is 0. Non-RTR frames have stride == len.
    const dataLen = is_rtr ? 0 : len;

    const bus = INDEX_TO_BUS[busIndex] ?? INDEX_TO_BUS[0];
    const data = dataLen > 0
      ? bytes.slice(offset + FRAME_HEADER_BYTES, offset + FRAME_HEADER_BYTES + dataLen)
      : _emptyData;

    frames[i] = new CanFrame(
      0, // id assigned later by FullFrameStorageService.assignId()
      bus,
      arbitration_id,
      epoch,
      data,
      (flags & FLAG_IDE)   !== 0,
      len,
      (flags & FLAG_TX)    !== 0,
      (flags & FLAG_FD)    !== 0,
      (flags & FLAG_BRS)   !== 0,
      (flags & FLAG_ESI)   !== 0,
      is_rtr,
      (flags & FLAG_ERROR) !== 0,
    );

    offset += FRAME_HEADER_BYTES + dataLen;
  }

  return frames;
}

/**
 * Decode HDLC wire data and write frames into a FrameBatchWriter.
 * No intermediate object allocation - writes directly into flat ArrayBuffer.
 *
 * @param buffer - Receive buffer with incoming WebSocket data
 * @param channel - Channel number (1-4) from WebSocket connection
 * @param writer - Batch writer to accumulate decoded frames
 * @returns Number of frames decoded from this HDLC packet
 */
export function cansub_decode_into(buffer: Buffer, channel: number, writer: FrameBatchWriter): number {
    let decoded = 0;

    /* Find next frame delimiter */
    const raw = buffer.getView();
    const frameStart = raw.indexOf(HDLC_BOUNDARY_BYTE);
    if(frameStart < 0) {
        buffer.reset();
        return 0;
    }
    let frameEnd = -1;
    for (let i = frameStart + 1; i < raw.length; i++) {
        if (raw[i] === HDLC_BOUNDARY_BYTE) { frameEnd = i; break; }
    }
    if(frameEnd < 0) {
        buffer.trimStart(frameStart);
        return 0;
    }

    /* Generate subview of the data and de-stuff */
    let view = buffer.getView().subarray(frameStart + 1, frameEnd);

    let index_input = 0;
    let index_output = 0;

    while(index_input < view.length) {
        let current = view[index_input++];
        if (current === HDLC_ESCAPE_BYTE) {
            if(index_input < view.length) {
                current = view[index_input++] ^ 0x20;
            }
        }
        view[index_output++] = current;
    }

    _scratchBuf.loadFrom(view.subarray(0, index_output));
    let b = _scratchBuf;

    /* Trim input */
    buffer.trimStart(frameEnd);

    /* Extract and check CRC */
    const expectedCRC = b.readU32(-4, true)! >>> 0;
    const calculatedCRC = crc32(b.getView().subarray(0, b.getLength() - 4), 0) >>> 0;

    if(calculatedCRC !== expectedCRC) {
        console.warn(
            `[CANSubProtocol] CRC mismatch: expected 0x${expectedCRC.toString(16).padStart(8, "0")}, got 0x${calculatedCRC.toString(16).padStart(8, "0")} (${b.getLength()} bytes)`
        );
        return 0;
    }

    /* Decode all messages and write directly into the batch writer */
    const busIndex = channel - 1; // channel 1-4 → index 0-3
    while (b.getLength() > 0) {
        if (!message_decode_into(b, busIndex, writer)) break;
        decoded++;
    }

    return decoded;
}

/**
 * Decode a single CAN message and write it into a FrameBatchWriter.
 * @returns true if a frame was decoded, false if insufficient data.
 */
function message_decode_into(buffer: Buffer, busIndex: number, writer: FrameBatchWriter): boolean {
    if(buffer.getLength() < MSG_ENCODE_HEADER_MIN_SIZE) {
        return false;
    }

    /* Read timestamp (48-bit µs offset from MSG_ENCODE_TIME_MIN) */
    const timestamp_us = buffer.readU48(0, true)!;
    const epoch = (timestamp_us / 1_000_000.0) + MSG_ENCODE_TIME_MIN;

    /* Read flags byte at offset 6 */
    const flags = buffer.readU8(6)!;

    /* Check if this is an error frame */
    if ((flags & 0xE0) === 0x20) {
        const errorType = flags & 0x1F;
        const mappedType = errorType <= 4 ? errorType : 0xFF;
        buffer.trimStart(7);
        writer.writeFrame(epoch, mappedType, busIndex, 0, 0, _emptyData, 0, false, false, false, false, false, true, false);
        return true;
    }

    /* Parse flags */
    const is_fd = (flags & 0x80) === 0x80;
    const is_rtr = is_fd ? false : (flags & 0x40) === 0x40;
    const is_brs = is_fd ? (flags & 0x40) === 0x40 : false;
    const is_esi = is_fd ? (flags & 0x20) === 0x20 : false;
    const is_tx = (flags & 0x10) === 0x10;
    const dlc = flags & 0x0F;

    /* Check if extended ID */
    const is_extended = (buffer.readU8(7)! & 0x80) === 0x80;

    let arbitration_id: number;
    let bytes_read: number;

    if (!is_extended) {
        if(buffer.getLength() < 9) return false;
        arbitration_id = buffer.readU16(7, true)! & 0x7FF;
        bytes_read = 9;
    } else {
        if(buffer.getLength() < 11) return false;
        arbitration_id = buffer.readU32(7, true)! & 0x1FFFFFFF;
        bytes_read = 11;
    }

    /* Declared length always derives from the wire DLC (1:1 for non-FD,
       FD lookup for FD). For RTR no payload bytes are copied, but `len` still
       reflects the requested length so downstream consumers can display it. */
    const len = dlc2len(dlc);

    /* Read data bytes */
    let dataLen: number;
    let dataSource: Uint8Array;
    let dataOffset: number;
    if (!is_rtr) {
        dataLen = len;
        const bufView = buffer.getView();
        if (bytes_read + dataLen > bufView.length) return false;
        dataSource = bufView;
        dataOffset = bytes_read;
        bytes_read += dataLen;
    } else {
        dataLen = 0;
        dataSource = _emptyData;
        dataOffset = 0;
    }

    writer.writeFrame(
        epoch, arbitration_id, busIndex, len, dataLen,
        dataSource, dataOffset,
        is_fd, is_brs, is_esi, is_rtr, is_tx, false, is_extended,
    );

    buffer.trimStart(bytes_read);
    return true;
}

const _emptyData = new Uint8Array(0);

/**
 * Convert DLC code to data length in bytes (CAN-FD aware)
 * DLC 0-8: 0-8 bytes (classic CAN)
 * DLC 9-15: 12, 16, 20, 24, 32, 48, 64 bytes (CAN-FD)
 */
const DLC_TO_LEN: readonly number[] = [
    0, 1, 2, 3, 4, 5, 6, 7, 8,
    12, 16, 20, 24, 32, 48, 64
];

export function dlc2len(dlc: number): number {
    if((dlc < 0) || (dlc >= DLC_TO_LEN.length)) {
        throw new RangeError(`Invalid DLC: ${dlc}`);
    }
    return DLC_TO_LEN[dlc];
}

/**
 * Convert a data length in bytes to its CAN DLC code (inverse of dlc2len).
 * Classic lengths 0-8 map 1:1; CAN-FD lengths (12,16,20,24,32,48,64) map to
 * DLC 9-15. Throws for any length that is not a valid CAN / CAN-FD payload size.
 */
export function len2dlc(length: number): number {
    const dlc = DLC_TO_LEN.indexOf(length);
    if (dlc < 0) {
        throw new RangeError(`Invalid CAN data length: ${length}`);
    }
    return dlc;
}

// ============================================================================
// Encode path (client -> device: serialize a CAN frame to HDLC wire bytes)
// ============================================================================

/**
 * Descriptor for a CAN frame to transmit over the WebSocket (client -> device).
 *
 * The encoder always emits the frame with the TX bit clear and a zero timestamp:
 * the device echoes the accepted frame back with the TX bit set as a transmission
 * acknowledgement, and timestamps it on transmit. ESI is never set on transmit.
 * `data` carries the payload bytes; for a remote frame (`is_rtr`) the *length* of
 * `data` sets the DLC while the bytes themselves are omitted from the wire (matching
 * the device's "dummy bytes set RTR frame length" semantics).
 */
export interface TxFrame {
    arbitration_id: number;
    is_extended: boolean;
    is_fd: boolean;
    /** Bit-rate switch (CAN-FD only; ignored for classic frames). */
    is_brs: boolean;
    /** Remote frame (classic CAN only; must be false for FD). */
    is_rtr: boolean;
    data: Uint8Array;
}

/**
 * Serialize one CAN frame and append its bytes to `payload` (inverse of
 * message_decode_into). Timestamp is always 0 and the TX/ESI bits are always
 * clear for transmitted frames.
 */
function message_encode_into(payload: number[], f: TxFrame): void {
    /* Timestamp (48-bit µs) - 0 for TX; the device timestamps on transmit. */
    for (let i = 0; i < 6; i++) payload.push(0);

    /* A remote frame only exists on classic CAN; RTR is ignored for CAN-FD.
       This single condition governs both the flags bit and payload omission. */
    const isRemote = f.is_rtr && !f.is_fd;

    /* DLC derives from the payload length. For a remote frame this is the requested
       length (the bytes themselves are omitted below); throws for invalid FD lengths. */
    const dlc = len2dlc(f.data.length);

    /* Flags byte: [7:FDF 6:RTR|BRS 5:ESI 4:TX 3..0:DLC]. TX and ESI stay clear. */
    let flags = dlc & 0x0F;
    if (f.is_fd) {
        flags |= 0x80;
        if (f.is_brs) flags |= 0x40;
    } else if (isRemote) {
        flags |= 0x40;
    }
    payload.push(flags);

    /* ID: 2 bytes (std) or 4 bytes (ext, MSB set), big-endian. */
    if (!f.is_extended) {
        const id = f.arbitration_id & 0x7FF;
        payload.push((id >>> 8) & 0xFF, id & 0xFF);
    } else {
        const id = ((f.arbitration_id & 0x1FFFFFFF) | 0x80000000) >>> 0;
        payload.push((id >>> 24) & 0xFF, (id >>> 16) & 0xFF, (id >>> 8) & 0xFF, id & 0xFF);
    }

    /* Payload data (omitted for remote frames; the DLC above still carries the length). */
    if (!isRemote) {
        for (let i = 0; i < f.data.length; i++) payload.push(f.data[i]);
    }
}

/**
 * Serialize one CAN frame to its raw message body bytes (timestamp + flags + id +
 * data), WITHOUT the CRC32 or HDLC framing. This is the per-frame unit that gets
 * concatenated (with a single shared CRC) when packing many frames into one HDLC
 * frame - see `encodeHdlcFrame` / `cansub_encode_frames`.
 *
 * Used by the playback scheduler, which pre-encodes every frame's body once at
 * load time and only does CRC + byte-stuffing per batch in the hot send loop.
 */
export function encodeTxFrameBody(f: TxFrame): Uint8Array {
    const payload: number[] = [];
    message_encode_into(payload, f);
    return new Uint8Array(payload);
}

/**
 * Wrap one or more concatenated message bodies (`encodeTxFrameBody` output) into a
 * complete HDLC frame ready to write to the WebSocket:
 * `0x7E | byte-stuffed(body + CRC32) | 0x7E`.
 *
 * A single CRC32 (big-endian) is computed over the whole `body` - so a batch of
 * many messages shares one CRC, exactly matching what the device accepts (mirrors
 * python-can-cansub's `cansub_protocol_encode` running-buffer behavior).
 *
 * Builds into a fresh array (never the decoder's shared scratch buffer), so it is
 * safe to call while the decode path is running.
 */
export function encodeHdlcFrame(body: Uint8Array): Uint8Array {
    /* CRC32 (big-endian) over the raw (un-stuffed) body. */
    const crc = crc32(body, 0) >>> 0;

    /* Byte-stuff (body + CRC) into a worst-case pre-sized buffer (every byte escaped,
       plus 2 boundary bytes), then trim. Runs once per batch flush in the playback hot
       send loop, so avoid growing a boxed number[] here. */
    const out = new Uint8Array(2 * (body.length + 4) + 2);
    let n = 0;
    out[n++] = HDLC_BOUNDARY_BYTE;
    const stuff = (byte: number): void => {
        if (byte === HDLC_BOUNDARY_BYTE || byte === HDLC_ESCAPE_BYTE) {
            out[n++] = HDLC_ESCAPE_BYTE;
            out[n++] = byte ^ 0x20;
        } else {
            out[n++] = byte;
        }
    };
    for (let i = 0; i < body.length; i++) stuff(body[i]);
    stuff((crc >>> 24) & 0xFF);
    stuff((crc >>> 16) & 0xFF);
    stuff((crc >>> 8) & 0xFF);
    stuff(crc & 0xFF);
    out[n++] = HDLC_BOUNDARY_BYTE;

    return n === out.length ? out : out.slice(0, n);
}

/**
 * Encode a single CAN frame into a complete HDLC frame ready to write to the
 * WebSocket: `0x7E | byte-stuffed(payload + CRC32) | 0x7E`.
 */
export function cansub_encode_frame(f: TxFrame): Uint8Array {
    return encodeHdlcFrame(encodeTxFrameBody(f));
}

/**
 * Encode multiple CAN frames into ONE HDLC frame with a single shared CRC32
 * (the high-throughput batch form used for playback / bulk WS TX). All message
 * bodies are concatenated and framed together, which is the format the device
 * already accepts from python-can-cansub. Returns an empty array for no frames.
 */
export function cansub_encode_frames(frames: TxFrame[]): Uint8Array {
    if (frames.length === 0) return new Uint8Array(0);
    const payload: number[] = [];
    for (const f of frames) message_encode_into(payload, f);
    return encodeHdlcFrame(new Uint8Array(payload));
}

