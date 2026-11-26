/**
 * DataFormatter.ts - Utilities for formatting CAN data for display
 */

/**
 * Format a CAN ID as hex string with appropriate padding
 * Standard IDs (11-bit): 3 hex digits, e.g. "0x123"
 * Extended IDs (29-bit): 8 hex digits, e.g. "0x12345678"
 */
export function formatCanId(id: number, isExtended: boolean): string {
  return '0x' + id.toString(16).toUpperCase().padStart(isExtended ? 8 : 3, '0');
}

/**
 * Format CAN frame flags as a space-separated string
 * @returns e.g. "FD BRS ESI", "RTR", "FD BRS", or "" for standard frames
 */
export function formatFlags(fd: boolean, brs: boolean, esi: boolean, rtr: boolean): string {
  const flags: string[] = [];
  if (fd) flags.push('FD');
  if (brs) flags.push('BRS');
  if (esi) flags.push('ESI');
  if (rtr) flags.push('RTR');
  return flags.join(' ');
}

/**
 * Format CAN data bytes as hex string with space separation
 * Example: [0xBA, 0x41, 0x13] → "BA 41 13"
 *
 * @param data - Uint8Array of raw CAN data bytes
 * @returns Formatted hex string with spaces between bytes
 */
export function formatDataBytes(data: Uint8Array): string {
  return Array.from(data)
    .map(b => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}


/**
 * Format CAN data bytes as an array of hex-string lines.
 * Only splits if data > 8 bytes; otherwise returns a single line.
 *
 * @param bytesPerLine - Bytes per wrapped line (default 16, matching FD_BYTES_PER_LINE)
 * @param maxBytes - Optional cap; payloads longer than this render the first
 *   `maxBytes` bytes and append ` …` to the last line. Used for TP-assembled
 *   synthetic frames that can carry hundreds of bytes.
 */
export function formatDataLines(data: Uint8Array, bytesPerLine = 16, maxBytes?: number): string[] {
  if (data.length <= 8) {
    return [formatDataBytes(data)];
  }
  const cap = maxBytes !== undefined && data.length > maxBytes ? maxBytes : data.length;
  const lines: string[] = [];
  for (let i = 0; i < cap; i += bytesPerLine) {
    lines.push(formatDataBytes(data.subarray(i, Math.min(i + bytesPerLine, cap))));
  }
  if (cap < data.length) lines[lines.length - 1] += ' …';
  return lines;
}
