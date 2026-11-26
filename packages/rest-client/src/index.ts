/**
 * @csselectronics/rest-client - REST API client for CANsub devices.
 *
 * Auto-generated OpenAPI client with serial request queue.
 * Requests are serialized to respect embedded hardware socket limits.
 */

export { createApiClient } from './createApiClient';
export { saveDeviceConfig, applyDeviceConfig, CONFIG_SPEC_VERSION, type LoadSaveConfig } from './config/DeviceConfig';
export * from './generated';
export { API_VERSION } from './descriptions/ApiDescriptions';
export {
  getNominalBitrates,
  getDataBitrates,
  getSamplePoints,
  getTiming,
  findConfigByTiming,
  findClosest,
  formatBitrate,
  formatSamplePoint,
  timingEquivalenceClass,
  type TimingResult,
  type ConfigLookupResult,
} from './utils/BitrateConfigurations';
export { resolvePhySelection, type PhySelection, type ResolvedPhySelection } from './utils/PhySelection';
