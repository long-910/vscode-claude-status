# vscode-claude-status

> Claude Code token usage & cost — always visible in your VSCode status bar.

[![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/long-kudo.vscode-claude-status?style=flat-square&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=long-kudo.vscode-claude-status)
[![License: MIT](https://img.shields.io/github/license/long-910/vscode-claude-status?style=flat-square)](LICENSE)

🌐 [English](README.md) | [日本語](README.ja.md)

---

## Features

### 📊 Status Bar — Always On
Real-time Claude Code usage at a glance:
```
🤖 5h:78%⚠ 7d:84% | my-app:$3.21
```
Click to open the full dashboard.

### 🗂 Project-Level Cost Tracking *(VSCode exclusive)*
Automatically detects your open workspace and shows how much you've spent
on Claude Code **for that specific project** — today, this week, this month.

### 🔮 Usage Prediction & Budget Alerts *(VSCode exclusive)*
- Calculates your current burn rate ($/hr)
- Predicts when the 5h rate limit will be exhausted
- Optional daily/weekly budget with configurable alert threshold

### 📅 Usage History Heatmap *(VSCode exclusive)*
- GitHub Contributions-style 90-day daily cost heatmap
- Hourly usage pattern bar chart — see when you use Claude Code most

---

## Requirements

- VSCode 1.109+
- Claude Code installed and logged in (`~/.claude/.credentials.json` must exist)
- Python 3.10+ (for claude-tmux-status compatibility, if used together)

---

## Installation

Search **"Claude Status"** in the VSCode Extensions Marketplace, or:

```bash
code --install-extension long-kudo.vscode-claude-status
```

---

## Related Projects

- [claude-tmux-status](https://github.com/long-910/claude-tmux-status) — tmux status bar version (same author)
- [vscode-view-charset](https://github.com/long-910/vscode-view-charset) — file encoding viewer (same author)

---

## Development

See [CLAUDE.md](CLAUDE.md) for implementation guidance (optimized for Claude Code).

```bash
git clone https://github.com/long-910/vscode-claude-status
cd vscode-claude-status
npm install
npm run compile
# Press F5 in VSCode to launch Extension Development Host
```

---

## License

MIT
