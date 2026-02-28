# vscode-claude-status

> Claude Code のトークン使用量とコスト — VS Code のステータスバーに常時表示。

[![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/long-kudo.vscode-claude-status?style=flat-square&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=long-kudo.vscode-claude-status)
[![License: MIT](https://img.shields.io/github/license/long-910/vscode-claude-status?style=flat-square)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.109.0-007ACC?style=flat-square)](https://code.visualstudio.com/)
[![CI](https://github.com/long-910/vscode-claude-status/actions/workflows/ci.yml/badge.svg)](https://github.com/long-910/vscode-claude-status/actions/workflows/ci.yml)
[![Release](https://github.com/long-910/vscode-claude-status/actions/workflows/release.yml/badge.svg)](https://github.com/long-910/vscode-claude-status/actions/workflows/release.yml)

🌐 [English](README.md) | [日本語](README.ja.md)

---

## 概要

**vscode-claude-status** は、エディタを離れることなく [Claude Code](https://claude.ai/code) の使用状況をリアルタイムで監視できる Visual Studio Code 拡張機能です。

`~/.claude/projects/` からローカルでセッションデータを読み取り（追加のネットワーク呼び出しなし）、レート制限の使用率ヘッダーを取得するために最大5分に1回だけ Anthropic API に問い合わせます。トークンコストはすべて現在の Claude Sonnet 4.x 料金を使用してクライアント側で計算されます。

---

## 機能

### 📊 ステータスバー — 常時表示

VS Code ステータスバーにピン留めされたリアルタイム使用状況サマリー。

| 状態 | 表示例 |
|------|--------|
| 通常（%モード） | `🤖 5h:45% 7d:62%` |
| 警告 ≥75% | `🤖 5h:78%⚠ 7d:84%⚠` |
| レート制限到達 | `🤖 5h:100%✗` |
| コストモード | `🤖 5h:$14.21 7d:$53.17` |
| プロジェクトコスト付き | `🤖 5h:78% 7d:84% \| my-app:$3.21` |
| キャッシュ古い | `🤖 5h:78% 7d:84% [10m ago]` |
| 未ログイン | `🤖 Not logged in` |

ホバーすると、完全なトークン内訳とリセット時間を含む詳細なツールチップが表示されます。

### 🗂 ダッシュボードパネル

ステータスバーアイテムをクリックすると、以下を含むリッチなダッシュボードパネルが開きます：

- **現在の使用量** — 5時間・7日間ウィンドウのカラーコード付きプログレスバー
- **トークンコスト** — ローカルJSONLデータから計算された5時間・今日・7日間のコスト
- **プロジェクトコスト** — ワークスペース別内訳（今日・7日間・30日間）
- **予測** _(予定)_ — 消費率と枯渇までの時間推定
- **使用履歴** _(予定)_ — GitHubスタイルのヒートマップ＋時間帯別パターンチャート

パネルはVS Codeのライト・ダーク・ハイコントラストテーマをネイティブにサポートします。

### 🗂 プロジェクトレベルのコスト追跡 *(VS Code専用)*

開いているワークスペースフォルダーをClaudeCodeのセッションディレクトリに自動でマッピングし、**その特定のプロジェクトに費やした金額**（今日・今週・今月）を表示します。

マルチルートワークスペースも完全サポート：各フォルダーがダッシュボードに独自の内訳を持ち、ステータスバーには集計が表示されます。

```
🤖 5h:78% 7d:84% | my-app:$3.21          ← 単一ワークスペース
🤖 5h:78% 7d:84% | PJ:$5.43              ← マルチルート集計
```

### 🔮 使用量予測 & 予算アラート *(予定 — v0.2.0)*

- 現在の消費率（$/時間）
- 5時間レート制限が枯渇するまでの推定時間
- 設定可能なアラート閾値付きの任意の日次・週次予算

### 📅 使用履歴ヒートマップ *(予定 — v0.2.0)*

- 直近30・60・90日間のGitHub Contributionsスタイルの日次ヒートマップ
- 時間帯別使用パターンバーチャート — いつClaudeCodeを最も使用しているかを可視化

---

## 必要条件

- **VS Code** 1.109以降
- **Claude Code CLI** インストール済みで認証済み（`claude login`）
  — APIコール用の `~/.claude/.credentials.json` が作成されます
- **Claude Codeセッション** — 拡張機能は `~/.claude/projects/**/*.jsonl` を読み取ります

---

## インストール

### VS Code Marketplace *(近日公開)*

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

---

## 設定

すべての設定はVS Code設定の `claudeStatus` 名前空間にあります。

| 設定 | 型 | デフォルト | 説明 |
|------|-----|---------|------|
| `claudeStatus.displayMode` | `"percent"` \| `"cost"` | `"percent"` | ステータスバー表示モード |
| `claudeStatus.statusBar.alignment` | `"left"` \| `"right"` | `"left"` | ステータスバーの位置 |
| `claudeStatus.statusBar.showProjectCost` | `boolean` | `true` | ステータスバーにプロジェクトコストを表示 |
| `claudeStatus.cache.ttlSeconds` | `number` (60–3600) | `300` | APIキャッシュTTL（秒） |
| `claudeStatus.realtime.enabled` | `boolean` | `false` | TTL秒ごとにAPIをポーリング |
| `claudeStatus.budget.dailyUsd` | `number \| null` | `null` | 日次予算（USD）（`null` = 無効） |
| `claudeStatus.budget.weeklyUsd` | `number \| null` | `null` | 週次予算（USD） |
| `claudeStatus.budget.alertThresholdPercent` | `number` (1–100) | `80` | 予算アラート閾値（%） |
| `claudeStatus.notifications.rateLimitWarning` | `boolean` | `true` | レート制限が近い時に警告 |
| `claudeStatus.notifications.rateLimitWarningThresholdMinutes` | `number` (5–120) | `30` | 制限の何分前に警告を表示 |
| `claudeStatus.notifications.budgetWarning` | `boolean` | `true` | 予算閾値超過時に警告 |
| `claudeStatus.heatmap.days` | `30 \| 60 \| 90` | `90` | 使用ヒートマップに表示する日数 |
| `claudeStatus.credentials.path` | `string \| null` | `null` | カスタム認証情報ファイルパス |

```jsonc
// 設定例: settings.json
{
  "claudeStatus.displayMode": "cost",
  "claudeStatus.cache.ttlSeconds": 120,
  "claudeStatus.budget.dailyUsd": 5.00,
  "claudeStatus.budget.alertThresholdPercent": 80,
  "claudeStatus.statusBar.showProjectCost": true
}
```

---

## 仕組み

### データフロー

```
Claude CodeがJSONLファイルを更新
  → FileWatcherが変更を検出
    → DataManager.refresh()
      → JsonlReaderがトークンコストを集計   （ローカル、即時）
      → ApiClientがレート制限ヘッダーを取得 （1回のAPIコール、その後キャッシュ）
      → StatusBar & Dashboardが更新
```

Claude Codeがアイドル状態の場合、拡張機能はローカルキャッシュからのみ読み取ります — Claude Codeが再びアクティブになる（JSONLが最近更新された）まで APIコールは行われません。

### JSOLフォーマット（Claude Code v2.1.xで確認済み）

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

### プロジェクトパスマッピング

Claude Codeは、すべての非英数字文字を `-` に置換してワークスペースパスをディレクトリ名にエンコードします：

```
/home/user/sb_git/my-app
  → ~/.claude/projects/-home-user-sb-git-my-app/
```

拡張機能はこれをStrategy 1として使用し、エッジケースにはJSONLの `cwd` フィールドをスキャンするStrategy 2にフォールバックします。

### トークンコスト計算式

コストは **Claude Sonnet 4.x** 料金を使用して計算されます（[claude-tmux-status](https://github.com/long-910/claude-tmux-status) と同じ）：

| トークン種別 | $/1Mトークン |
|------------|------------|
| Input | $3.00 |
| Output | $15.00 |
| Cache read | $0.30 |
| Cache creation | $3.75 |

---

## CI / CD

このリポジトリでは2つの GitHub Actions ワークフローを使用しています。

### CI (`ci.yml`) — Lint・ビルド・テスト

`main` への **push** および **プルリクエスト** ごとに実行されます。

```
push / pull_request → main
  └── matrix: ubuntu-latest / macos-latest / windows-latest
        ├── npm ci
        ├── npm run lint
        ├── npm run compile
        └── npm test  （Linux: ヘッドレス VSCode 用に xvfb-run）
```

3つのプラットフォームすべてがパスしないと PR はマージできません。

### Release (`release.yml`) — パッケージ化 & 公開

**バージョンタグ**（`v*`）をプッシュすると実行されます（例: `git tag v0.2.0 && git push --tags`）。

```
push tag v*
  ├── npm ci
  ├── npm run lint
  ├── npm run compile
  ├── npm test  （xvfb-run）
  ├── vsce package  →  *.vsix
  ├── CHANGELOG.md から最新バージョンのリリースノートを抽出
  ├── GitHub Release を作成  （.vsix を添付、タグに "-" を含む場合はプレリリース）
  └── VS Marketplace に公開  （VSCE_PAT シークレットが必要）
```

#### 必要なシークレット

| シークレット | 説明 |
|-------------|------|
| `VSCE_PAT` | [VS Marketplace](https://marketplace.visualstudio.com/) 公開用の Personal Access Token |

`GITHUB_TOKEN` は GitHub Actions が自動的に提供するため、設定不要です。

#### リリース手順（ステップバイステップ）

1. すべての変更を `main` にマージし、CI がグリーンであることを確認する。
2. `CHANGELOG.md` を更新 — `## [X.Y.Z]` セクションにリリースノートを追加する。
3. `package.json` の `"version"` をそれに合わせて更新する。
4. コミット: `git commit -m "chore: release vX.Y.Z"`
5. タグを付けてプッシュ:
   ```bash
   git tag vX.Y.Z
   git push origin main --tags
   ```
6. Release ワークフローが自動実行 — 数分以内に GitHub Release が作成され、
   拡張機能が Marketplace に公開されます。

> **プレリリース**: タグに `-` を含む場合（例: `v0.2.0-beta.1`）は、GitHub と
> Marketplace の両方で自動的にプレリリース扱いになります。

---

## 開発

### セットアップ

```bash
git clone https://github.com/long-910/vscode-claude-status.git
cd vscode-claude-status
npm install
```

### コマンド

```bash
npm run compile        # webpackバンドル（開発用）
npm run watch          # ウォッチモード
npm run compile-tests  # テストファイルをout/にコンパイル
npm run lint           # ESLint
npm test               # フルテストスイート
npm run package        # 本番用.vsix
```

VS Codeで **F5** を押してExtension Development Hostを起動。

---

## ロードマップ

| 機能 | 状態 |
|------|------|
| データ層（JSONLリーダー、APIクライアント、キャッシュ） | ✅ v0.1.0 |
| %/$表示のステータスバー | ✅ v0.1.0 |
| WebViewダッシュボードスケルトン | ✅ v0.1.0 |
| プロジェクトレベルのコスト追跡 | ✅ v0.1.0 |
| 使用量予測 & 予算アラート | 🔜 v0.2.0 |
| セッション履歴ヒートマップ | 🔜 v0.2.0 |
| VS Code Marketplace公開 | 🔜 v0.2.0 |

---

## 関連プロジェクト

- [claude-tmux-status](https://github.com/long-910/claude-tmux-status) — tmuxステータスバー版（同一作者、Python）
- [vscode-view-charset](https://github.com/long-910/vscode-view-charset) — ファイルエンコーディングビューア（同一作者）

---

## コントリビュート

コントリビューションを歓迎します。
作業を始める前に、コーディング規約と実装順序について [CLAUDE.md](CLAUDE.md) をお読みください。

1. リポジトリをフォーク
2. ブランチを作成: `git checkout -b feat/my-feature`
3. `npm run lint && npm run compile-tests` を実行 — コミット前にクリーンである必要があります
4. プルリクエストを提出

---

## ライセンス

[MIT](LICENSE) — © 2026 long-910
