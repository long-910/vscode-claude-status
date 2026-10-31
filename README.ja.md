# vscode-claude-status

> Claude Code のトークン使用量とコスト — VS Code のステータスバーに常時表示。

![vscode-claude-status social preview](https://repository-images.githubusercontent.com/1165729413/1dc1fbe5-b0d9-45f9-9b5b-c5ad06e36d10)

<div align="center">

[![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/long-kudo.vscode-claude-status?style=flat-square&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=long-kudo.vscode-claude-status)
[![Open VSX](https://img.shields.io/open-vsx/v/long-kudo/vscode-claude-status?style=flat-square&label=Open%20VSX)](https://open-vsx.org/extension/long-kudo/vscode-claude-status)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/long-kudo.vscode-claude-status?style=flat-square&logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=long-kudo.vscode-claude-status)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/long-kudo.vscode-claude-status?style=flat-square&logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=long-kudo.vscode-claude-status)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.82.0-007ACC?style=flat-square)](https://code.visualstudio.com/)

[![License: MIT](https://img.shields.io/github/license/long-910/vscode-claude-status?style=flat-square)](LICENSE)
[![CI](https://github.com/long-910/vscode-claude-status/actions/workflows/ci.yml/badge.svg)](https://github.com/long-910/vscode-claude-status/actions/workflows/ci.yml)
[![Release](https://github.com/long-910/vscode-claude-status/actions/workflows/release.yml/badge.svg)](https://github.com/long-910/vscode-claude-status/actions/workflows/release.yml)
[![Sponsor](https://img.shields.io/badge/Sponsor-GitHub-pink?logo=github)](https://github.com/sponsors/long-910)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-Support-FF5E5B?logo=ko-fi&logoColor=white)](https://ko-fi.com/long910)

🌐 [English](README.md) | [日本語](README.ja.md) | [中文](README.zh.md)

</div>

## 概要

**vscode-claude-status** は、エディタを離れることなく [Claude Code](https://claude.ai/code) の使用状況をリアルタイムで監視できる Visual Studio Code 拡張機能です。

`~/.claude/projects/` からローカルでセッションデータを読み取り、レート制限の使用率ヘッダーを取得するために最大5分に1回だけ Anthropic API に問い合わせます。トークンコストはすべてクライアント側で計算され、モデル（Opus・Sonnet・Haiku・Fable など）ごとの組み込み単価を使用します。組み込みの単価表より新しいモデルは同じファミリーの最新単価で概算され、`claudeStatus.pricing.modelOverrides` で正確な単価を設定できます。

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
> **コスト表示は概算です。** ローカルのトランスクリプトから、Anthropic の API 定価（2026-10-31 確認）で計算しています。
> 個別契約の割引・シート料金・パートナー（Bedrock / Vertex）の料金は含みません。
> 新しいモデルや価格改定には `claudeStatus.pricing.modelOverrides` で対応できます — [docs/PRICING.md](docs/PRICING.md) 参照。

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
| 従量課金（APIキー・Bedrock・従量課金のエンタープライズ） | `🤖 5h:$0.15 7d:$0.42` |
| 従量課金で `payAsYouGo.showTimeWindows: false` | `🤖 Today:$0.15` |
| メーター付き（`statusBar.showSparkline`） | `🤖 5h:▰▰▰▱▱ 62% 7d:41%` |
| プロジェクトコスト付き | `🤖 5h:78% 7d:84% \| my-app:$3.21` |
| キャッシュ古い | `🤖 5h:78% 7d:84% [10m ago]` |
| 未ログイン | `🤖 Not logged in` |

ホバーすると、完全なトークン内訳とリセット時間を含む詳細なツールチップが表示されます。

### 🧭 サイドバー概要 *(VS Code ネイティブ)*

アクティビティバーの専用アイコンから、レート制限ウィンドウ・トークンコスト（5h / 今日 / 7d / 今月と月次予算）・
プロジェクト別コスト・クイックアクションをネイティブのツリービューで確認できます。
ダッシュボードを開かなくても主要な数値が見られます。

### 🗂 ダッシュボードパネル

ステータスバーアイテムをクリックすると、以下を含むリッチなダッシュボードパネルが開きます：

- **現在の使用量** — 5時間・7日間ウィンドウのカラーコード付きプログレスバー
- **トークンコスト** — 5時間・今日・7日間・今月・月次推計コスト。▶ トグルで**トークン内訳**を展開すると、
  Input / Output / Cache read / Cache create 別のトークン数・5時間のモデル別コスト・キャッシュヒット率を表示
- **プロジェクトコスト** — ワークスペース別内訳（今日・7日間・30日間）
- **予測** — 消費率（$/時間）、日次・週次・月次予算追跡。**レート制限タイムラインチャート**で
  現在から次回リセットまでの5h利用率予測をグラフ表示
- **料金 & 設定** — 現在のトークン単価・プロバイダー・API状態・キャッシュTTLを常時表示。
  ワンクリックでVS Code設定を開くリンク付き
- **使用履歴** — GitHubスタイルの日次ヒートマップ＋時間帯別パターンバーチャート＋曜日 × 時間帯のパンチカード

パネルはVS Codeのライト・ダーク・ハイコントラストテーマをネイティブにサポートします。

<div align="center">
<img width="574" alt="ダッシュボード スクリーンショット" src="https://raw.githubusercontent.com/long-910/vscode-claude-status/main/docs/screenshots/dashboard.png" />
</div>

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
- **週次予算** — 任意のUSD週次上限（`claudeStatus.budget.weeklyUsd`）とプログレスバー
- **月次予算** — 暦月単位の任意のUSD上限（`claudeStatus.budget.monthlyUsd`）。従量課金のエンタープライズの利用上限（spend limit）の管理などに。「今月」の累計はサイドバーとツールチップにも表示
- **VS Code通知** — ≤30分でノンブロッキング警告、≤10分で「ダッシュボードを開く」アクション付きエラーダイアログ；予算アラートは1日 / 1か月に最大1回

**設定 → Claude Status** またはコマンドパレットから設定可能：

```
Claude Status: Set Budget...
```

### 📅 使用履歴ヒートマップ

長期的な使用パターンを一目で把握。

- **日次ヒートマップ** — 直近30/60/90日間のGitHub Contributionsスタイルのグリッド；日々の支出を緑の濃淡で表示；セルをホバーすると正確な日付とコストを確認可能
- **時間帯別バーチャート** — 時間帯ごとの平均コスト（直近30日間）；いつClaude Codeを最も多く使用しているかを把握
- **パンチカード** — 曜日 × 時間帯のコストマトリクス（直近30日間）；「月曜の午前」のような週次パターンを把握

表示日数は `claudeStatus.heatmap.days`（30/60/90）で設定可能。

---

## 必要条件

- **VS Code** 1.82 以降

> [!IMPORTANT]
> **対応する VS Code の最低バージョンを 1.73 から 1.82 に引き上げました。** レート制限の %
> （Claude.ai サブスクリプション）は global の `fetch` API で取得していますが、拡張機能ホストで
> これが使えるのは VS Code 1.82（Electron 25 / Node.js 18）からです。VS Code 1.73 〜 1.81
> （Node.js 16）では一度も使えず、サブスクリプションの方には使用率の代わりに `🤖 Not logged in`
> （または古いキャッシュの %）が表示されていました。
> 実際の動作要件に合わせて最低バージョンを修正しています。VS Code 1.81 以前をお使いの場合は、
> 拡張機能を 0.7.0 のまま使うか、VS Code を更新してください。
- **Claude Code** のセッションが1つ以上あること — トークンコストは
  `~/.claude/projects/**/*.jsonl`（または `claudeStatus.claudeHome`）から読み取ります

---

## 対応プラン

プランは自動で判定されます。追加のログインは不要です。

| プラン | 判定に使う情報 | ステータスバー | レート制限 API |
|---|---|---|---|
| Claude.ai Pro / Max、シート型の Team / Enterprise | `claude login` の認証情報（`~/.claude/.credentials.json` または macOS キーチェーン） | `5h:45% 7d:32%` — 週間ウィンドウのないプランでは 7d は自動で非表示 | Claude Code の使用中のみ、最大5分に1回 |
| 従量課金の Claude.ai プラン（従量課金のエンタープライズなど） | Claude Code のアカウント情報（`~/.claude.json` の `billingType: "usage_based"`） | コストのみ | 呼び出さない |
| Anthropic API キー | `ANTHROPIC_API_KEY` | コストのみ | 呼び出さない |
| AWS Bedrock | AWS の環境変数 | コストのみ | 呼び出さない |

従量課金のプランでは、`claudeStatus.payAsYouGo.showTimeWindows: false` で 5h / 7d の代わりに今日のコストを表示でき、
`claudeStatus.budget.monthlyUsd` で利用上限（spend limit）を管理できます。
判定が合わない場合は `claudeStatus.claudeProvider` を指定してください。
詳細: [docs/PLANS.md](docs/PLANS.md)（英語）。

> 作者は Claude.ai Pro プランで開発・テストしています。その他のプランはベストエフォートでの対応です。
> 想定外の動作があれば、プラン種別を添えて [Issue](https://github.com/long-910/vscode-claude-status/issues) を作成してください。

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
| **Claude Status: 使用履歴をエクスポート…** | 日次使用履歴を CSV / JSON にエクスポート |

---

## 設定

すべての設定は VS Code 設定の `claudeStatus` 名前空間にあります。全項目のリファレンス:
[docs/SETTINGS.md](docs/SETTINGS.md)（英語）。

### 表示

| 設定 | デフォルト | 説明 |
|------|---------|------|
| `claudeStatus.displayMode` | `"percent"` | ステータスバーを `"percent"`（%）か `"cost"`（$）で表示 |
| `claudeStatus.statusBar.alignment` | `"left"` | `"left"` または `"right"` |
| `claudeStatus.statusBar.showProjectCost` | `true` | ステータスバーに現在のプロジェクトのコストを表示 |
| `claudeStatus.statusBar.format` | `null` | カスタムラベル（例: `"${usage5h}% \| $${costDay}"`）。プレースホルダー: `${usage5h}`, `${usage7d}`, `${bar5h}`, `${bar7d}`, `${cost5h}`, `${cost7d}`, `${costDay}`, `${costMonth}` |
| `claudeStatus.statusBar.showSparkline` | `false` | % の横にコンパクトな 5h メーター（▰▰▰▱▱）を表示 |
| `claudeStatus.payAsYouGo.showTimeWindows` | `true` | 従量課金のプランで `false` にすると、5h / 7d の代わりに今日のコストを表示（サブスクには影響なし） |
| `claudeStatus.heatmap.days` | `90` | 使用履歴ヒートマップの日数（30 / 60 / 90） |

### プラン・データソース・API

| 設定 | デフォルト | 説明 |
|------|---------|------|
| `claudeStatus.claudeProvider` | `"auto"` | `"auto"`、`"claude-ai"`、`"claude-ai-usage"`（従量課金の Claude.ai プラン）、`"aws-bedrock"`、`"api-key"` |
| `claudeStatus.claudeHome` | `".claude"` | Claude Code のデータディレクトリ（ホームからの相対パス。絶対パスと `~` も可）。ユーザー設定のみ |
| `claudeStatus.credentials.path` | `null` | 認証情報ファイルのカスタムパス。ユーザー設定のみ |
| `claudeStatus.rateLimitApi.enabled` | `true` | レート制限 % を取得（サブスク）。オフ: API を呼ばず、最後にキャッシュした % を `[Xm ago]` 付きで表示 |
| `claudeStatus.cache.ttlSeconds` | `300` | レート制限キャッシュの TTL（60–3600 秒） |
| `claudeStatus.realtime.enabled` | `false` | Claude Code がアイドルの間もレート制限 % を更新（最短5分間隔、アイドル1時間あたり約12回の小さな API 呼び出し） |

### 予算・通知

| 設定 | デフォルト | 説明 |
|------|---------|------|
| `claudeStatus.budget.dailyUsd` | `null` | 日次予算（USD、`null` = オフ） |
| `claudeStatus.budget.weeklyUsd` | `null` | 直近7日間の予算（ダッシュボードのバー） |
| `claudeStatus.budget.monthlyUsd` | `null` | 暦月の予算（エンタープライズの利用上限など） |
| `claudeStatus.budget.alertThresholdPercent` | `80` | 日次 / 月次予算のこの % で警告 |
| `claudeStatus.notifications.budgetWarning` | `true` | 予算の通知（1日 / 1か月に最大1回） |
| `claudeStatus.notifications.rateLimitWarning` | `true` | 5h 上限に達する前に警告（サブスク） |
| `claudeStatus.notifications.rateLimitWarningThresholdMinutes` | `30` | 何分前に警告するか（5–120） |

### 料金

| 設定 | デフォルト | 説明 |
|------|---------|------|
| `claudeStatus.pricing.useModelPricing` | `true` | 各エントリをモデルごとの組み込み単価で計算 |
| `claudeStatus.pricing.modelOverrides` | `{}` | モデル別の正確な単価。例: `{ "claude-opus-6": { "inputPerMillion": 4, "outputPerMillion": 20 } }` |
| `claudeStatus.pricing.inputPerMillion` | `3.00` | 手動単価（USD / 1M トークン）。未知のモデル、またはモデル別料金オフ時の全エントリに使用 |
| `claudeStatus.pricing.outputPerMillion` | `15.00` | 〃 |
| `claudeStatus.pricing.cacheReadPerMillion` | `0.30` | 〃 |
| `claudeStatus.pricing.cacheCreatePerMillion` | `3.75` | 〃 |

```jsonc
// 例: 月 $400 の利用上限がある従量課金のエンタープライズ
{
  "claudeStatus.payAsYouGo.showTimeWindows": false,   // 5h / 7d の代わりに 🤖 Today:$3.21
  "claudeStatus.budget.monthlyUsd": 400,
  "claudeStatus.budget.dailyUsd": 30
}

// 例: Claude.ai サブスクでコスト表示、外部への API 呼び出しなし
{
  "claudeStatus.displayMode": "cost",
  "claudeStatus.rateLimitApi.enabled": false
}
```

---

## ロードマップ

| 機能 | ステータス |
|------|-----------|
| ステータスバー、ダッシュボード、プロジェクトコスト、予測と予算アラート、ヒートマップ | ✅ v0.1.0 – v0.3.0 |
| レート制限タイムライン、トークン内訳、週次予算、料金 & 設定カード | ✅ v0.4.0 |
| i18n — 英語 / 日本語 / 中国語 | ✅ v0.4.1 |
| macOS キーチェーン認証情報フォールバック（Claude Code v2.x+） | ✅ v0.6.0 |
| データディレクトリの設定、OOM 修正（差分読み込み） | ✅ v0.7.0 |
| モデル別料金（公式価格表と照合）、モデル別内訳、単価の上書き設定 | ✅ Unreleased |
| 従量課金のエンタープライズ対応、従量課金向け表示、月次予算 | ✅ Unreleased |
| サイドバーツリービュー、ステータスバーメーター、使用データのエクスポート（CSV / JSON）、パンチカード | ✅ Unreleased |

---

## ドキュメント

仕様、プランごとの挙動、料金、設定の全リファレンスは [docs/](docs/README.md)（英語）にあります。

---

## 関連プロジェクト

- [claude-tmux-status](https://github.com/long-910/claude-tmux-status) — tmuxステータスバー版（同一作者、Python）
- [vscode-view-charset](https://github.com/long-910/vscode-view-charset) — ファイルエンコーディングビューア（同一作者）

---

## コントリビュート

コントリビューションを歓迎します。セットアップ手順・アーキテクチャ・リリース手順については [CONTRIBUTING.md](CONTRIBUTING.md) をご覧ください。

---

## コントリビュータ

このプロジェクトに貢献してくださった方々に感謝します！

[![Contributors](https://contrib.rocks/image?repo=long-910/vscode-claude-status&exclude=dependabot%5Bbot%5D)](https://github.com/long-910/vscode-claude-status/graphs/contributors)

---

## ライセンス

[MIT](LICENSE) — © 2026 long-910
