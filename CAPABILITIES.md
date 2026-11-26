# What the SDK already does

Look here before writing code: Most CANsub app plumbing exists already. Each row names the function or class to use and where to import it from. `shared/ui` is the UI kit in this repo (`import { ... } from '../../shared/ui'`); the others are npm packages. `X.y` means member `y` of class `X` (e.g. `CansubSession.onFrames` is `session.onFrames(...)`). Details are in the doc comments of the type definitions and in each package's `README.md`.

## Device and channels

| I want to… | Use | From |
|---|---|---|
| Connect to a CANsub, open channels, decode and store frames (all in one) | `CansubSession` | `shared/ui` |
| Show the standard sidebar: device URL, channel tabs with bit rate, DBC files | `mountSidebar` | `shared/ui` |
| Use one sidebar section in my own layout | `mountDevicePanel`, `mountChannelPanel`, `mountDbcPanel` | `shared/ui` |
| React when a channel connects or disconnects | `CansubSession.onConnectionChange` | `shared/ui` |
| Read the bit rate a channel is set to | `CansubSession.getBitrate` | `shared/ui` |
| Read a channel's status on the device: Frame count, frames/s, bus load, error counters (poll e.g. every second, see `message-summary`) | `DefaultApi.apiCanChannelGet` | `@csselectronics/rest-client` |
| Call the REST API directly (requests are queued for the device) | `createApiClient` | `@csselectronics/rest-client` |
| Get the open device's ID, firmware and API version and channels | `CansubSession.device` | `shared/ui` |
| Read device info, API version and the channel list without a session | `DefaultApi.apiInfoGet`, `DefaultApi.apiVersionGet`, `DefaultApi.apiCanGet` | `@csselectronics/rest-client` |
| Offer bit-rate dropdowns and snap invalid combinations to the closest preset | `resolvePhySelection` | `@csselectronics/rest-client` |
| Turn a bit rate into PHY timing, or read back the device's bit rate | `getTiming`, `findConfigByTiming` | `@csselectronics/rest-client` |
| Set bit rate, listen-only, auto-reset, error frames (channel must be disconnected) | `DefaultApi.apiCanChannelPhyPut` | `@csselectronics/rest-client` |
| Set hardware filters on the device | `DefaultApi.apiCanChannelFilterPost`, `DefaultApi.apiCanChannelFilterGet` | `@csselectronics/rest-client` |
| Let the device transmit frames periodically (device-timed) | `DefaultApi.apiCanChannelTransmitPost`, `DefaultApi.apiCanChannelTransmitTransmitIdCountPut` | `@csselectronics/rest-client` |
| Detect the bit rate of an unknown bus (copy `detectBitrate()` from `examples/bitrate-autodetect/`) | `getTiming`, `DefaultApi.apiCanChannelPhyPut`, `ConnectionService.connectBus`, `WorkerBridge.onBatch` | `@csselectronics/rest-client`, `@csselectronics/websocket-client` |
| Save or restore the whole device configuration as JSON | `saveDeviceConfig`, `applyDeviceConfig` | `@csselectronics/rest-client` |
| Read or set the device time, check PTP | `DefaultApi.apiTimeGet`, `DefaultApi.apiTimePut`, `DefaultApi.apiTimePtpGet` | `@csselectronics/rest-client` |
| Show a readable message for a failed REST call | `formatApiError` | `@csselectronics/can-types` |

## Receive frames

| I want to… | Use | From |
|---|---|---|
| Get every batch of frames, already decoded and stored | `CansubSession.onFrames` | `shared/ui` |
| Update the page once per batch (~10 Hz, like webCAN) | `CansubSession.onUpdate` | `shared/ui` |
| Stream frames without the UI kit (minimal integration) | `WorkerBridge`, `ConnectionService` | `@csselectronics/websocket-client` |
| Read a frame's ID, data, flags and timestamp | `CanFrame` | `@csselectronics/websocket-client` |

## Transmit

| I want to… | Use | From |
|---|---|---|
| Send one frame on a connected channel | `ConnectionService.send` | `@csselectronics/websocket-client` |
| Play a timed list of frames from the browser (start, pause, seek) | `WsTransmitService` | `@csselectronics/websocket-client` |
| Build the data bytes of a frame from physical signal values (DBC) | `encodeSignalInto`, `physicalToRaw` | `@csselectronics/can-decode` |

## DBC decoding and signals

| I want to… | Use | From |
|---|---|---|
| Let users load DBC files and choose the channels each one decodes | `mountDbcPanel` | `shared/ui` |
| Set the DBC files of a channel from code | `CansubSession.setChannelDbcs`, `DbcManagerService.loadLocal` | `shared/ui`, `@csselectronics/can-decode` |
| Parse a DBC and look up its messages and signals | `DbcDefinition.fromFile`, `DbcDefinition.getMessageInfo`, `DbcDefinition.listMessages`, `DbcDefinition.getSignalInfo` | `@csselectronics/can-decode` |
| Find the keys of a signal by name (e.g. `EngineSpeed`; can be several: channels, messages, J1939 senders) | `CansubSession.findSignalKeys` | `shared/ui` |
| List the decoded signals seen so far, with metadata | `CansubSession.getSignals`, `CansubSession.describeSignal` | `shared/ui` |
| Read a decoded value from a frame | `CanFrame.getSignalValue`, `CanFrame.getSignalKeys`, `CanFrame.getSignalValueByIndex` | `@csselectronics/websocket-client` |
| Show a value with its unit, or its DBC value-table text | `signalUnitOrLabel` | `@csselectronics/can-types` |
| Let users pick signals from a searchable list (optionally filtered, e.g. to one message) | `mountSignalPicker` | `shared/ui` |
| Get the DBC message (name, signals) of a CAN ID on a channel (`session.dbcAssignment`) | `DbcAssignmentService.getResolvedDefinition`, `DbcDefinition.getMessageInfo` | `@csselectronics/can-decode` |

## History, filtering and statistics

| I want to… | Use | From |
|---|---|---|
| Get the stored frames of a channel in a time window (`session.storage`) | `FullFrameStorageService.getFramesInTimeWindowForBus` | `@csselectronics/can-pipeline` |
| Merge the per-channel windows into one list in time order, as webCAN's export does (see `csv-files`) | `kWayMergeAscending` | `@csselectronics/can-pipeline/utils/epochQuery` |
| Get signal values over a time window, downsampled for plotting | `querySignals` | `@csselectronics/can-decode/utils/signalQuery` |
| Let users filter by CAN ID, with a filtered frame view (`session.filteredStorage`) | `mountMessagePicker`, `FiltFrameStorageService.getFrameWindow` | `shared/ui`, `@csselectronics/can-pipeline` |
| Count frames and rates per CAN ID | `StatisticsService` | `@csselectronics/can-pipeline` |
| Sort message or signal keys the way webCAN does | `compareItemKeys` | `@csselectronics/can-pipeline` |

## CSV files

| I want to… | Use | From |
|---|---|---|
| Save frames as a CSV file in webCAN's raw format (also read by python-can-cansub) | `framesToCsv`, `downloadCsv` | `shared/ui` |
| Read such a CSV file (e.g. exported from webCAN) into frames | `csvToFrames` | `shared/ui` |

Columns, separated by `;`: `TimestampEpoch;BusChannel;ID;IDE;DLC;DataLength;Dir;EDL;BRS;ESI;RTR;DataBytes`. Epoch in seconds with 6 decimals, channel 1-4, ID and data in hex without spaces, flags as 0/1 (`Dir` 1 = transmitted). `examples/csv-files/` shows both directions.

## Charts

| I want to… | Use | From |
|---|---|---|
| Plot decoded signals live (webCAN's clock, queries and rendering) | `mountLiveChart` | `shared/ui` |
| Build my own chart on the same engine | `createPlotEngine` | `@csselectronics/can-plot/engine` |
| Chart options, query window and colours | `buildPlotOptions`, `computeChartQueryWindow`, `COLOR_CYCLE` | `@csselectronics/can-plot` |

## Protocols

| I want to… | Use | From |
|---|---|---|
| Get the J1939 PGN or source address of a 29-bit ID | `extractPgn`, `extractSA`, `formatPgn`, `formatSA` | `@csselectronics/can-types` |
| Reassemble ISO-TP, J1939 TP or NMEA 2000 Fast Packet messages | `TpService`, `TpAssignmentService` | `@csselectronics/can-tp` |
| Parse and validate a CAN ID typed by a user | `parseCanId`, `validateCanId` | `@csselectronics/can-types` |

## Formatting

| I want to… | Use | From |
|---|---|---|
| Format CAN IDs, data bytes and timestamps like webCAN | `formatCanId`, `formatDataBytes`, `formatEpochLong`, `formatEpochShort` | `@csselectronics/websocket-client` |
| Format bit rates and sample points | `formatBitrate`, `formatSamplePoint` | `@csselectronics/rest-client` |
