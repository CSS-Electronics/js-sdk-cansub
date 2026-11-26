# @csselectronics/rest-client

REST API client for configuring CSS Electronics CANsub CAN/CAN FD interfaces: Type-safe access to every REST endpoint (device info, PHY and bit-timing, filters, transmit sequences, time) with a built-in serial request queue. Generated from the CANsub OpenAPI specification. No runtime dependencies: It uses the native `fetch` API.

Part of the [CANsub JS SDK](https://github.com/CSS-Electronics/js-sdk-cansub), which has a starter app and runnable examples (see `device-config`). The source is in [`packages/rest-client`](https://github.com/CSS-Electronics/js-sdk-cansub/tree/main/packages/rest-client).

```
npm install @csselectronics/rest-client
```

## What's included

| Module | Description |
|--------|-------------|
| `createApiClient` | Returns a `DefaultApi` with the serial request queue built in. Start here |
| `generated/` | The OpenAPI client: `DefaultApi` (all REST endpoints), model types (`Phy`, `Filter`, `Frame`, `TransmitSequence`, `Status`, ...), `ResponseError` |
| `queuedFetch` | FIFO `fetch` wrapper that serializes all HTTP requests (used by `createApiClient`) |
| `utils/BitrateConfigurations` | CAN FD bit-timing lookup table (50k-1M nominal incl. 83.333k/95.238k/666.667k, 1M-5M data, 50-90% sample point), from the CANsub Docs bit-timing table |
| `utils/PhySelection` | `resolvePhySelection`: Snaps a bit rate / data bit rate / sample point choice to the closest preset and lists the options for each dropdown |
| `config/DeviceConfig` | Save and load the device configuration (PHY, filters, transmit) as JSON |
| `descriptions/` | API field descriptions from the specification, e.g. for UI tooltips, and `API_VERSION` |

## Setting the bit rate

The bit-rate helpers are also exported from the package root:

```typescript
import { createApiClient, resolvePhySelection, getTiming } from '@csselectronics/rest-client';

const api = createApiClient('https://2c08fbb4-usb.local');
const sel = resolvePhySelection({ nominalBitrate: 500_000, dataBitrate: 2_000_000, samplePoint: 80 });
const { timing, timingData } = getTiming(sel.nominalBitrate, sel.dataBitrate, sel.samplePoint)!;
await api.apiCanChannelPhyPut({
  channel: 1,
  phy: { listenOnly: false, autoReset: true, errorFrames: false, txAckFrames: true, timing, timingData },
});
```

The device accepts PHY changes only while the channel's WebSocket is closed.

## Why a request queue

The CANsub has a limited number of connection slots and TLS handshakes are expensive. `createApiClient()` therefore serializes all requests through a queued `fetch`, so you can call API methods directly without managing concurrency.

## Licence

For use with CSS Electronics hardware only. See `LICENSE`.
