# @csselectronics/can-types

Shared CAN domain types and helpers for CANsub apps: Filter-state shapes, decoded-signal interfaces, summary types, J1939/PGN helpers, error formatters and the `RenderSignals` UI tick. It sits between `@csselectronics/websocket-client` (raw frames) and the higher-level packages such as `@csselectronics/can-pipeline`.

Part of the [CANsub JS SDK](https://github.com/CSS-Electronics/js-sdk-cansub), which has a starter app and runnable examples. The source is in [`packages/can-types`](https://github.com/CSS-Electronics/js-sdk-cansub/tree/main/packages/can-types).

```
npm install @csselectronics/can-types
```

## What's included

| Module | Purpose |
|---|---|
| `types/FilterTypes` | `FilterableItem`, `MessageInfo`, `SignalInfo`, `SortedKeyView`: per-message metadata for filtering and display |
| `types/DecodingTypes` | `ICanMessage`, `ICanSignal`: minimal decoded message and signal shapes |
| `types/SummaryTypes` | `MessageSummary`, `SignalSummary`, `SummaryBase`, `SignalValueMode` |
| `types/TpTypes` | `TpRowType` (`'ASSEMBLED' \| 'CM' \| 'DT' \| 'ISO' \| 'FP'`): the transport-protocol row category |
| `utils/CanIdParser` | `parseCanId`, `validateCanId` |
| `utils/j1939` | `extractPgn`, `extractSA`, `formatPgn`, `formatSA`, `pgnMaskFor` |
| `utils/ErrorFormatter` | `formatApiError` |
| `services/render/RenderSignals` | 10 Hz and 1 Hz UI update signals driven by `WorkerBridge` |

## Licence

For use with CSS Electronics hardware only. See `LICENSE`.
