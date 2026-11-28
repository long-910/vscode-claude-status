# Feature 05: Session History Heatmap

Source: aggregation in [`src/webview/heatmap.ts`](../../src/webview/heatmap.ts), rendering in
[`src/webview/panel.ts`](../../src/webview/panel.ts)

## Purpose

**VSCode-exclusive feature** — visualize Claude Code usage patterns over time.
Three views, top to bottom in the Usage History card: a GitHub Contributions-style daily heatmap
(configurable days), a weekday × hour punch card (last 30 days), and an hourly bar chart
(last 30 days, average cost by hour of day).

The heatmap and punch card are plain HTML/CSS; the hourly chart uses **Chart.js** loaded
from CDN — no npm dependency needed in the extension itself, keeping the package size small.

---

## Data Aggregation (`src/webview/heatmap.ts`)

### Data Types

| Type | Fields |
|---|---|
| `DailyUsage` | `date` (`YYYY-MM-DD`, local), `cost` (USD), `sessionCount` (assistant entries that day), `tokensTotal` |
| `HourlyUsage` | `hour` (0–23, local), `avgCost` (USD per entry), `count` (entries at that hour, all days) |
| `HeatmapData` | `daily` (N days, default 90), `hourly` (last 30 days), `dowHour` (7 × 24 total USD, row 0 = Sunday, last 30 days), `generatedAt` |

Cost is always calculated from token counts — there is no `costUSD` field in JSONL.

### Main Entry Point

`getHeatmapData(days = 90, options: CostOptions): Promise<HeatmapData>`

- Global view across all projects; `options` are the same cost options as every other view.
- Files: `findAllJsonlFiles(cutoff)` — the shared discovery with a per-file mtime filter.
  (A directory's mtime is not used: appending to an old transcript does not change it.)
- Lines: `parseUsageLine()` + `firstSeen()` — the same parsing and streaming dedupe as the
  usage index ([DATA.md](../DATA.md#line-parsing-and-streaming-deduplication-all-readers)).
- At most 4 files are read at a time (`READ_CONCURRENCY`) to keep memory flat on large histories.
- Computed only while the dashboard is open, cached in `DataManager` for 5 minutes
  (`heatmapTtlMs`), in the background after the main update; a second `onDidUpdate` fires when
  it is ready. Pricing setting changes invalidate the cache.

### Aggregation Functions

| Function | Result |
|---|---|
| `aggregateByDay(entries, days)` | One `DailyUsage` per local day in the window, **including zero-activity days** |
| `aggregateByHour(entries, 30)` | Always the last 30 days, whatever `heatmap.days` says; `avgCost = totalCost / count` (per entry, not per day) |
| `aggregateByDowHour(entries, 30)` | `number[7][24]` of total USD per (weekday, hour) |

---

## Heatmap Rendering (GitHub Contributions Style)

Plain HTML/CSS (no Chart.js): one flex column per week, 12 × 12 px cells, month labels above and a
*Less … More* legend below. Hovering a cell shows `YYYY-MM-DD: $X.XXX`.

### Level Thresholds

`getCostLevel(cost, maxCost)` maps each day to one of five levels relative to the most expensive day:

| Level | Cost ÷ max | Colour |
|---|---|---|
| 0 | no cost | editor background with a border |
| 1 | < 25 % | `#0e4429` |
| 2 | < 50 % | `#006d32` |
| 3 | < 75 % | `#26a641` |
| 4 | ≥ 75 % | `#39d353` |

---

## Punch Card (Weekday × Hour)

A 7 × 24 grid of `dowHour` that shows **where in the week** cost is spent (last 30 days, local time).

- Reuses the heatmap levels (`getCostLevel`, `hm-l0` – `hm-l4`), relative to the grid's own
  largest cell.
- Row labels are localized short weekday names (`toLocaleString`); column labels every 3 hours;
  cell tooltip `Ddd HH:00 — $X.XXX`.
- Hidden when `HeatmapData.dowHour` is absent.

---

## Hourly Bar Chart (Chart.js)

A bar chart of `hourly[].avgCost` for hours `0h` – `23h`, in the theme's progress-bar colour, legend
hidden; the tooltip shows the average and the number of entries.

> **Chart.js version:** pinned to `chart.js@4.4.0` from jsDelivr (allowed by the dashboard CSP).
> Do not use `@latest`.

---

## Data Refresh

Heatmap data is read from JSONL only (no API call). It is recalculated:

- on the first dashboard open (not at activation — never while the dashboard is closed)
- on a JSONL FileWatcher trigger while the dashboard is open, once the 5-minute cache expires
- when the user clicks "↻ Refresh", or a `claudeStatus.pricing.*` setting changes (both
  invalidate the cache)

The computation runs in a background `Promise` so it never blocks the main update; the WebView
re-renders the Usage History card when the second `update` arrives.
