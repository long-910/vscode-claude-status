# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

---

## Project Overview

**vscode-claude-status** is a Visual Studio Code extension that displays Claude Code token
usage and cost in the VSCode status bar, with rich WebView dashboard featuring
project-level cost tracking, usage prediction, and historical heatmap visualization.

Reference implementation: [claude-tmux-status](https://github.com/long-910/claude-tmux-status)
(same author — port the data-reading logic from Python to TypeScript)

---

## ⛔ Non-Negotiable Rules

- **NEVER** push directly to `main` — always open a Pull Request
- **NEVER** use `localStorage` or `sessionStorage` in WebView
- **NEVER** make API calls more than once per 5 minutes when Claude Code is idle
- **NEVER** hardcode file paths — always use `os.homedir()` equivalents
- **ALWAYS** run `npm run lint` and `npm test` before committing
- **ALWAYS** keep the status bar item lightweight (no blocking I/O on the main thread)
- **ALWAYS** handle the case where `~/.claude/` does not exist (graceful degradation)

---

## Documentation

Start at [`docs/README.md`](docs/README.md) — it says which document covers what. Each topic
lives in exactly one document; link to it rather than repeating it.

| Before you change… | Read |
|---|---|
| anything | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — module map and data flow |
| reading transcripts, the API probe, the cache | [`docs/DATA.md`](docs/DATA.md) |
| cost calculation or the price table | [`docs/PRICING.md`](docs/PRICING.md) |
| plan / provider behaviour, when the API is called | [`docs/PLANS.md`](docs/PLANS.md) |
| a setting or command | [`docs/SETTINGS.md`](docs/SETTINGS.md) |
| a UI surface | the matching spec in [`docs/features/`](docs/README.md#feature-specifications) (01 status bar … 06 sidebar) |

When adding a setting or command, document it in `docs/SETTINGS.md` and in all three READMEs —
`src/test/suite/docs.test.ts` enforces this and checks every relative link and `#anchor`.

---

## Development Commands

```bash
npm install          # Install dependencies
npm run compile      # TypeScript build
npm run watch        # Watch mode
npm run lint         # ESLint
npm test             # Full test suite
npm run package      # Production build (vsce package)
```

Press **F5** in VSCode to launch Extension Development Host.

---

## Implementation Order

Implement in this order to keep the extension usable at every step:

1. **Data layer** — JSONL reader + API client + cache (`src/data/`)
2. **Status bar** — minimal display (`src/statusBar.ts`)
3. **WebView skeleton** — panel opens, shows placeholder (`src/webview/`)
4. **Project cost** — workspace path matching (`src/data/projectCost.ts`)
5. **Prediction** — rate calculation on top of existing data (`src/data/prediction.ts`)
6. **Heatmap** — historical aggregation + chart rendering (`src/webview/heatmap.ts`)

---

## Tech Stack

- **Language**: TypeScript 5.x
- **Runtime**: Node.js (VSCode extension host)
- **Test**: Mocha + `@vscode/test-electron`
- **Lint**: ESLint + `@typescript-eslint`
- **Build**: webpack (production), tsc (development)
- **Package**: `@vscode/vsce`
- **Chart library**: Chart.js (loaded via CDN in WebView, pinned version)

---

## File Structure

```
vscode-claude-status/
├── src/
│   ├── extension.ts          # Entry point — activate/deactivate, commands
│   ├── config.ts             # Typed accessors for claudeStatus.* settings
│   ├── statusBar.ts          # Status bar item management
│   ├── treeView.ts           # Activity Bar "Usage Overview" tree view
│   ├── data/
│   │   ├── dataManager.ts    # Singleton orchestrating readers, API, cache, refresh
│   │   ├── jsonlReader.ts    # JSONL streaming, file discovery, usage totals
│   │   ├── pricing.ts        # Token pricing: manual, per-model table, overrides
│   │   ├── usageIndex.ts     # Incremental per-file usage index + dedupe
│   │   ├── apiClient.ts      # Anthropic rate-limit header fetcher
│   │   ├── cache.ts          # Disk-backed cache (~/.claude/vscode-claude-status-cache.json)
│   │   ├── claudeHome.ts     # claudeStatus.claudeHome resolution
│   │   ├── projectCost.ts    # Workspace path → project JSONL mapping
│   │   ├── accountInfo.ts    # Claude Code account info (usage-based plan detection)
│   │   ├── prediction.ts     # Rate-of-use prediction engine
│   │   ├── budget.ts         # Budget thresholds, once-per-period alert tracking
│   │   ├── localTime.ts      # Local calendar helpers (date keys, month start)
│   │   └── exportUsage.ts    # CSV / JSON serializers for Export Usage Data
│   ├── webview/
│   │   ├── panel.ts          # WebView panel lifecycle + dashboard HTML
│   │   ├── heatmap.ts        # Heatmap / hourly / punch card aggregation
│   │   └── formatDuration.ts # Duration formatting shared with the WebView
│   └── test/
│       └── suite/            # Mocha suites (*.test.ts), run by @vscode/test-cli
├── docs/                     # Specs — index in docs/README.md
├── CLAUDE.md                 # This file
├── CHANGELOG.md
├── package.json
├── tsconfig.json
└── webpack.config.js
```

---

## Git Branch Convention

Use the following prefixes for branch names:

| Prefix | Use case |
|--------|----------|
| `feat/` | New feature |
| `fix/` | Bug fix |
| `docs/` | Documentation only |
| `chore/` | Maintenance, dependency updates |
| `test/` | Tests only |
| `refactor/` | Code refactoring without behaviour change |

Examples:

```
feat/status-bar-time-format
fix/missing-credentials-crash
docs/update-architecture
chore/update-dependencies
```

> **Note for automated Claude Code sessions:** the task runner requires branches that
> start with `claude/` and end with the session ID (e.g. `claude/feat-description-XxXxX`).
> This is a platform constraint — the prefix rule above applies to all human-authored branches.

---

## Git Commit Convention

```
feat: add project cost tracking
fix: handle missing credentials file gracefully
chore: update dependencies
docs: update ARCHITECTURE.md
test: add prediction engine tests
```

## Changelog Convention

- **ALWAYS** keep `## [Unreleased]` as the first section in `CHANGELOG.md`
- When releasing, move `[Unreleased]` content into a new `## [X.Y.Z] — YYYY-MM-DD` section, then restore an empty `## [Unreleased]` above it
