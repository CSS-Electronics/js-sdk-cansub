/**
 * CAN ID Parser - Handles Vector-style flag encoding
 *
 * Vector CANdb++ and many DBC tools encode metadata in upper bits:
 * - Bit 31 (0x80000000): Extended frame flag (1 = 29-bit ID, 0 = 11-bit ID)
 * - Bit 30 (0x40000000): Direction or metadata
 * - Bit 29 (0x20000000): Reserved or metadata
 * - Bits 0-28 (0x1FFFFFFF): Clean 29-bit CAN ID
 *
 * Example:
 * - Raw ID: 0xC0000000 (3,221,225,472)
 * - Bit 31 = 1 → Extended frame
 * - Bit 30 = 1 → Has metadata
 * - Clean ID = 0x00000000 (0)
 */

interface ParsedCanId {
  /** Clean CAN ID without flag bits (0-0x1FFFFFFF) */
  canId: number;

  /** True if extended frame flag is set (29-bit addressing) */
  isExtended: boolean;

  /** True if other metadata flags are set (bit 30, 29) */
  hasMetadata: boolean;

  /** Original raw ID with flag bits */
  rawId: number;
}

/**
 * Parse a CAN ID that may include Vector-style flag bits
 *
 * @param rawId - Raw CAN ID from DBC/JSON file (may include flags)
 * @returns Parsed CAN ID with extracted flags
 *
 * @example
 * // J1939 message with extended flag
 * const parsed = parseCanId(0xC0000000);
 * // { canId: 0, isExtended: true, hasMetadata: true, rawId: 0xC0000000 }
 *
 * @example
 * // Standard CAN message
 * const parsed = parseCanId(0x123);
 * // { canId: 0x123, isExtended: false, hasMetadata: false, rawId: 0x123 }
 */
export function parseCanId(rawId: number): ParsedCanId {
  const EXTENDED_FLAG = 0x80000000;
  const METADATA_MASK = 0x60000000; // bits 30-29
  const ID_MASK = 0x1FFFFFFF;       // 29-bit CAN ID mask

  const isExtended = (rawId & EXTENDED_FLAG) !== 0;
  const hasMetadata = (rawId & METADATA_MASK) !== 0;
  const canId = rawId & ID_MASK;

  return { canId, isExtended, hasMetadata, rawId };
}

/**
 * Validate a parsed CAN ID
 *
 * @param parsed - Parsed CAN ID result
 * @throws Error if CAN ID is invalid
 *
 * @example
 * const parsed = parseCanId(0x800);
 * validateCanId(parsed); // Throws: ID 0x800 exceeds max for standard frame
 */
export function validateCanId(parsed: ParsedCanId): void {
  // Standard CAN: 11-bit IDs (0-0x7FF = 0-2047)
  // Extended CAN: 29-bit IDs (0-0x1FFFFFFF = 0-536870911)
  const maxId = parsed.isExtended ? 0x1FFFFFFF : 0x7FF;

  if (parsed.canId < 0 || parsed.canId > maxId) {
    const frameType = parsed.isExtended ? 'extended (29-bit)' : 'standard (11-bit)';
    throw new Error(
      `Invalid ${frameType} CAN ID 0x${parsed.canId.toString(16)}: must be 0-0x${maxId.toString(16)}`
    );
  }
}
