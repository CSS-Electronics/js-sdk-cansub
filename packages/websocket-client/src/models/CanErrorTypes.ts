/**
 * CAN error frame sub-type definitions.
 *
 * Error types are extracted from the lower 5 bits of the flags byte
 * in the CANSub binary protocol (matching the device firmware and
 * the Python reference in cansub_protocol.py).
 */

const CAN_ERROR_TYPES: ReadonlyMap<number, string> = new Map([
  [0, 'BIT'],
  [1, 'ACK'],
  [2, 'FORM'],
  [3, 'STUFF'],
  [4, 'CRC'],
  [0xFF, 'OTHER'],
]);

export function getErrorTypeName(errorType: number): string {
  return CAN_ERROR_TYPES.get(errorType) ?? 'OTHER';
}
