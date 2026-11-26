/**
 * CAN bus names (CAN1 through CAN4)
 */
export type CanBusName = 'CAN1' | 'CAN2' | 'CAN3' | 'CAN4';

/**
 * CAN bus connection state
 */
type CanBusConnectionState =
  | 'disconnected'  // Not connected
  | 'connecting'    // Connection in progress
  | 'connected'     // Active and receiving frames
  | 'bus-off'       // Connected but bus in error state (too many errors)
  | 'hidden';       // Hidden from UI (not shown in tabs)
