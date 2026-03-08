# vscode-claude-status

> Claude Code のトークン使用量とコスト — VS Code のステータスバーに常時表示。

<div align="center">

[![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/long-kudo.vscode-claude-status?style=flat-square&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=long-kudo.vscode-claude-status)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/long-kudo.vscode-claude-status?style=flat-square&logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=long-kudo.vscode-claude-status)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/long-kudo.vscode-claude-status?style=flat-square&logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=long-kudo.vscode-claude-status)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.109.0-007ACC?style=flat-square)](https://code.visualstudio.com/)

[![License: MIT](https://img.shields.io/github/license/long-910/vscode-claude-status?style=flat-square)](LICENSE)
[![CI](https://github.com/long-910/vscode-claude-status/actions/workflows/ci.yml/badge.svg)](https://github.com/long-910/vscode-claude-status/actions/workflows/ci.yml)
[![Release](https://github.com/long-910/vscode-claude-status/actions/workflows/release.yml/badge.svg)](https://github.com/long-910/vscode-claude-status/actions/workflows/release.yml)
[![Sponsor](https://img.shields.io/badge/Sponsor-GitHub-pink?logo=github)](https://github.com/sponsors/long-910)

🌐 [English](README.md) | [日本語](README.ja.md)

</div>

## 概要

**vscode-claude-status** は、エディタを離れることなく [Claude Code](https://claude.ai/code) の使用状況をリアルタイムで監視できる Visual Studio Code 拡張機能です。

`~/.claude/projects/` からローカルでセッションデータを読み取り、レート制限の使用率ヘッダーを取得するために最大5分に1回だけ Anthropic API に問い合わせます。トークンコストはすべて設定可能なレートを使用してクライアント側で計算されます（デフォルト: Claude Sonnet 4.x 料金）。

> [!NOTE]
> **APIコールは微量かつ Claude Code の使用中のみ発生します。**
> レート制限取得のAPIコールは JSONL が最近更新されたとき（= Claude Code 使用中）にのみ発火します。
> Claude Code を使っていない間はAPIコールは一切行われません。
> 1回あたり約9トークン（`claude-haiku-4-5`）、≈ $0.00013。
> デフォルト設定での月間目安コスト：**$0.01 未満**。
> `claudeStatus.rateLimitApi.enabled: false` で新規APIコールを停止できます。
> キャッシュが存在する場合は最終取得時の利用率 % が `[Xm ago]` 付きで表示され続けます。
> キャッシュがない場合はコスト表示のみにフォールバックします。

> [!WARNING]
> **コスト表示は概算です。** デフォルトのレートは実装時点の Anthropic 公開料金をもとにしており、
> 料金変更を即座に反映しない可能性があります。
> 料金が変更された場合は `claudeStatus.pricing.*` 設定を更新してください。
> 最新の料金は [Anthropic 料金ページ](https://www.anthropic.com/pricing) でご確認ください。

---

## 機能

### 📊 ステータスバー — 常時表示

VS Code ステータスバーにピン留めされたリアルタイム使用状況サマリー。

| 状態 | 表示例 |
|------|--------|
| 通常（%モード、Claude.ai Max） | `🤖 5h:45% 7d:62%` |
| 警告 ≥75% | `🤖 5h:78%⚠ 7d:84%⚠` |
| レート制限到達 | `🤖 5h:100%✗` |
| 5時間のみのプラン（7dウィンドウなし） | `🤖 5h:45%` |
| コストモード | `🤖 5h:$14.21 7d:$53.17` |
| AWS Bedrock / APIキー（コストのみ） | `🤖 5h:$0.15 7d:$0.42` |
| プロジェクトコスト付き | `🤖 5h:78% 7d:84% \| my-app:$3.21` |
| キャッシュ古い | `🤖 5h:78% 7d:84% [10m ago]` |
| 未ログイン | `🤖 Not logged in` |

ホバーすると、完全なトークン内訳とリセット時間を含む詳細なツールチップが表示されます。

### 🗂 ダッシュボードパネル

ステータスバーアイテムをクリックすると、以下を含むリッチなダッシュボードパネルが開きます：

- **現在の使用量** — 5時間・7日間ウィンドウのカラーコード付きプログレスバー
- **トークンコスト** — ローカルJSONLデータから計算された5時間・今日・7日間のコスト
- **プロジェクトコスト** — ワークスペース別内訳（今日・7日間・30日間）
- **予測** — 消費率（$/時間）、枯渇までの時間、日次予算追跡
- **使用履歴** — GitHubスタイルの日次ヒートマップ＋時間帯別パターンバーチャート

パネルはVS Codeのライト・ダーク・ハイコントラストテーマをネイティブにサポートします。

### 🗂 プロジェクトレベルのコスト追跡 *(VS Code専用)*

開いているワークスペースフォルダーをClaude Codeのセッションディレクトリに自動でマッピングし、**その特定のプロジェクトに費やした金額**（今日・今週・今月）を表示します。

マルチルートワークスペースも完全サポート：各フォルダーがダッシュボードに独自の内訳を持ち、ステータスバーには集計が表示されます。

```
🤖 5h:78% 7d:84% | my-app:$3.21          ← 単一ワークスペース
🤖 5h:78% 7d:84% | PJ:$5.43              ← マルチルート集計
```

### 🔮 使用量予測 & 予算アラート

直近30分のアクティビティをもとに、5時間レート制限が枯渇するまでの時間を予測し、事前に警告します。

- **消費率** — 現在の使用量（$/時間、ローリング30分ウィンドウ）
- **枯渇までの時間** — 5時間ウィンドウが満杯になるまでの推定分数（次のウィンドウリセット時刻でキャップ）
- **安全性インジケーター** — 30分以上余裕がある場合は「重いタスクを開始しても安全」と表示
- **日次予算** — 任意のUSD上限を設定可能；設定した閾値（デフォルト80%）に達するとプログレスバーとアラートが表示
- **VS Code通知** — ≤30分でノンブロッキング警告、≤10分で「ダッシュボードを開く」アクション付きエラーダイアログ；予算アラートはウィンドウにつき1回

**設定 → Claude Status** またはコマンドパレットから設定可能：

```
Claude Status: Set Budget...
```

### 📅 使用履歴ヒートマップ

長期的な使用パターンを一目で把握。

- **日次ヒートマップ** — 直近30/60/90日間のGitHub Contributionsスタイルのグリッド；日々の支出を緑の濃淡で表示；セルをホバーすると正確な日付とコストを確認可能
- **時間帯別バーチャート** — 時間帯ごとの平均コスト（直近30日間）；いつClaude Codeを最も多く使用しているかを把握

表示日数は `claudeStatus.heatmap.days`（30/60/90）で設定可能。

---

## 必要条件

- **VS Code** 1.109以降
- **Claude Code CLI** とアクティブなセッション — 拡張機能は
  `~/.claude/projects/**/*.jsonl` からトークンコストデータを読み取ります

**認証はプロバイダーによって任意です：**

| プロバイダー | 認証方法 | 表示内容 |
|-------------|---------|---------|
| Claude.ai サブスクリプション | `claude login`（`~/.claude/.credentials.json` が作成される） | レート制限 % + コスト |
| AWS Bedrock | AWS認証情報（環境変数または `~/.aws/`） | コストのみ |
| Anthropic APIキー | `ANTHROPIC_API_KEY` 環境変数 | コストのみ |

---

## プラン互換性

> **注意：** この拡張機能は、作者が **Claude.ai Pro プラン**（5時間・7日間の両レート制限ウィンドウを持つ）で開発・テストしています。
>
> AWS Bedrock、直接APIキー、Claude.ai Free、5時間ウィンドウのみのプランなど、その他のプランやプロバイダーは自動検出によるベストエフォートでサポートされています。お使いのプランで予期しない動作が発生した場合は、[Issueを開いて](https://github.com/long-910/vscode-claude-status/issues)プランの種類をお知らせください。迅速に対応します。

**プランタイプ別の動作：**

| プラン | レート制限表示 | 7dウィンドウ |
|--------|-------------|------------|
| Claude.ai Pro / Max（5h + 7d） | `5h:45% 7d:32%` | ✅ |
| Claude.ai Pro / 5hのみのプラン | `5h:45%` | 自動非表示 |
| AWS Bedrock | コストのみ（`5h:$0.15 7d:$0.42`） | N/A |
| Anthropic APIキー | コストのみ | N/A |

自動検出がうまく機能しない場合は、VS Code設定で `claudeStatus.claudeProvider` を明示的に設定してください。

---

## インストール

### VS Code Marketplace

拡張機能パネルで **「Claude Status」** を検索するか：

```bash
code --install-extension long-kudo.vscode-claude-status
```

### VSIXからインストール

1. [Releases](https://github.com/long-910/vscode-claude-status/releases) ページから `.vsix` をダウンロード。
2. VS Codeで: **拡張機能 (Ctrl+Shift+X)** → **⋯** → **VSIXからインストール…**

### ソースからビルド

```bash
git clone https://github.com/long-910/vscode-claude-status.git
cd vscode-claude-status
npm install
npm run package       # → vscode-claude-status-*.vsix
```

---

## 使い方

拡張機能はVS Codeの起動時に自動的に有効化されます（`onStartupFinished`）。

| アクション | 結果 |
|-----------|------|
| ステータスバーを確認 | ライブ使用率・コスト |
| ステータスバーをクリック | ダッシュボードパネルを開く |
| `Ctrl+Shift+Alt+C`（Macでは`⌘⇧⌥C`） | `%` ↔ `$` 表示モードの切り替え |
| **Claude Status: Refresh Now** | APIを強制的に更新 |
| **Claude Status: Open Dashboard** | ダッシュボードパネルを開く |
| **Claude Status: Toggle % / $ Display** | 表示モードの切り替え |
| **Claude Status: Set Budget…** | 日次USD予算を設定または無効化 |

---

## 設定

すべての設定はVS Code設定の `claudeStatus` 名前空間にあります。

| 設定 | 型 | デフォルト | 説明 |
|------|-----|---------|------|
| `claudeStatus.displayMode` | `"percent"` \| `"cost"` | `"percent"` | ステータスバー表示モード |
| `claudeStatus.statusBar.alignment` | `"left"` \| `"right"` | `"left"` | ステータスバーの位置 |
| `claudeStatus.statusBar.showProjectCost` | `boolean` | `true` | ステータスバーにプロジェクトコストを表示 |
| `claudeStatus.cache.ttlSeconds` | `number` (60–3600) | `300` | APIキャッシュTTL（秒） |
| `claudeStatus.rateLimitApi.enabled` | `boolean` | `true` | レート制限%をAnthropicAPIから取得。`false` で新規APIコール停止。キャッシュがあれば `[Xm ago]` 付きで % を継続表示 |
| `claudeStatus.realtime.enabled` | `boolean` | `false` | TTL秒ごとにAPIをポーリング（`rateLimitApi.enabled` が必要） |
| `claudeStatus.budget.dailyUsd` | `number \| null` | `null` | 日次予算（USD）（`null` = 無効） |
| `claudeStatus.budget.weeklyUsd` | `number \| null` | `null` | 週次予算（USD） |
| `claudeStatus.budget.alertThresholdPercent` | `number` (1–100) | `80` | 予算アラート閾値（%） |
| `claudeStatus.notifications.rateLimitWarning` | `boolean` | `true` | レート制限が近い時に警告 |
| `claudeStatus.notifications.rateLimitWarningThresholdMinutes` | `number` (5–120) | `30` | 制限の何分前に警告を表示 |
| `claudeStatus.notifications.budgetWarning` | `boolean` | `true` | 予算閾値超過時に警告 |
| `claudeStatus.heatmap.days` | `30 \| 60 \| 90` | `90` | 使用ヒートマップに表示する日数 |
| `claudeStatus.credentials.path` | `string \| null` | `null` | カスタム認証情報ファイルパス |
| `claudeStatus.claudeProvider` | `"auto"` \| `"claude-ai"` \| `"aws-bedrock"` \| `"api-key"` | `"auto"` | プロバイダータイプ（自動検出または明示的指定） |
| `claudeStatus.pricing.inputPerMillion` | `number` | `3.00` | 入力トークン 1M あたりの USD 単価 |
| `claudeStatus.pricing.outputPerMillion` | `number` | `15.00` | 出力トークン 1M あたりの USD 単価 |
| `claudeStatus.pricing.cacheReadPerMillion` | `number` | `0.30` | キャッシュ読み取りトークン 1M あたりの USD 単価 |
| `claudeStatus.pricing.cacheCreatePerMillion` | `number` | `3.75` | キャッシュ作成トークン 1M あたりの USD 単価 |

```jsonc
// 設定例: settings.json
{
  "claudeStatus.displayMode": "cost",
  "claudeStatus.cache.ttlSeconds": 120,
  "claudeStatus.budget.dailyUsd": 5.00,
  "claudeStatus.budget.alertThresholdPercent": 80,
  "claudeStatus.statusBar.showProjectCost": true,
  // AWS Bedrockユーザー — OAuth検出をスキップし、コストのみ表示：
  "claudeStatus.claudeProvider": "aws-bedrock",
  // 新規レート制限APIコールを停止（キャッシュがあれば % を staleness 表示継続）：
  // "claudeStatus.rateLimitApi.enabled": false,
  // Anthropicが料金を変更した場合は以下を更新してください：
  "claudeStatus.pricing.inputPerMillion": 3.00,
  "claudeStatus.pricing.outputPerMillion": 15.00,
  "claudeStatus.pricing.cacheReadPerMillion": 0.30,
  "claudeStatus.pricing.cacheCreatePerMillion": 3.75
}
```

---

## ロードマップ

| 機能 | 状態 |
|------|------|
| データ層（JSONLリーダー、APIクライアント、キャッシュ） | ✅ v0.1.0 |
| %/$表示のステータスバー | ✅ v0.1.0 |
| WebViewダッシュボードスケルトン | ✅ v0.1.0 |
| プロジェクトレベルのコスト追跡 | ✅ v0.1.0 |
| 使用量予測 & 予算アラート | ✅ v0.2.0 |
| セッション履歴ヒートマップ | ✅ v0.3.0 |
| VS Code Marketplace公開 | ✅ v0.3.0 |

---

## 関連プロジェクト

- [claude-tmux-status](https://github.com/long-910/claude-tmux-status) — tmuxステータスバー版（同一作者、Python）
- [vscode-view-charset](https://github.com/long-910/vscode-view-charset) — ファイルエンコーディングビューア（同一作者）

---

## コントリビュート

コントリビューションを歓迎します。セットアップ手順・アーキテクチャ・リリース手順については [CONTRIBUTING.md](CONTRIBUTING.md) をご覧ください。

---

## ライセンス

[MIT](LICENSE) — © 2026 long-910
