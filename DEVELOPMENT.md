# Development Guide

This document covers the internals, CI/CD pipeline, and local development setup
for **vscode-claude-status**.

For user-facing documentation see [README.md](README.md).

---

## How It Works

### Data Flow

```
JSONL file updated by Claude Code
  → FileWatcher detects change
    → DataManager.refresh()
      → JsonlReader aggregates token costs   (local, instant)
      → ApiClient fetches rate-limit headers (1 API call, then cached)
      → StatusBar & Dashboard update
```

When Claude Code is idle the extension reads only from the local cache — no API
calls are made until Claude Code becomes active again (JSONL modified recently).

### JSONL Format (verified against Claude Code v2.1.x)

```jsonc
// ~/.claude/projects/<project-hash>/<session-uuid>.jsonl
{
  "type": "assistant",
  "timestamp": "2026-02-28T10:23:45.123Z",
  "cwd": "/home/user/my-project",
  "message": {
    "usage": {
      "input_tokens": 1234,
      "output_tokens": 567,
      "cache_read_input_tokens": 8900,
      "cache_creation_input_tokens": 450
    }
  }
}
```

### Project Path Mapping

Claude Code encodes the workspace path into a directory name by replacing every
non-alphanumeric character with `-`:

```
/home/user/sb_git/my-app
  → ~/.claude/projects/-home-user-sb-git-my-app/
```

The extension uses this as Strategy 1, falling back to scanning JSONL `cwd`
fields for edge cases (Strategy 2).

### Token Cost Formula

Costs are calculated using **Claude Sonnet 4.x** pricing (same as
[claude-tmux-status](https://github.com/long-910/claude-tmux-status)):

| Token type | $/1 M tokens |
|------------|-------------|
| Input | $3.00 |
| Output | $15.00 |
| Cache read | $0.30 |
| Cache creation | $3.75 |

---

## CI / CD

This repository uses two GitHub Actions workflows.

### CI (`ci.yml`) — Lint, Build & Test

Triggered on every **push** and **pull request** to `main`.

```
push / pull_request → main
  └── matrix: ubuntu-latest / macos-latest / windows-latest
        ├── npm ci
        ├── npm run lint
        ├── npm run compile
        └── npm test  (Linux: xvfb-run for headless VSCode)
```

All three platforms must pass before a PR can be merged.

### Release (`release.yml`) — Package & Publish

Triggered when a **version tag** (`v*`) is pushed (e.g. `git tag v0.3.0 && git push --tags`).

```
push tag v*
  ├── npm ci
  ├── npm run lint
  ├── npm run compile
  ├── npm test  (xvfb-run)
  ├── vsce package  →  *.vsix
  ├── Extract release notes from CHANGELOG.md
  ├── Create GitHub Release  (attaches .vsix, marks pre-release if tag contains "-")
  └── Publish to VS Marketplace  (requires VSCE_PAT secret)
```

#### Required Secrets

| Secret | Description |
|--------|-------------|
| `VSCE_PAT` | Personal Access Token for [VS Marketplace](https://marketplace.visualstudio.com/) publishing |

`GITHUB_TOKEN` is provided automatically by GitHub Actions and needs no configuration.

#### Release Flow (step by step)

1. Merge all changes to `main` and make sure CI is green.
2. Update `CHANGELOG.md` — add a `## [X.Y.Z]` section with release notes.
3. Bump `"version"` in `package.json` to match.
4. Commit: `git commit -m "chore: release vX.Y.Z"`
5. Tag and push:
   ```bash
   git tag vX.Y.Z
   git push origin main --tags
   ```
6. The Release workflow runs automatically — GitHub Release is created and the
   extension is published to the Marketplace within a few minutes.

> **Pre-release**: Tags containing `-` (e.g. `v0.3.0-beta.1`) are automatically
> marked as pre-release on GitHub and published with `--pre-release` to the Marketplace.

---

## Local Development

### Setup

```bash
git clone https://github.com/long-910/vscode-claude-status.git
cd vscode-claude-status
npm install
```

Press **F5** in VS Code to launch the Extension Development Host.

### Commands

```bash
npm run compile        # webpack bundle (development)
npm run watch          # watch mode
npm run compile-tests  # compile test files to out/
npm run lint           # ESLint
npm test               # full test suite
npm run package        # production .vsix
```

### Project Structure

```
vscode-claude-status/
├── src/
│   ├── extension.ts          # activate / deactivate
│   ├── config.ts             # typed settings wrapper
│   ├── statusBar.ts          # status bar item + label / tooltip builders
│   ├── data/
│   │   ├── jsonlReader.ts    # JSONL parser + token cost aggregator
│   │   ├── apiClient.ts      # Anthropic API rate-limit header fetcher
│   │   ├── cache.ts          # disk-backed cache (~/.claude/…cache.json)
│   │   ├── dataManager.ts    # central data orchestrator (singleton)
│   │   ├── projectCost.ts    # workspace → JSONL mapping + per-project costs
│   │   └── prediction.ts     # burn rate, time-to-exhaustion, budget prediction
│   ├── webview/
│   │   ├── panel.ts          # WebView dashboard panel (HTML embedded)
│   │   └── heatmap.ts        # heatmap data aggregation (daily + hourly)
│   └── test/suite/
│       ├── jsonlReader.test.ts
│       ├── projectCost.test.ts
│       ├── prediction.test.ts
│       ├── heatmap.test.ts
│       ├── cache.test.ts
│       └── statusBar.test.ts
├── docs/                     # detailed feature & architecture specs
├── CLAUDE.md                 # AI assistant implementation guidance
├── CHANGELOG.md
└── package.json
```

### Architecture

```
┌──────────────────────────────────────────────────────┐
│                 VS Code Extension Host               │
│                                                      │
│  StatusBar   DashboardPanel   FileWatcher(JSONL)     │
│      └────────────┴──────────────────┘               │
│                   │                                  │
│           ┌───────▼───────┐                          │
│           │  DataManager  │  (singleton)              │
│           └───────┬───────┘                          │
│                   │                                  │
│      ┌────────────┼────────────┐                     │
│      │            │            │                     │
│ JsonlReader   ApiClient     Cache                    │
│ ProjectCost  (rate headers) (disk)                   │
└──────────────────────────────────────────────────────┘
          │
  ~/.claude/projects/
    <hash>/<session>.jsonl
```

---

## Contributing

1. Fork the repository
2. Create a branch: `git checkout -b feat/my-feature`
3. Read [CLAUDE.md](CLAUDE.md) for coding conventions and implementation order
4. Run `npm run lint && npm test` — must be clean before committing
5. Submit a pull request
