# Documentation

User guide: the [README](../README.md) ([日本語](../README.ja.md) · [中文](../README.zh.md)).
This folder holds the specifications. Each topic is described in **one** place; other
documents link to it instead of repeating it.

## Where to find what

| Question | Document |
|---|---|
| Which plans are supported, how they are detected, what each shows, when the API is called | [PLANS.md](PLANS.md) |
| How cost is calculated, the price table, overrides, how to update prices | [PRICING.md](PRICING.md) |
| Every setting, custom status bar format, commands, keybindings | [SETTINGS.md](SETTINGS.md) |
| Modules, data flow, data types, security, platforms | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Transcript format, incremental reading, dedupe, API probe, cache | [DATA.md](DATA.md) |
| What changed in each release | [CHANGELOG.md](../CHANGELOG.md) |
| Development setup, tests, release procedure | [CONTRIBUTING.md](../CONTRIBUTING.md) |

## Feature specifications

| # | Feature | Surface |
|---|---|---|
| [01](features/01-statusbar.md) | Status bar | label, tooltip, colours, custom format |
| [02](features/02-webview.md) | Dashboard panel | layout, message protocol, cards |
| [03](features/03-project-cost.md) | Project cost | workspace → project mapping, per-project totals |
| [04](features/04-prediction.md) | Prediction, budgets & notifications | burn rate, exhaustion, daily / weekly / monthly budgets |
| [05](features/05-heatmap.md) | Usage history | heatmap, hourly chart, punch card |
| [06](features/06-treeview.md) | Sidebar | Activity Bar tree view |

## Reading order for contributors

1. [ARCHITECTURE.md](ARCHITECTURE.md) — the module map and data flow.
2. [DATA.md](DATA.md) and [PRICING.md](PRICING.md) — where every number comes from.
3. The feature spec for the surface you are changing.

## Keeping docs in sync

`src/test/suite/docs.test.ts` fails when a setting or command in `package.json` is missing
from [SETTINGS.md](SETTINGS.md) or any README, or when a relative link or `#anchor` in these
documents points nowhere. Specs describe behaviour and point to the source file; avoid
pasting large code blocks, which go stale.
