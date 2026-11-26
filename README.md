# CANsub JavaScript/TypeScript SDK

Build custom web apps for the [CANsub.2](https://www.csselectronics.com/products/can-fd-usb-interface-ethernet-cansub-2) and [CANsub.4](https://www.csselectronics.com/products/can-bus-interface-usb-ethernet-cansub-4) CAN interfaces by [CSS Electronics](https://www.csselectronics.com/).

Your app talks directly to the CANsub via its REST and WebSocket API: No backend, driver or installation. Build it as one HTML file to use offline, share with your team or host on a web server. [webCAN](https://www.csselectronics.com/pages/webcan-can-bus-streaming-software-browser), the browser software on every CANsub, uses the same SDK packages.

This repo has runnable examples, reusable building blocks and the source of the public SDK packages (also on npm). We recommend building apps with an AI coding agent: [`AGENTS.md`](AGENTS.md) guides it and points it to the CANsub Docs for AI. Let the agent check its work in a real browser, e.g. via the Playwright MCP server.

The SDK is at an early stage. Questions and feedback are very welcome: Open an issue or [contact us](https://www.csselectronics.com/pages/contact-us).

## Quick start

### Prerequisites

- **Node.js 20.19 or newer** and npm
- A CANsub. No CAN bus at hand? See [Test data without a CAN bus](#test-data-without-a-can-bus)
- **The CANsub certificate installed on your PC** ([guide](https://canlogger.csselectronics.com/cansub-docs/cansub2/getting_started/certificate/index.html)), or open the device URL once and accept the warning

### Setup

1. Run **`install.bat`** (or `npm install`)
2. Run **`run_dev.bat`** (or `npm run dev`) to open the list of examples
3. Accept the certificate warning of the dev server (`localhost`)
4. Open `starter`, enter your device URL (e.g. `https://2c08fbb4-usb.local`) and connect a channel

### Test data without a CAN bus

Connect CAN1 to CAN2, open the starter and connect CAN1 at 500 kbit/s. Then replay the sample on CAN2 from the repo folder with [python-can-cansub](https://github.com/CSS-Electronics/python-can-cansub):

```
pip install python-can-cansub
can_player --interface cansub --channel 2c08fbb4-usb.local@2 --bitrate 500000 --data-bitrate 1000000 sample-data/canmod-temp.csv
```

The starter decodes the CANmod.temp temperatures with the bundled DBC. Any webCAN CSV file replays the same way.

- Over Ethernet, use the device IP as channel, e.g. `192.168.1.10@2`
- Use the bit rate the recording was made at, for `--bitrate` and CAN1 (the sample: 500 kbit/s; J1939 buses often use 250 kbit/s). `--data-bitrate` only matters for CAN FD frames
- Connect CAN1 before the replay starts: Without a receiver, nothing acknowledges the frames and the replay stalls. Restart the replay if CAN1 disconnects
- The sample lasts about 5 minutes

## Build your own app

Copy `examples/starter/` to `examples/my-app/`, open `https://localhost:5173/examples/my-app/` and edit `main.ts`. It uses these building blocks from `shared/ui/`:

| Building block | What it gives you |
|---|---|
| `CansubSession` | Device connection with webCAN's frame pipeline. `session.onFrames(...)` gives decoded frames |
| `mountSidebar` | Device URL, channel cards (connect, bit rate) and DBC files |
| `mountSignalPicker` | Searchable list of the decoded signals |
| `mountMessagePicker` | Searchable list of CAN IDs that filters `session.filteredStorage` |
| `mountLiveChart` | Live chart of decoded signals, as smooth as webCAN's |
| `cansub-ui.css` | Layout and styles, colours as CSS variables |

The sidebar parts also mount on their own (`mountDevicePanel`, `mountChannelPanel`, `mountDbcPanel`). For everything else (transmit, filters, J1939, transport protocols, ...), see [`CAPABILITIES.md`](CAPABILITIES.md). A minimal app:

```typescript
import { CansubSession, mountSidebar } from '../../shared/ui';
import myDbc from './my-file.dbc?raw';

const session = new CansubSession();
mountSidebar(document.getElementById('sidebar')!, session, {
  dbc: { defaults: [{ name: 'my-file.dbc', content: myDbc }] },
});
session.onFrames(frames => {
  for (const frame of frames) {
    // A full signal key, e.g. from mountSignalPicker or session.findSignalKeys()
    const temp = frame.getSignalValue('CAN1_2_IDE0_DIR0_RTR0_TP0_TLTempHR');
    // ...
  }
});
```

Find signal keys with `session.findSignalKeys('TLTempHR')`, or let users pick them with `mountSignalPicker`. A signal name can have several keys (channels, messages, J1939 senders).

## Building for deployment

Run **`run_build.bat`** (or `npm run build`; one app: `npm run build -- my-app`). Each example becomes one self-contained file, `dist/<name>.html`: Open it directly in a browser, share it with your team or host it on a web server.

Bring assets in with imports, never `fetch` or external URLs: `import dbc from './my-file.dbc?raw'`, `import 'pkg/style.css'` (see `signal-chart`). The build adds third-party licence notices at the top of the file: Keep them when you share it.

## Examples

Each folder in `examples/` is a complete app: The dev server's start page lists them, a new app opens at `/examples/<name>/`, and `npm run build` builds them.

| Example | Description |
|---|---|
| `starter/` | Template for your own app: Sidebar, signal picker and a live value table |
| `signal-chart/` | Live plot of DBC-decoded signals from any message and channel |
| `frame-table/` | The newest raw CAN frames of every channel |
| `message-summary/` | One row per CAN ID: Frame count, frame rate and latest data |
| `csv-files/` | Export and import CSV files in webCAN's raw format |
| `filtered-trace/` | Time-sorted trace across channels, filtered by CAN ID |
| `raw-frame-viewer/` | Minimal integration: Stream frames with `websocket-client` only |
| `device-config/` | Device info, time sync and bit rate with `rest-client` only |
| `bitrate-autodetect/` | Detect the bit rate of an unknown bus (copy `detectBitrate()`) |

`shared/` holds the building blocks (`ui/`), the WebSocket worker and the connect form. Put your own shared parts there too, and take the `shared/` files an app imports along if you move it to another project.

## Configuration

The device URL is entered in the app and remembered. A link can set it: `my-app.html?device=https://2c08fbb4-usb.local`.
## Packages

Install a package from npm, e.g. `npm install @csselectronics/websocket-client`. All names start with `@csselectronics/`, and every package ships documented type definitions.

| Package | Use it for | Source here |
|---|---|---|
| `websocket-client` | Stream raw frames: `WorkerBridge`, `ConnectionService`, `CanFrame` | Yes |
| `rest-client` | Device configuration via the REST API, bit-rate lookup | Yes |
| `can-types` | Shared types, J1939/PGN helpers, formatters, `RenderSignals` | Yes |
| `can-plot` | Live time-series chart primitives | Yes |
| `can-tp` | Transport protocols (ISO-TP, J1939 TP, NMEA 2000 Fast Packet) | npm only |
| `can-pipeline` | Frame storage, filters, statistics, time control | npm only |
| `can-decode` | Real-time DBC decoding | npm only |

### Tiered usage

**Minimal "frames in" integration** (e.g. a data bridge or logger):
```typescript
import { WorkerBridge } from '@csselectronics/websocket-client/workers/WorkerBridge';
import { ConnectionService } from '@csselectronics/websocket-client/services/pipeline/ConnectionService';
import InlineWorker from '../../shared/worker.ts?worker&inline';
import type { CanFrame } from '@csselectronics/websocket-client/models/CanFrame';

const bridge = new WorkerBridge(new InlineWorker());
bridge.init('https://2c08fbb4-usb.local');
const connection = new ConnectionService(bridge);

bridge.onBatch((frames: CanFrame[]) => {
  for (const frame of frames) {
    // forward, log, transform, store, ...
  }
});

await connection.connectBus('CAN1');
```

**Filtered trace / per-message stats**: Add `can-types` and `can-pipeline` (`FullFrameStorageService`, `FilterSelectionService`, `StatisticsService`).

**Live signal charts**: Add `can-decode` and `can-plot`. `shared/ui/liveChart.ts` shows the wiring.

## Modifying a package

The examples use `packages/` directly (npm workspace), so an edit there shows up in `npm run dev` at once. To use a modified package in your own app:

1. Fork this repo and edit `packages/<name>/src/`
2. Run `npm run build:packages` to build `packages/<name>/dist/`
3. Point your app at it, with an `overrides` entry so the other SDK packages use it too:
```json
"dependencies": { "@csselectronics/websocket-client": "file:../js-sdk-cansub/packages/websocket-client/dist" },
"overrides": { "@csselectronics/websocket-client": "file:../js-sdk-cansub/packages/websocket-client/dist" }
```

`npm pack packages/<name>/dist` creates a shareable `.tgz`. Fixes and improvements are welcome as issues or pull requests.

## Project structure

```
index.html            # Page listing the examples (dev server)
examples/<name>/      # One app per folder: index.html, main.ts, assets
shared/               # Code shared by the examples (ui/ building blocks, WebSocket worker)
sample-data/          # CANmod.temp trace (CSV) and DBC for replay tests
packages/             # Source of the public SDK packages
scripts/              # Build scripts for the examples and the packages
dist/                 # Build output: one <name>.html per example
```

## Licence

Use, modify and share the SDK, but only with CSS Electronics hardware. See [LICENSE](LICENSE) for the full terms (not an OSI open-source licence).

## Troubleshooting

The dev server (`https://localhost:5173`) and the CANsub each have their own certificate. Accepting one does not cover the other.

**Certificate warning on the dev server**: Click "Advanced" and "Proceed" in your browser.

**No data or "No answer from …" from the CANsub**: The browser silently blocks an untrusted device. Install the CANsub certificate ([guide](https://canlogger.csselectronics.com/cansub-docs/cansub2/getting_started/certificate/index.html)) or open the device URL in a tab once and accept the warning.

**Device not reachable**: Check the device URL (USB: `https://<id>-usb.local`, Ethernet: hostname or IP).
