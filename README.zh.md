# vscode-claude-status

> Claude Code 的令牌用量与费用 — 始终显示在 VS Code 状态栏中。

<div align="center">

[![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/long-kudo.vscode-claude-status?style=flat-square&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=long-kudo.vscode-claude-status)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/long-kudo.vscode-claude-status?style=flat-square&logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=long-kudo.vscode-claude-status)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/long-kudo.vscode-claude-status?style=flat-square&logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=long-kudo.vscode-claude-status)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.109.0-007ACC?style=flat-square)](https://code.visualstudio.com/)

[![License: MIT](https://img.shields.io/github/license/long-910/vscode-claude-status?style=flat-square)](LICENSE)
[![CI](https://github.com/long-910/vscode-claude-status/actions/workflows/ci.yml/badge.svg)](https://github.com/long-910/vscode-claude-status/actions/workflows/ci.yml)
[![Release](https://github.com/long-910/vscode-claude-status/actions/workflows/release.yml/badge.svg)](https://github.com/long-910/vscode-claude-status/actions/workflows/release.yml)
[![Sponsor](https://img.shields.io/badge/Sponsor-GitHub-pink?logo=github)](https://github.com/sponsors/long-910)

🌐 [English](README.md) | [日本語](README.ja.md) | [中文](README.zh.md)

</div>

## 概述

**vscode-claude-status** 是一款 Visual Studio Code 扩展，让您无需离开编辑器即可实时监控 [Claude Code](https://claude.ai/code) 的使用情况。

扩展从 `~/.claude/projects/` 本地读取会话数据，最多每 5 分钟调用一次 Anthropic API 获取速率限制头信息。所有令牌费用均使用可配置的单价在客户端计算（默认：Claude Sonnet 4.x 定价）。

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
> **费用数据为估算值。** 默认单价基于实现时 Anthropic 的公开定价，可能不反映最新变化。
> 如定价有变，请更新 `claudeStatus.pricing.*` 设置以匹配
> [Anthropic 定价页面](https://www.anthropic.com/pricing) 的最新费率。

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
| AWS Bedrock / API 密钥（仅费用） | `🤖 5h:$0.15 7d:$0.42` |
| 含项目费用 | `🤖 5h:78% 7d:84% \| my-app:$3.21` |
| 缓存过期 | `🤖 5h:78% 7d:84% [10m ago]` |
| 未登录 | `🤖 Not logged in` |

悬停可查看包含完整令牌明细和重置时间的详细提示。

### 🗂 仪表板面板

点击状态栏项可打开功能丰富的仪表板面板，包含：

- **当前用量** — 5 小时和 7 天窗口的彩色进度条
- **令牌费用** — 5 小时 / 今日 / 7 天 / 月度（估算）费用；展开**令牌明细**可查看各类型（输入 / 输出 / 缓存读取 / 缓存创建）的令牌数、费用及缓存命中率
- **项目费用** — 按工作区细分（今日 / 7 天 / 30 天）
- **预测** — 消耗速率（$/小时）、耗尽时间、日 / 周预算跟踪；**速率限制时间线图**可视化从当前到重置的 5h 利用率预测
- **定价与设置** — 始终显示当前令牌单价、提供商、API 状态和缓存 TTL；一键打开 VS Code 设置
- **使用历史** — GitHub 风格的每日热力图 + 每小时规律柱状图

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
- **VS Code 通知** — ≤30 分钟时非阻塞警告，≤10 分钟时带"打开仪表板"操作的错误对话框；预算告警每个窗口触发一次

通过**设置 → Claude Status** 或命令面板进行配置：

```
Claude Status: Set Budget...
```

### 📅 使用历史热力图

一目了然地了解长期使用规律。

- **每日热力图** — 最近 30 / 60 / 90 天的 GitHub Contributions 风格网格；绿色深浅反映每日消费；悬停单元格可查看准确日期和费用
- **每小时柱状图** — 每天各时段的平均费用（最近 30 天）；显示您最密集使用 Claude Code 的时间段

显示天数可通过 `claudeStatus.heatmap.days`（30 / 60 / 90）配置。

---

## 系统要求

- **VS Code** 1.109 或更高版本
- **Claude Code CLI** 且有活跃会话 — 扩展从 `~/.claude/projects/**/*.jsonl` 读取令牌费用数据

**认证方式取决于提供商（可选）：**

| 提供商 | 认证方式 | 显示内容 |
|--------|---------|---------|
| Claude.ai 订阅 | `claude login`（生成 `~/.claude/.credentials.json`） | 速率限制 % + 费用 |
| AWS Bedrock | AWS 凭证（环境变量或 `~/.aws/`） | 仅费用 |
| Anthropic API 密钥 | `ANTHROPIC_API_KEY` 环境变量 | 仅费用 |

---

## 套餐兼容性

> **注意：** 本扩展由作者在 **Claude.ai Pro 套餐**（同时提供 5 小时和 7 天速率限制窗口）上开发和测试。
>
> AWS Bedrock、直接 API 密钥、Claude.ai Free 及仅有 5 小时窗口的套餐等其他套餐和提供商，通过自动检测以尽力支持的方式提供。如在您的套餐上遇到意外行为，请[提交 Issue](https://github.com/long-910/vscode-claude-status/issues) 并注明套餐类型，我们会及时跟进处理。

**各套餐类型的行为：**

| 套餐 | 速率限制显示 | 7d 窗口 |
|------|------------|--------|
| Claude.ai Pro / Max（5h + 7d） | `5h:45% 7d:32%` | ✅ |
| Claude.ai Pro / 仅 5h 套餐 | `5h:45%` | 自动隐藏 |
| AWS Bedrock | 仅费用（`5h:$0.15 7d:$0.42`） | N/A |
| Anthropic API 密钥 | 仅费用 | N/A |

如果自动检测无法正常工作，请在 VS Code 设置中显式设置 `claudeStatus.claudeProvider`。

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

---

## 配置

所有设置均在 VS Code 设置的 `claudeStatus` 命名空间下。

| 设置 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `claudeStatus.displayMode` | `"percent"` \| `"cost"` | `"percent"` | 状态栏显示模式 |
| `claudeStatus.statusBar.alignment` | `"left"` \| `"right"` | `"left"` | 状态栏位置 |
| `claudeStatus.statusBar.showProjectCost` | `boolean` | `true` | 在状态栏显示项目费用 |
| `claudeStatus.cache.ttlSeconds` | `number` (60–3600) | `300` | API 缓存 TTL（秒） |
| `claudeStatus.rateLimitApi.enabled` | `boolean` | `true` | 从 Anthropic API 获取速率限制 %。禁用时停止新的 API 调用；若有缓存，仍以 `[Xm ago]` 显示 % |
| `claudeStatus.realtime.enabled` | `boolean` | `false` | 每隔 TTL 秒轮询速率限制 API（需启用 `rateLimitApi.enabled`） |
| `claudeStatus.budget.dailyUsd` | `number \| null` | `null` | 每日预算（USD）（`null` = 禁用） |
| `claudeStatus.budget.weeklyUsd` | `number \| null` | `null` | 每周预算（USD） |
| `claudeStatus.budget.alertThresholdPercent` | `number` (1–100) | `80` | 预算告警阈值（%） |
| `claudeStatus.notifications.rateLimitWarning` | `boolean` | `true` | 速率限制临近时发出警告 |
| `claudeStatus.notifications.rateLimitWarningThresholdMinutes` | `number` (5–120) | `30` | 限制前多少分钟发出警告 |
| `claudeStatus.notifications.budgetWarning` | `boolean` | `true` | 超过预算阈值时发出警告 |
| `claudeStatus.heatmap.days` | `30 \| 60 \| 90` | `90` | 使用热力图显示的天数 |
| `claudeStatus.credentials.path` | `string \| null` | `null` | 自定义凭证文件路径 |
| `claudeStatus.claudeProvider` | `"auto"` \| `"claude-ai"` \| `"aws-bedrock"` \| `"api-key"` | `"auto"` | 提供商类型（自动检测或显式指定） |
| `claudeStatus.pricing.inputPerMillion` | `number` | `3.00` | 每百万输入令牌的 USD 单价 |
| `claudeStatus.pricing.outputPerMillion` | `number` | `15.00` | 每百万输出令牌的 USD 单价 |
| `claudeStatus.pricing.cacheReadPerMillion` | `number` | `0.30` | 每百万缓存读取令牌的 USD 单价 |
| `claudeStatus.pricing.cacheCreatePerMillion` | `number` | `3.75` | 每百万缓存创建令牌的 USD 单价 |

```jsonc
// 示例: settings.json
{
  "claudeStatus.displayMode": "cost",
  "claudeStatus.cache.ttlSeconds": 120,
  "claudeStatus.budget.dailyUsd": 5.00,
  "claudeStatus.budget.alertThresholdPercent": 80,
  "claudeStatus.statusBar.showProjectCost": true,
  // AWS Bedrock 用户 — 跳过 OAuth 检测，仅显示费用：
  "claudeStatus.claudeProvider": "aws-bedrock",
  // 禁用新的速率限制 API 调用（有缓存时仍显示带过期提示的 %）：
  // "claudeStatus.rateLimitApi.enabled": false,
  // 如 Anthropic 调整定价，请更新以下值：
  "claudeStatus.pricing.inputPerMillion": 3.00,
  "claudeStatus.pricing.outputPerMillion": 15.00,
  "claudeStatus.pricing.cacheReadPerMillion": 0.30,
  "claudeStatus.pricing.cacheCreatePerMillion": 3.75
}
```

---

## 路线图

| 功能 | 状态 |
|------|------|
| 数据层（JSONL 读取器、API 客户端、缓存） | ✅ v0.1.0 |
| 状态栏 % / $ 显示 | ✅ v0.1.0 |
| WebView 仪表板框架 | ✅ v0.1.0 |
| 项目级费用追踪 | ✅ v0.1.0 |
| 用量预测与预算告警 | ✅ v0.2.0 |
| 会话历史热力图 | ✅ v0.3.0 |
| VS Code Marketplace 发布 | ✅ v0.3.0 |
| 速率限制时间线图 | ✅ v0.4.0 |
| 令牌明细与缓存效率 | ✅ v0.4.0 |
| 月度费用预测 | ✅ v0.4.0 |
| 每周预算进度条 | ✅ v0.4.0 |
| 仪表板内定价与设置卡片 | ✅ v0.4.0 |
| i18n — 英语 / 日语 / 中文 | ✅ v0.4.1 |

---

## 相关项目

- [claude-tmux-status](https://github.com/long-910/claude-tmux-status) — tmux 状态栏版本（同一作者，Python）
- [vscode-view-charset](https://github.com/long-910/vscode-view-charset) — 文件编码查看器（同一作者）

---

## 贡献

欢迎贡献代码。请参阅 [CONTRIBUTING.md](CONTRIBUTING.md) 了解设置说明、架构概述和发布流程。

---

## 许可证

[MIT](LICENSE) — © 2026 long-910
