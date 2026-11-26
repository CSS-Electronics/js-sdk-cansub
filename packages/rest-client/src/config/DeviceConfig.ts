/**
 * DeviceConfig - Save and load CANsub device configurations
 *
 * Reads/writes PHY, Filter, and Transmit settings per channel via the REST API.
 * Configuration files use snake_case JSON.
 */

import type { DefaultApi } from '../generated';
import {
  PhyToJSON, PhyFromJSON,
  FilterToJSON, FilterFromJSON,
  TransmitSequenceToJSON, TransmitSequenceFromJSON,
  ResponseError,
} from '../generated';

/**
 * OpenAPI spec version this module was last reviewed against.
 * A test asserts this matches openapi.json; update when the spec changes.
 */
export const CONFIG_SPEC_VERSION = '05.00';

/** Configuration file structure (snake_case JSON) */
export interface LoadSaveConfig {
  api_version: string;
  can: {
    [channel: string]: {
      phy?: any;
      filter?: any[];
      transmit?: any[];
    };
  };
}

/**
 * Read the current device configuration for all specified channels.
 *
 * @param api - API client instance
 * @param channels - Channel numbers to read (e.g. [1, 2, 3, 4])
 * @returns Configuration object ready for JSON serialization
 */
export async function saveDeviceConfig(api: DefaultApi, channels: number[]): Promise<LoadSaveConfig> {
  const apiVersion = await api.apiVersionGet();
  const config: LoadSaveConfig = { api_version: apiVersion, can: {} };

  for (const channel of channels) {
    config.can[channel] = {};

    // Get PHY
    try {
      const phy = await api.apiCanChannelPhyGet({ channel });
      config.can[channel].phy = PhyToJSON(phy);
    } catch (error) {
      console.error(`Failed to get PHY for channel ${channel}:`, error);
    }

    // Get Filters
    try {
      const filterIDs = await api.apiCanChannelFilterGet({ channel });
      config.can[channel].filter = [];
      for (const filterID of filterIDs) {
        const filter = await api.apiCanChannelFilterFilterIdGet({ channel, filterId: filterID });
        config.can[channel].filter!.push(FilterToJSON(filter));
      }
    } catch (error) {
      console.error(`Failed to get filters for channel ${channel}:`, error);
    }

    // Get Transmit sequences
    try {
      const transmitIDs = await api.apiCanChannelTransmitGet({ channel });
      config.can[channel].transmit = [];
      for (const transmitID of transmitIDs) {
        const seq = await api.apiCanChannelTransmitTransmitIdGet({ channel, transmitId: transmitID });
        config.can[channel].transmit!.push(TransmitSequenceToJSON(seq));
      }
    } catch (error) {
      console.error(`Failed to get transmit for channel ${channel}:`, error);
    }
  }

  return config;
}

/**
 * Apply a configuration to the device.
 *
 * Validates the API version, then applies PHY, Filter, and Transmit settings
 * per channel using a clear-before-apply pattern. Transmit sequences are
 * created with count=limit to prevent immediate auto-start.
 *
 * @param api - API client instance
 * @param config - Configuration to apply
 * @returns Array of error messages (empty if fully successful)
 * @throws Error if API version does not match
 */
export async function applyDeviceConfig(api: DefaultApi, config: LoadSaveConfig): Promise<string[]> {
  const errors: string[] = [];

  // Validate API version against device
  const deviceApiVersion = await api.apiVersionGet();
  if (config.api_version !== deviceApiVersion) {
    throw new Error(`API version mismatch: config file is ${config.api_version}, device is ${deviceApiVersion}`);
  }

  for (const [channelStr, channelConfig] of Object.entries(config.can)) {
    const channel = Number(channelStr);

    // Apply PHY
    if (channelConfig.phy) {
      try {
        const phy = PhyFromJSON(channelConfig.phy);
        await api.apiCanChannelPhyPut({ channel, phy });
      } catch (error) {
        console.error(`Failed to set PHY for channel ${channel}:`, error);
        errors.push(await formatError(error));
      }
    }

    // Apply Filters (clear-before-apply pattern)
    if ('filter' in channelConfig) {
      try {
        const existingIDs = await api.apiCanChannelFilterGet({ channel });
        for (const filterID of existingIDs) {
          await api.apiCanChannelFilterFilterIdDelete({ channel, filterId: filterID });
        }
      } catch (error) {
        console.error(`Failed to delete filters for channel ${channel}:`, error);
        errors.push(await formatError(error));
      }

      if (channelConfig.filter && Array.isArray(channelConfig.filter)) {
        for (const filterData of channelConfig.filter) {
          try {
            const filter = FilterFromJSON(filterData);
            await api.apiCanChannelFilterPost({ channel, filter });
          } catch (error) {
            console.error(`Failed to create filter for channel ${channel}:`, error);
            errors.push(await formatError(error));
          }
        }
      }
    }

    // Apply Transmit sequences (clear-before-apply pattern)
    if ('transmit' in channelConfig) {
      try {
        const existingIDs = await api.apiCanChannelTransmitGet({ channel });
        for (const transmitID of existingIDs) {
          await api.apiCanChannelTransmitTransmitIdDelete({ channel, transmitId: transmitID });
        }
      } catch (error) {
        console.error(`Failed to delete transmit for channel ${channel}:`, error);
        errors.push(await formatError(error));
      }

      if (channelConfig.transmit && Array.isArray(channelConfig.transmit)) {
        for (const transmitData of channelConfig.transmit) {
          try {
            const seq = TransmitSequenceFromJSON(transmitData);
            await api.apiCanChannelTransmitPost({ channel, transmitSequence: seq });
            // Set count=limit to prevent immediate auto-start
            const transmitIds = await api.apiCanChannelTransmitGet({ channel });
            if (transmitIds.length > 0) {
              const newId = transmitIds[transmitIds.length - 1];
              await api.apiCanChannelTransmitTransmitIdCountPut({ channel, transmitId: newId, body: seq.limit });
            }
          } catch (error) {
            console.error(`Failed to create transmit for channel ${channel}:`, error);
            errors.push(await formatError(error));
          }
        }
      }
    }
  }

  return errors;
}

/**
 * Format an error for display. For ResponseError, extracts the request URL path, HTTP status,
 * and the device's response body (the same content visible in the browser Network tab).
 */
async function formatError(error: unknown): Promise<string> {
  if (error instanceof ResponseError) {
    let path = '';
    try { path = new URL(error.response.url).pathname; } catch { /* ignore */ }
    let body = '';
    try { body = (await error.response.clone().text()).trim(); } catch { /* ignore */ }
    return `path: ${path}\nstatus code: HTTP ${error.response.status}${body ? `\n${body}` : ''}`;
  }
  return error instanceof Error ? error.message : String(error);
}
