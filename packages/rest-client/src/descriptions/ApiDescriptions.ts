/**
 * Auto-generated from openapi.json - do not edit manually.
 * Run:  npm run generate:descriptions
 */

export const API_VERSION = '05.00';

export const API_DESCRIPTIONS: Record<string, string> = {
  "filter.label": "Optional user-defined label.",
  "filter.is_extended": "True for an extended (29-bit) ID, false for a standard (11-bit) ID.",
  "filter.is_range": "True if the filter is a range filter, false if it is a mask filter.",
  "filter.f1": "When is_range=false: filter ID. When is_range=true: range start.",
  "filter.f2": "When is_range=false: filter mask. When is_range=true: range end.",
  "frame.label": "Optional user-defined label.",
  "frame.is_extended": "True for an extended (29-bit) ID, false for a standard (11-bit) ID.",
  "frame.is_fd": "True for a CAN FD frame, false for a classic CAN frame.",
  "frame.is_rtr_brs": "RTR for classic CAN, BRS (Bit Rate Switch) for CAN-FD.",
  "frame.id": "Frame identifier.",
  "frame.data": "Hexadecimal encoded data payload. Empty string for no data bytes. For RTR frames, dummy bytes set the frame length.",
  "phy.listen_only": "Enables listen-only mode.",
  "phy.auto_reset": "Enables automatic bus-off recovery.",
  "phy.error_frames": "Enables monitoring of error frames (bus error, stuffing error, etc.).",
  "phy.tx_ack_frames": "Enables transmission acknowledgements. When enabled, an acknowledgement is sent to the client via the WebSocket for each successfully transmitted frame. Disabling reduces network data usage.",
  "phy.timing": "Nominal bit timing.",
  "phy.timing_data": "Data phase bit timing (for CAN-FD).",
  "transmit_sequence.label": "Optional user-defined label.",
  "transmit_sequence.limit": "Maximum number of times to transmit the sequence.",
  "transmit_sequence.period_ms": "Period of the full sequence in milliseconds.",
  "transmit_sequence.spacing_ms": "Spacing between individual frames in the sequence in milliseconds.",
};
