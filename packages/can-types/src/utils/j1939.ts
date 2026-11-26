/**
 * J1939 field extraction utilities.
 *
 * 29-bit extended CAN ID layout:
 *   Bits 28-26: Priority (3 bits)
 *   Bit  25:    Reserved
 *   Bit  24:    Data Page
 *   Bits 23-16: PDU Format / PF (8 bits)
 *   Bits 15-8:  PDU Specific / PS (8 bits)
 *   Bits 7-0:   Source Address / SA (8 bits)
 *
 * PGN composition depends on PF:
 *   PDU2 (PF >= 0xF0): PGN = R + DP + PF + PS  (PS = Group Extension)
 *   PDU1 (PF <  0xF0): PGN = R + DP + PF        (PS = Destination Address, excluded)
 */

/**
 * Extract J1939 PGN from a 29-bit extended CAN arbitration ID.
 * Returns the PGN right-shifted to its natural position (max 0x03FFFF).
 */
export function extractPgn(canId: number): number {
  const pf = (canId >> 16) & 0xFF;
  if (pf >= 0xF0) {
    return (canId & 0x03FFFF00) >>> 8;  // PDU2: PS is Group Extension, included
  }
  return (canId & 0x03FF0000) >>> 8;    // PDU1: PS is Destination Address, excluded
}

/**
 * Extract J1939 Source Address from a CAN arbitration ID (bits 7-0).
 */
export function extractSA(canId: number): number {
  return canId & 0xFF;
}

/**
 * Format a PGN value as "0x" + 6 uppercase hex digits.
 * @example formatPgn(0x00FEF1) => "0x00FEF1"
 */
export function formatPgn(pgn: number): string {
  return '0x' + pgn.toString(16).toUpperCase().padStart(6, '0');
}

/**
 * Format a Source Address as "0x" + 2 uppercase hex digits.
 * @example formatSA(0x42) => "0x42"
 */
export function formatSA(sa: number): string {
  return '0x' + sa.toString(16).toUpperCase().padStart(2, '0');
}

/**
 * PGN-anchor mask for a 29-bit ID, branching on PF. Mirrors the C
 * `ID_TO_PGN(id)` macro (cDB_can_pgn.c:23):
 *   PF < 0xF0 (PDU1) → 0x3FF0000   (R + DP + PF; PS is destination address)
 *   PF ≥ 0xF0 (PDU2) → 0x3FFFF00   (R + DP + PF + PS; PS is group extension)
 */
export function pgnMaskFor(id29: number): number {
  const pf = (id29 >> 16) & 0xFF;
  return pf < 0xF0 ? 0x03FF0000 : 0x03FFFF00;
}
