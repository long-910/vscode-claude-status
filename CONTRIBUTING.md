# Contributing to vscode-claude-status

Thank you for your interest in contributing!
This document covers everything you need to set up a local development environment,
understand the codebase internals, and submit a pull request.

For user-facing documentation see [README.md](README.md).

---

## How to Contribute

1. **Fork** the repository and create a branch:
   ```bash
   git checkout -b feat/my-feature
   ```
2. Read [CLAUDE.md](CLAUDE.md) for coding conventions, non-negotiable rules, and
   implementation order.
3. Make your changes, then run the quality checks:
   ```bash
   npm run lint && npm test
   ```
   Both must be clean before committing.
4. Open a **pull request** against `main` — direct pushes to `main` are not allowed.

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

### Project Structure & How It Works

The module map, data flow and specs are in [docs/](docs/README.md) — start with
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). In one paragraph:

> Claude Code appends to `~/.claude/projects/<project>/<session>.jsonl`. A file watcher
> triggers `DataManager.refresh()`, which reads only the appended bytes (`usageIndex.ts`),
> prices each entry by its model (`pricing.ts`, see [docs/PRICING.md](docs/PRICING.md)) and,
> for Claude.ai subscriptions only, refreshes the rate-limit % at most once per 5 minutes
> while Claude Code is active ([docs/PLANS.md](docs/PLANS.md)). The status bar, sidebar and
> dashboard all render the same `DataManager` data.

Tests live in `src/test/suite/` and run inside VS Code via `npm test`. Pure modules (pricing,
budgets, export, heatmap aggregation) have no `vscode` dependency. `docs.test.ts` checks that
every setting and command is documented and that doc links resolve.

---

## CI / CD

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

Triggered when a **version tag** (`v*`) is pushed
(e.g. `git tag v0.3.0 && git push --tags`).

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
2. Update `CHANGELOG.md` — move `[Unreleased]` content into a new `## [X.Y.Z]`
   section, then restore an empty `## [Unreleased]` above it.
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

## Feature Specifications & Architecture

See the documentation index: [docs/README.md](docs/README.md).

