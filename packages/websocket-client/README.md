# @csselectronics/websocket-client

WebSocket client for CSS Electronics CANsub CAN/CAN FD interfaces: The minimum needed to stream a CANsub device's binary frame protocol and react to raw `CanFrame` objects. It is the foundation of the other SDK packages, but also useful on its own, e.g. for a custom data bridge, logger or dashboard.

Part of the [CANsub JS SDK](https://github.com/CSS-Electronics/js-sdk-cansub), which has a starter app and runnable examples. The source is in [`packages/websocket-client`](https://github.com/CSS-Electronics/js-sdk-cansub/tree/main/packages/websocket-client).

```
npm install @csselectronics/websocket-client
```

## What's included

| Module | Purpose |
|---|---|
| `protocol/` | HDLC framing, CRC32, `parseFrameBatch` binary parser |
| `models/CanFrame` | The frame data class (immutable, structural) |
| `models/CanErrorTypes` | Error-frame type registry |
| `workers/CommunicationWorker` | Web Worker that opens per-bus WebSockets and batches frames |
| `workers/WorkerBridge` | Main-thread bridge: `onBatch(cb)`, `onBatchDone(cb)`, `connect(bus)`, `disconnect(bus)` |
| `services/pipeline/ConnectionService` | Bus lifecycle: `connectBus(name)` / `disconnectBus(name)`, a `connectedBuses` signal and `send(bus, frame)` to transmit one frame |
| `services/pipeline/WsTransmitService` | Plays a timed list of frames (`TxSchedule`) from the browser: `loadJob`, `start`, `pause`, `resume`, `seek`, `stop` |
| `protocol/CANSubProtocol` | `TxFrame` (a frame to transmit) and the encoders for the WebSocket wire format |
| `types/CanBusTypes`, `types/WorkerTypes` | Wire-format type declarations |
| `utils/DataFormatter` | `formatCanId`, `formatDataBytes`, `formatFlags` |
| `utils/EpochFormatter` | `formatEpochLong`, `formatEpochShort` |

## Minimal integration

```ts
import { WorkerBridge } from '@csselectronics/websocket-client/workers/WorkerBridge';
import { ConnectionService } from '@csselectronics/websocket-client/services/pipeline/ConnectionService';
import InlineWorker from '@csselectronics/websocket-client/workers/CommunicationWorker?worker';
import type { CanFrame } from '@csselectronics/websocket-client/models/CanFrame';

const bridge = new WorkerBridge(new InlineWorker());
bridge.init('https://2c08fbb4-usb.local');
const connection = new ConnectionService(bridge);

bridge.onBatch((frames: CanFrame[]) => {
  for (const frame of frames) {
    // frame.bus, frame.arbitration_id, frame.data, frame.epoch, ...
  }
});

await connection.connectBus('CAN1');
```

The `?worker` import is Vite syntax; other bundlers have an equivalent way to load a module as a Web Worker.

## Notes

- Frames arrive in batches through `onBatch`, at the interval set by `WorkerBridge.init(url, workerPostIntervalMs)`. Keep per-frame work light.
- `CanFrame.key` identifies a message stream (bus, ID and flags). Use `buildKey` and `parseMessageKey` from `models/CanFrame` instead of building the string yourself.

## Licence

For use with CSS Electronics hardware only. See `LICENSE`.
