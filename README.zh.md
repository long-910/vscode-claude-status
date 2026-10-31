# vscode-claude-status

> Claude Code 的令牌用量与费用 — 始终显示在 VS Code 状态栏中。

![vscode-claude-status social preview](https://repository-images.githubusercontent.com/1165729413/1dc1fbe5-b0d9-45f9-9b5b-c5ad06e36d10)

<div align="center">

[![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/long-kudo.vscode-claude-status?style=flat-square&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=long-kudo.vscode-claude-status)
[![Open VSX](https://img.shields.io/open-vsx/v/long-kudo/vscode-claude-status?style=flat-square&label=Open%20VSX)](https://open-vsx.org/extension/long-kudo/vscode-claude-status)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/long-kudo.vscode-claude-status?style=flat-square&logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=long-kudo.vscode-claude-status)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/long-kudo.vscode-claude-status?style=flat-square&logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=long-kudo.vscode-claude-status)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.73.0-007ACC?style=flat-square)](https://code.visualstudio.com/)

[![License: MIT](https://img.shields.io/github/license/long-910/vscode-claude-status?style=flat-square)](LICENSE)
[![CI](https://github.com/long-910/vscode-claude-status/actions/workflows/ci.yml/badge.svg)](https://github.com/long-910/vscode-claude-status/actions/workflows/ci.yml)
[![Release](https://github.com/long-910/vscode-claude-status/actions/workflows/release.yml/badge.svg)](https://github.com/long-910/vscode-claude-status/actions/workflows/release.yml)
[![Sponsor](https://img.shields.io/badge/Sponsor-GitHub-pink?logo=github)](https://github.com/sponsors/long-910)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-Support-FF5E5B?logo=ko-fi&logoColor=white)](https://ko-fi.com/long910)

🌐 [English](README.md) | [日本語](README.ja.md) | [中文](README.zh.md)

</div>

## 概述

**vscode-claude-status** 是一款 Visual Studio Code 扩展，让您无需离开编辑器即可实时监控 [Claude Code](https://claude.ai/code) 的使用情况。

扩展从 `~/.claude/projects/` 本地读取会话数据，最多每 5 分钟调用一次 Anthropic API 获取速率限制头信息。所有令牌费用均在客户端计算，按模型（Opus、Sonnet、Haiku、Fable 等）使用内置费率；比内置费率表更新的模型按同系列最新费率估算，可通过 `claudeStatus.pricing.modelOverrides` 设置准确费率。

> [!NOTE]
> **API 调用极少，且仅在 Claude Code 活跃期间发生。**
> 速率限制 API 调用仅在 JSONL 文件最近更新时触发（即 Claude Code 使用中）。
> 停止使用 Claude Code 后，扩展将完全停止 API 调用。
> 每次调用约消耗 9 个令牌（`claude-haiku-4-5`），≈ $0.00013。
> 默认设置下月均费用：**< $0.01**。
> 设置 `claudeStatus.rateLimitApi.enabled: false` 可停止所有新的 API 调用。
> 若存在缓存，将继续显示上次获取的速率限制 % 并附带 `[Xm ago]` 过期提示。
> 无缓存时，仅显示费用。

> [!WARNING]
> **费用数据为估算值。** 根据本地会话记录，按 Anthropic 的 API 标价（2026-10-31 核对）计算。
> 不含协议折扣、席位费以及合作平台（Bedrock / Vertex）的定价。
> 新模型或价格调整可通过 `claudeStatus.pricing.modelOverrides` 设置 — 参见 [docs/PRICING.md](docs/PRICING.md)。

---

## 功能

### 📊 状态栏 — 始终可见

固定在 VS Code 状态栏的实时用量摘要。

| 状态 | 示例 |
|------|------|
| 正常（% 模式，Claude.ai Max） | `🤖 5h:45% 7d:62%` |
| 警告 ≥75% | `🤖 5h:78%⚠ 7d:84%⚠` |
| 达到速率限制 | `🤖 5h:100%✗` |
| 仅 5 小时套餐（无 7d 窗口） | `🤖 5h:45%` |
| 费用模式 | `🤖 5h:$14.21 7d:$53.17` |
| 按量付费（API 密钥、Bedrock、按量付费 Enterprise） | `🤖 5h:$0.15 7d:$0.42` |
| 按量付费且 `payAsYouGo.showTimeWindows: false` | `🤖 Today:$0.15` |
| 带进度条（`statusBar.showSparkline`） | `🤖 5h:▰▰▰▱▱ 62% 7d:41%` |
| 含项目费用 | `🤖 5h:78% 7d:84% \| my-app:$3.21` |
| 缓存过期 | `🤖 5h:78% 7d:84% [10m ago]` |
| 未登录 | `🤖 Not logged in` |

悬停可查看包含完整令牌明细和重置时间的详细提示。

### 🧭 侧边栏概览 *(VS Code 原生)*

通过活动栏的专用图标打开原生树视图，查看速率限制窗口、令牌费用（5h / 今日 / 7d / 本月及月预算）、
按项目费用和快捷操作 — 无需打开仪表板即可查看关键数据。

### 🗂 仪表板面板

点击状态栏项可打开功能丰富的仪表板面板，包含：

- **当前用量** — 5 小时和 7 天窗口的彩色进度条
- **令牌费用** — 5 小时 / 今日 / 7 天 / 本月 / 月度（估算）费用；展开**令牌明细**可查看各类型（输入 / 输出 / 缓存读取 / 缓存创建）的令牌数、5 小时内按模型的费用及缓存命中率
- **项目费用** — 按工作区细分（今日 / 7 天 / 30 天）
- **预测** — 消耗速率（$/小时）、耗尽时间、日 / 周 / 月预算跟踪；**速率限制时间线图**可视化从当前到重置的 5h 利用率预测
- **定价与设置** — 始终显示当前令牌单价、提供商、API 状态和缓存 TTL；一键打开 VS Code 设置
- **使用历史** — GitHub 风格的每日热力图 + 每小时规律柱状图 + 星期 × 小时打卡图

面板原生支持 VS Code 的浅色、深色和高对比度主题。

<div align="center">
<img width="574" alt="仪表板截图" src="https://raw.githubusercontent.com/long-910/vscode-claude-status/main/docs/screenshots/dashboard.png" />
</div>

### 🗂 项目级费用追踪 *(VS Code 独有)*

自动将当前工作区文件夹映射到其 Claude Code 会话目录，显示**该特定项目**的消费金额（今日、本周、本月）。

完整支持多根工作区：每个文件夹在仪表板中拥有独立的费用明细，状态栏显示汇总值。

```
🤖 5h:78% 7d:84% | my-app:$3.21          ← 单工作区
🤖 5h:78% 7d:84% | PJ:$5.43              ← 多根汇总
```

### 🔮 用量预测与预算告警

基于最近 30 分钟的活动预测 5 小时速率限制耗尽时间，并提前发出警告。

- **消耗速率** — 当前消耗量（$/小时，滚动 30 分钟窗口）
- **耗尽时间** — 5 小时窗口满载的预计分钟数（上限为下次窗口重置时间）
- **安全指示器** — 剩余 > 30 分钟时显示"可安全启动繁重任务"
- **日预算** — 可设置 USD 上限；达到配置阈值（默认 80%）时触发进度条和告警
- **周预算** — 可选的每周 USD 上限（`claudeStatus.budget.weeklyUsd`）与进度条
- **月预算** — 可选的自然月 USD 上限（`claudeStatus.budget.monthlyUsd`），例如用于跟踪按量付费 Enterprise 的支出限额；“本月”累计也显示在侧边栏和提示中
- **VS Code 通知** — ≤30 分钟时非阻塞警告，≤10 分钟时带"打开仪表板"操作的错误对话框；预算告警每天 / 每月最多一次

通过**设置 → Claude Status** 或命令面板进行配置：

```
Claude Status: Set Budget...
```

### 📅 使用历史热力图

一目了然地了解长期使用规律。

- **每日热力图** — 最近 30 / 60 / 90 天的 GitHub Contributions 风格网格；绿色深浅反映每日消费；悬停单元格可查看准确日期和费用
- **每小时柱状图** — 每天各时段的平均费用（最近 30 天）；显示您最密集使用 Claude Code 的时间段
- **打卡图** — 星期 × 小时的费用矩阵（最近 30 天）；显示“周一上午”这类每周规律

显示天数可通过 `claudeStatus.heatmap.days`（30 / 60 / 90）配置。

---

## 系统要求

- **VS Code** 1.73 或更高版本
- **Claude Code** 至少有一个会话 — 令牌费用从
  `~/.claude/projects/**/*.jsonl`（或 `claudeStatus.claudeHome`）读取

---

## 支持的方案

方案会自动识别，无需额外登录。

| 方案 | 识别依据 | 状态栏 | 速率限制 API |
|---|---|---|---|
| Claude.ai Pro / Max、席位制 Team / Enterprise | `claude login` 凭证（`~/.claude/.credentials.json` 或 macOS 钥匙串） | `5h:45% 7d:32%` — 没有每周窗口的方案自动隐藏 7d | 仅在 Claude Code 运行时，最多每 5 分钟一次 |
| 按量付费的 Claude.ai 方案（如按量付费 Enterprise） | Claude Code 账户信息（`~/.claude.json` 中的 `billingType: "usage_based"`） | 仅费用 | 从不调用 |
| Anthropic API 密钥 | `ANTHROPIC_API_KEY` | 仅费用 | 从不调用 |
| AWS Bedrock | AWS 环境变量 | 仅费用 | 从不调用 |

按量付费方案可通过 `claudeStatus.payAsYouGo.showTimeWindows: false` 显示今日费用代替 5h / 7d，
并通过 `claudeStatus.budget.monthlyUsd` 跟踪支出限额。识别有误时请设置 `claudeStatus.claudeProvider`。
详情：[docs/PLANS.md](docs/PLANS.md)（英文）。

> 作者在 Claude.ai Pro 方案上开发和测试；其他方案为尽力支持。如有异常，请附上方案类型
> [提交 Issue](https://github.com/long-910/vscode-claude-status/issues)。

---

## 安装

### VS Code Marketplace

在扩展面板中搜索 **"Claude Status"**，或执行：

```bash
code --install-extension long-kudo.vscode-claude-status
```

### 从 VSIX 安装

1. 从 [Releases](https://github.com/long-910/vscode-claude-status/releases) 页面下载 `.vsix` 文件。
2. 在 VS Code 中：**扩展 (Ctrl+Shift+X)** → **⋯** → **从 VSIX 安装…**

### 从源码构建

```bash
git clone https://github.com/long-910/vscode-claude-status.git
cd vscode-claude-status
npm install
npm run package       # → vscode-claude-status-*.vsix
```

---

## 使用方法

扩展在 VS Code 启动时自动激活（`onStartupFinished`）。

| 操作 | 结果 |
|------|------|
| 查看状态栏 | 实时利用率 / 费用 |
| 点击状态栏 | 打开仪表板面板 |
| `Ctrl+Shift+Alt+C`（Mac 上为 `⌘⇧⌥C`） | 切换 `%` ↔ `$` 显示模式 |
| **Claude Status: Refresh Now** | 强制刷新 API |
| **Claude Status: Open Dashboard** | 打开仪表板面板 |
| **Claude Status: Toggle % / $ Display** | 切换显示模式 |
| **Claude Status: Set Budget…** | 设置或禁用每日 USD 预算 |
| **Claude Status: 导出使用历史…** | 将每日使用历史导出为 CSV 或 JSON |

---

## 配置

所有设置均位于 VS Code 设置的 `claudeStatus` 命名空间下。完整参考：
[docs/SETTINGS.md](docs/SETTINGS.md)（英文）。

### 显示

| 设置 | 默认值 | 说明 |
|------|--------|------|
| `claudeStatus.displayMode` | `"percent"` | 状态栏显示 `"percent"`（%）或 `"cost"`（$） |
| `claudeStatus.statusBar.alignment` | `"left"` | `"left"` 或 `"right"` |
| `claudeStatus.statusBar.showProjectCost` | `true` | 在状态栏显示当前项目费用 |
| `claudeStatus.statusBar.format` | `null` | 自定义标签，例如 `"${usage5h}% \| $${costDay}"`。占位符：`${usage5h}`, `${usage7d}`, `${bar5h}`, `${bar7d}`, `${cost5h}`, `${cost7d}`, `${costDay}`, `${costMonth}` |
| `claudeStatus.statusBar.showSparkline` | `false` | 在百分比旁显示紧凑的 5h 进度条（▰▰▰▱▱） |
| `claudeStatus.payAsYouGo.showTimeWindows` | `true` | 按量付费方案设为 `false` 时显示今日费用代替 5h / 7d（不影响订阅） |
| `claudeStatus.heatmap.days` | `90` | 使用历史热力图天数（30 / 60 / 90） |

### 方案、数据源与 API

| 设置 | 默认值 | 说明 |
|------|--------|------|
| `claudeStatus.claudeProvider` | `"auto"` | `"auto"`、`"claude-ai"`、`"claude-ai-usage"`（按量付费的 Claude.ai 方案）、`"aws-bedrock"`、`"api-key"` |
| `claudeStatus.claudeHome` | `".claude"` | Claude Code 数据目录（相对主目录；支持绝对路径和 `~`）。仅用户设置 |
| `claudeStatus.credentials.path` | `null` | 自定义凭证文件路径。仅用户设置 |
| `claudeStatus.rateLimitApi.enabled` | `true` | 获取速率限制 %（订阅）。关闭后不调用 API，继续显示上次缓存的 % 并附 `[Xm ago]` |
| `claudeStatus.cache.ttlSeconds` | `300` | 速率限制缓存 TTL（60–3600 秒） |
| `claudeStatus.realtime.enabled` | `false` | 尚未实现 — 无任何效果 |

### 预算与通知

| 设置 | 默认值 | 说明 |
|------|--------|------|
| `claudeStatus.budget.dailyUsd` | `null` | 每日预算（USD，`null` = 关闭） |
| `claudeStatus.budget.weeklyUsd` | `null` | 最近 7 天的预算（仪表板进度条） |
| `claudeStatus.budget.monthlyUsd` | `null` | 自然月预算，例如 Enterprise 的支出限额 |
| `claudeStatus.budget.alertThresholdPercent` | `80` | 达到每日 / 每月预算的此百分比时提醒 |
| `claudeStatus.notifications.budgetWarning` | `true` | 预算通知（每天 / 每月最多一次） |
| `claudeStatus.notifications.rateLimitWarning` | `true` | 5h 限额即将用尽前提醒（订阅） |
| `claudeStatus.notifications.rateLimitWarningThresholdMinutes` | `30` | 提前多少分钟提醒（5–120） |

### 定价

| 设置 | 默认值 | 说明 |
|------|--------|------|
| `claudeStatus.pricing.useModelPricing` | `true` | 按模型使用内置费率计价 |
| `claudeStatus.pricing.modelOverrides` | `{}` | 按模型的准确费率，例如 `{ "claude-opus-6": { "inputPerMillion": 4, "outputPerMillion": 20 } }` |
| `claudeStatus.pricing.inputPerMillion` | `3.00` | 手动费率（USD / 百万令牌），用于无法识别的模型，或关闭按模型计价时的全部记录 |
| `claudeStatus.pricing.outputPerMillion` | `15.00` | 〃 |
| `claudeStatus.pricing.cacheReadPerMillion` | `0.30` | 〃 |
| `claudeStatus.pricing.cacheCreatePerMillion` | `3.75` | 〃 |

```jsonc
// 示例：每月支出限额 $400 的按量付费 Enterprise
{
  "claudeStatus.payAsYouGo.showTimeWindows": false,   // 显示 🤖 Today:$3.21 代替 5h / 7d
  "claudeStatus.budget.monthlyUsd": 400,
  "claudeStatus.budget.dailyUsd": 30
}

// 示例：Claude.ai 订阅，显示费用，不对外调用 API
{
  "claudeStatus.displayMode": "cost",
  "claudeStatus.rateLimitApi.enabled": false
}
```

---

## 路线图

| 功能 | 状态 |
|------|------|
| 状态栏、仪表板、项目费用、预测与预算告警、热力图 | ✅ v0.1.0 – v0.3.0 |
| 速率限制时间线、令牌明细、周预算、定价与设置卡片 | ✅ v0.4.0 |
| i18n — 英语 / 日语 / 中文 | ✅ v0.4.1 |
| macOS 钥匙串凭证回退（Claude Code v2.x+） | ✅ v0.6.0 |
| 可配置数据目录、OOM 修复（增量读取） | ✅ v0.7.0 |
| 按模型计价（已与官方价格表核对）、按模型费用明细、费率覆盖设置 | ✅ Unreleased |
| 按量付费 Enterprise 支持、按量付费视图、月预算 | ✅ Unreleased |
| 侧边栏树视图、状态栏进度条、使用数据导出（CSV / JSON）、打卡图 | ✅ Unreleased |

---

## 文档

规格说明、各方案的行为、定价以及完整的设置参考位于 [docs/](docs/README.md)（英文）。

---

## 相关项目

- [claude-tmux-status](https://github.com/long-910/claude-tmux-status) — tmux 状态栏版本（同一作者，Python）
- [vscode-view-charset](https://github.com/long-910/vscode-view-charset) — 文件编码查看器（同一作者）

---

## 贡献

欢迎贡献代码。请参阅 [CONTRIBUTING.md](CONTRIBUTING.md) 了解设置说明、架构概述和发布流程。

---

## 贡献者

感谢所有为本项目做出贡献的人！

[![Contributors](https://contrib.rocks/image?repo=long-910/vscode-claude-status&exclude=dependabot%5Bbot%5D)](https://github.com/long-910/vscode-claude-status/graphs/contributors)

---

## 许可证

[MIT](LICENSE) — © 2026 long-910
