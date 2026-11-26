# @csselectronics/can-plot

Live time-series charts for CAN signal data, built on uPlot and used by webCAN. It has no dependency on the other SDK packages: You supply labels, a `FrameClock` and plain `{ times, values }` data.

Part of the [CANsub JS SDK](https://github.com/CSS-Electronics/js-sdk-cansub), which has a starter app and runnable examples (see `signal-chart`). The source is in [`packages/can-plot`](https://github.com/CSS-Electronics/js-sdk-cansub/tree/main/packages/can-plot).

```
npm install @csselectronics/can-plot
```

## Exports

| Export | Purpose |
|---|---|
| `createPlotEngine(cfg)` *(from `/engine`)* | Chart engine: uPlot lifecycle, resizing and redraw loop |
| `useUPlotChart(cfg)` *(from `/preact`)* | Preact hook around the engine (needs `preact` installed) |
| `buildPlotOptions(opts)` | `uPlot.Options` builder: Lines, cursor tooltip, axis font, optional zoom |
| `computeChartQueryWindow(clock, opts?)` | The time window to query data for |
| `relativize(times, values, frameEnd, delay?)` | Converts timestamps to time relative to now |
| `paddedRange(values)` | Y-axis range with some padding |
| `FrameClock` (type) | The time source you provide |
| `createCursorTooltipPlugin`, `getUplotAxisFont`, `CURSOR_TOOLTIP_HIDE_CLASS` | Cursor tooltip helpers |
| `COLOR_CYCLE`, `DOWNSAMPLE_POINTS`, `UPDATE_INTERVAL_MS`, ... | Default settings |

## Licence

For use with CSS Electronics hardware only. See `LICENSE`.
