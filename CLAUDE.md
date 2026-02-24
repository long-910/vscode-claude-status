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

- **NEVER** use `localStorage` or `sessionStorage` in WebView
- **NEVER** make API calls more than once per 5 minutes when Claude Code is idle
- **NEVER** hardcode file paths — always use `os.homedir()` equivalents
- **ALWAYS** run `npm run lint` and `npm test` before committing
- **ALWAYS** keep the status bar item lightweight (no blocking I/O on the main thread)
- **ALWAYS** handle the case where `~/.claude/` does not exist (graceful degradation)

---

## Architecture

Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) before writing any code.

## Feature Specifications

Read all files under `docs/features/` before implementing each feature:

| File | Feature |
|------|---------|
| [`docs/features/01-statusbar.md`](docs/features/01-statusbar.md) | Status bar display |
| [`docs/features/02-webview.md`](docs/features/02-webview.md) | WebView dashboard panel |
| [`docs/features/03-project-cost.md`](docs/features/03-project-cost.md) | Project-level cost tracking |
| [`docs/features/04-prediction.md`](docs/features/04-prediction.md) | Usage prediction & budget alerts |
| [`docs/features/05-heatmap.md`](docs/features/05-heatmap.md) | Session history heatmap |

## Data Layer

Read [`docs/DATA.md`](docs/DATA.md) for JSONL parsing, API calls, and caching logic.

## Settings

Read [`docs/SETTINGS.md`](docs/SETTINGS.md) for all configuration keys.

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
│   ├── extension.ts          # Entry point — activate/deactivate
│   ├── statusBar.ts          # Status bar item management
│   ├── data/
│   │   ├── jsonlReader.ts    # ~/.claude/projects/**/*.jsonl parser
│   │   ├── apiClient.ts      # Anthropic rate-limit header fetcher
│   │   ├── cache.ts          # Disk-backed cache (~/.claude/vscode-claude-status-cache.json)
│   │   ├── projectCost.ts    # Workspace path → project JSONL mapping
│   │   └── prediction.ts     # Rate-of-use prediction engine
│   ├── webview/
│   │   ├── panel.ts          # WebView panel lifecycle
│   │   ├── heatmap.ts        # Heatmap data aggregation
│   │   └── html/
│   │       └── dashboard.html # WebView HTML template
│   └── test/
│       ├── runTest.ts
│       └── suite/
│           ├── jsonlReader.test.ts
│           ├── projectCost.test.ts
│           ├── prediction.test.ts
│           └── cache.test.ts
├── docs/                     # Detailed specs (read before implementing)
├── CLAUDE.md                 # This file
├── CHANGELOG.md
├── package.json
├── tsconfig.json
└── webpack.config.js
```

---

## Git Commit Convention

```
feat: add project cost tracking
fix: handle missing credentials file gracefully
chore: update dependencies
docs: update ARCHITECTURE.md
test: add prediction engine tests
```
