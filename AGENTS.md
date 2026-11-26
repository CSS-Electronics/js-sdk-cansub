# Notes for AI coding agents

This repo is the CANsub JS SDK: Example web apps (`examples/`), code they share (`shared/`) and the source of the public `@csselectronics/*` packages (`packages/`). Users build browser apps that talk to a CSS Electronics CANsub CAN interface over its REST API and WebSocket stream. The deliverable is one self-contained HTML file per app.

## Device and API context

This repo documents the code. For facts about the device (REST/WebSocket API, bit-timing, filters, transmit, protocols such as OBD2/UDS/J1939, troubleshooting), first download the CANsub Docs for AI into `docs-for-ai/` (gitignored) and search them when needed:

- CANsub Docs: `https://canlogger.csselectronics.com/cansub-docs/cansub4/cansub4_llm.txt` (written for the CANsub.4; the CANsub.2 is the same with 2 instead of 4 channels)
- CANsub Intro: `https://canlogger.csselectronics.com/cansub-intro/cansub_intro_llm.txt`

The files are large: Search them (each page starts with its title in brackets, e.g. `[Getting started]:`) rather than reading them whole.

## How to build an app

1. **Start from the template:** Copy `examples/starter/` to `examples/<app>/`. Keep the sidebar and put the custom work in the main area and in `main.ts`. Add a line for the app to the root `index.html`, so the dev server's start page lists it.
2. **Check [`CAPABILITIES.md`](CAPABILITIES.md) before writing plumbing.** It maps tasks (bit rate, filters, transmit, DBC, signal encoding, J1939, transport protocols, queries, charts, formatting) to existing functions and their import paths. **Don't rebuild what `shared/ui/` covers.** It already handles the device URL, connecting channels (several at once), bit rate and PHY settings from the CANsub bit-timing table, DBC files (load, assign to channels, remembered in the browser), picking signals or CAN IDs, and live charts. Change behaviour through the options of `mountSidebar`, `mountSignalPicker`, `mountMessagePicker` and `mountLiveChart`, or edit the `shared/ui` code when an app needs more.
3. **Get data from the session:** `session.onFrames(frames => ...)` delivers frames already decoded and stored. Read signals with `frame.getSignalKeys()` / `frame.getSignalValueByIndex(i)` or `frame.getSignalValue(key)`. Signal keys look like `CAN1_2_IDE0_DIR0_RTR0_TP0_TLTempHR` (bus, decimal ID, flags, signal name). `session.describeSignal(key)` gives a display label, the bare name and the unit.
   - **A signal name alone does not identify a signal.** The same name can appear in several messages, on several channels, in received and transmitted frames or, with J1939, from several ECUs (one key per source address). The full key identifies it: Channel, CAN ID, frame flags (incl. direction) and signal name. Store and compare full keys, never names. `session.describeSignal(key).label` shows channel, CAN ID, message and signal (like webCAN), so same-named signals stay distinct on screen.
   - Never build keys by hand: Let the user pick with `mountSignalPicker`, or use `session.findSignalKeys('TLTempHR', { bus: 'CAN1', messageName: 'ThermocoupleHrTop', tx: false })` (`tx: false`: received frames only), which returns a list. It only knows signals that have arrived, so it returns `[]` until decoded frames come in: Look keys up in `onUpdate`, not once at startup.
4. **Charts:** Use `mountLiveChart` (webCAN's clock, downsampled queries over the stored frames, 50 Hz redraw). Do not keep your own arrays of samples for plotting. For other views of history, query `session.storage` (`getFramesInTimeWindowForBus`).
5. **Handle every connected channel:** Frames carry `frame.bus`; an app must not assume CAN1 only. React to channels connecting or disconnecting with `session.onConnectionChange((bus, connected) => ...)`. The session state is also available as Preact signals (e.g. `session.connection.connectedBuses`) for reactive code, but callbacks are enough.
6. **Render once per batch, never per frame:** Frames arrive in batches of about 10 per second, at up to thousands of frames per second. Collect state in `session.onFrames(...)` and update the DOM in `session.onUpdate(...)`, which runs once per batch (~10 Hz, like webCAN's views). `onUpdate` only runs while frames arrive, so values computed there freeze when the bus goes quiet. For live rates, poll the device's channel status every second (`api.apiCanChannelGet`: frames/s, bus load), like webCAN's status bar (see `message-summary`).
7. **Build the deliverable:** `npm run build -- <app>` writes `dist/<app>.html`, which must work on its own from disk (`file://`).
8. **See it working in a browser.** A type check and a build don't show whether the app renders or receives data. Use a browser tool such as Playwright:
   - If none is available, or the Playwright MCP server runs without `--ignore-https-errors`, ask the user before setting one up or changing it: The Playwright MCP server (`npx @playwright/mcp@latest --ignore-https-errors`) or a Playwright script (Node or Python). Keep a Python venv in `.venv/` (ignored by git and the dev server) or outside the repo.
   - Open the page with `?device=<url>`, connect a channel and wait for data. Take a screenshot and look at it, and check the console for errors.
   - Ignore HTTPS errors in the test browser (`ignoreHTTPSErrors: true`): The dev server and the CANsub use self-signed certificates.
   - Check the dev server page and the built file. For test data without a CAN bus, see Device rules.

## Device rules

- The device only accepts PHY (bit-rate) changes on a channel that is not connected. The channel panel locks them while connected.
- One app (browser tab) per channel: A channel already connected elsewhere fails to connect.
- A CANsub.2 has 2 channels, a CANsub.4 has 4. Read them with `session.buses` (REST `GET /api/can`) and build UIs that work with either, as webCAN does.
- The PHY settings are written as one object. The channel panel always sets `txAckFrames: true`, as webCAN does: The device then echoes each transmitted frame, so the app sees its own frames (marked TX).
- `CansubSession.open()` syncs the device clock to the PC when they differ by more than 5 s, before any channel connects. Do not set the time while channels are connected: It would break the time order of stored frames.
- To test without a vehicle or machine, connect CAN1 to CAN2 and replay a CSV file on CAN2 with python-can-cansub's `can_player` (see "Test data without a CAN bus" in `README.md`; `sample-data/` has a CANmod.temp trace and its DBC). Connect CAN1 in the app before starting the replay: Without a receiver, nothing acknowledges the frames and the replay stalls.
- **J1939:** A DBC with `BA_ "ProtocolType" "J1939"` is matched by PGN, so one message decodes every source address (each sender still gets its own signal key).

## Where to look

- **What exists:** [`CAPABILITIES.md`](CAPABILITIES.md), task by task. Start here.
- **Building blocks:** `shared/ui/` (`index.ts` lists the exports). Each file starts with a short description.
- **API reference:** The doc comments. For the packages with source here (`websocket-client`, `rest-client`, `can-types`, `can-plot`), read `packages/<name>/src/`. The npm-only packages ship `.d.ts` files: `node_modules/@csselectronics/<name>/index.d.ts` and its subfolders. Read these before guessing an API.
- **Package overviews:** `README.md` in each package (`node_modules/@csselectronics/<name>/README.md`).
- **Working code:** `examples/<name>/main.ts`. `raw-frame-viewer` and `device-config` show the packages used directly, without `shared/ui`. `csv-files` exports and imports CSV files.
- **Implementation details:** `packages/<name>/src/` for the public packages. The npm-only packages (`can-tp`, `can-pipeline`, `can-decode`) ship minified, so rely on their types and READMEs.

## Conventions

- Each app is a folder in `examples/` with `index.html` and `main.ts`. Code that several apps use goes in `shared/`, imported relatively (`../../shared/...`).
- Import from package subpaths, as the examples do (e.g. `@csselectronics/websocket-client/workers/WorkerBridge`).
- **Keep the built file self-contained:** Bring assets in with imports (`?raw` for text such as DBC files, CSS imports), never with `fetch`, CDNs or external URLs. The page icon is `shared/favicon.png`; the build inlines it.
- Style with the classes and CSS variables in `shared/ui/cansub-ui.css` (`cs-app`, `cs-main`, `cs-card`, `cs-table`, `cs-stats`, ...) so apps look consistent.
- Example device URLs such as `https://2c08fbb4-usb.local` are real CANsub ID formats: `https://<id>-usb.local` over USB, the device hostname or IP over Ethernet. An app also takes the URL from `?device=<url>`.
- **Two certificates:** The dev server (`https://localhost:5173`) and the CANsub each have their own. An app reaches the CANsub cross-origin, so if the browser does not trust the CANsub certificate, requests and the WebSocket fail without a warning. The fix is to install the CANsub certificate or open the device URL once and accept the warning (see Troubleshooting in `README.md`); never work around it in code.

## Commands

| Task | Command |
|---|---|
| Install | `npm install` |
| Dev server (HTTPS, port 5173; `/` lists the examples) | `npm run dev` |
| Dev server without opening a browser (for agents; if 5173 is busy, read the port from the output) | `BROWSER=none npm run dev` |
| Type-check all examples | `npx tsc --noEmit` |
| Build every example to `dist/<name>.html` | `npm run build` |
| Build one example | `npm run build -- <name>` |
| Rebuild the packages in `packages/` | `npm run build:packages` |

## Licence

The SDK may only be used with CSS Electronics hardware (see `LICENSE`). Code built from it must keep that restriction. Do not decompile or de-minify the npm-only packages.
