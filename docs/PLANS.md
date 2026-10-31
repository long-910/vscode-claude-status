# Plans & Providers

How the extension recognizes your Claude plan, what it shows for each, and when it calls
the Anthropic API. This is the single reference for plan-dependent behaviour — other docs
link here instead of repeating it.

---

## At a glance

| Your plan | Provider (`claudeProvider`) | Billing | Status bar (default) | Rate-limit API |
|---|---|---|---|---|
| Claude.ai Pro / Max, seat-based Team / Enterprise | `claude-ai` | subscription with a 5-hour usage window (and a weekly one where the plan has it) | `🤖 5h:45% 7d:32%` | yes — at most once per 5 min, only while Claude Code is active |
| Usage-based Claude.ai plan (e.g. usage-based Enterprise) | `claude-ai-usage` | seat fee + all usage at standard API rates, no per-seat windows | `🤖 5h:$0.15 7d:$0.42` | **never** |
| Anthropic API key (`ANTHROPIC_API_KEY`) | `api-key` | pay-as-you-go at API rates | `🤖 5h:$0.15 7d:$0.42` | never |
| AWS Bedrock | `aws-bedrock` | pay-as-you-go (AWS pricing) | `🤖 5h:$0.15 7d:$0.42` | never |
| Nothing detected | `unknown` | — | cost from local transcripts, or `🤖 Not logged in` | never |

Token cost always comes from the local transcripts (`~/.claude/projects/**/*.jsonl`) and is
calculated on your machine — see [PRICING.md](PRICING.md).

---

## Detection (`claudeStatus.claudeProvider: "auto"`)

1. **Claude.ai credentials** — `<claudeHome>/.credentials.json`
   (`claudeStatus.credentials.path` if set; on macOS, the Keychain entry
   `Claude Code-credentials` when no file exists).
   - If Claude Code's account info says the plan is usage-based, the provider is
     `claude-ai-usage`; otherwise `claude-ai`. The account info is
     `oauthAccount.billingType` in Claude Code's global config — `~/.claude.json`, or
     `<claudeHome>/.claude.json` when `claudeStatus.claudeHome` points elsewhere.
     `"usage_based"` is the value Claude Code itself uses to switch its usage-limit
     handling off.
2. **AWS Bedrock** — `ANTHROPIC_BEDROCK_BASE_URL`, `AWS_BEDROCK_RUNTIME_URL` or
   `CLAUDE_AWS_REGION` is set.
3. **API key** — `ANTHROPIC_API_KEY` is set.
4. Otherwise `unknown`.

If detection picks the wrong provider, set `claudeStatus.claudeProvider` explicitly.

---

## What each provider shows

### Claude.ai subscription (`claude-ai`)

| Situation | Status bar | Dashboard rate-limit bars |
|---|---|---|
| Plan with 5h + weekly windows | `🤖 5h:78% 7d:84%` | both windows |
| Plan with a 5h window only | `🤖 5h:78%` | 5h only (the 7d row hides itself) |
| `displayMode: "cost"` | `🤖 5h:$14.21 7d:$53.17` | shown |
| ≥ 75% of a window | `🤖 5h:78%⚠ 7d:84%⚠` | warning colour |
| Limit reached | `🤖 5h:100%✗` | error colour |
| `rateLimitApi.enabled: false`, cache exists | `🤖 5h:78% [10m ago]` | stale (dimmed) |
| `rateLimitApi.enabled: false`, no cache | `🤖 5h:$0.00 7d:$0.00` | hidden |

Whether a weekly window exists is read from the API response (the
`anthropic-ratelimit-unified-7d-*` headers), not from the plan name. Prediction of when the
5h window runs out and the rate-limit notifications apply only to this provider; burn rate
and budgets apply to all.

### Pay-as-you-go: usage-based Claude.ai, API key, Bedrock

- Always cost mode; no rate-limit percentages, bars or exhaustion prediction.
- `claudeStatus.payAsYouGo.showTimeWindows: false` replaces the 5h / 7d figures — a
  subscription concept — with today's cost: status bar `🤖 Today:$2.50 | my-app:$3.21`,
  tooltip and sidebar show *Today* and *This month*, and the dashboard hides the Current
  Usage card, the 5h / 7d rows and the 5h token breakdown. Subscriptions and custom
  `statusBar.format` strings are unaffected.
- For spend limits (e.g. monthly limits set by an Enterprise admin), set
  `claudeStatus.budget.monthlyUsd`.
- Costs are list-price estimates: negotiated discounts, seat fees and Bedrock / Vertex
  regional pricing are not included.

---

## Rate-limit API calls (`claude-ai` only)

Each call is a 1-token request to `claude-haiku-4-5` (≈ 9 tokens, ≈ $0.00013) made only to
read the `anthropic-ratelimit-unified-*` response headers. It is cached in
`<claudeHome>/vscode-claude-status-cache.json`.

| Situation | API calls |
|---|---|
| Claude Code active (a transcript changed in the last 5 min) and cache older than `cache.ttlSeconds` | 1, then cached |
| Cache fresh, or Claude Code idle | 0 — cached values, with an age suffix once stale |
| `rateLimitApi.enabled: false` | 0 |
| Dashboard **↻ Refresh** / *Refresh Now* | 1 |
| Extension activation | 0 (reads the cache first) |
| Any other provider | 0 |

An error response without rate-limit headers (e.g. an expired token) is not shown as
`0%`; the cached value is kept.

> `claudeStatus.realtime.enabled` is declared but **not implemented** — it has no effect.

---

## Recommended settings

| You want… | Settings |
|---|---|
| Live % on a subscription | defaults (`rateLimitApi.enabled: true`, `displayMode: "percent"`) |
| Cost instead of % on a subscription | `displayMode: "cost"` (or `Ctrl+Shift+Alt+C`) |
| No outbound HTTPS / offline | `rateLimitApi.enabled: false` — cached % stays visible |
| Pay-as-you-go without 5h / 7d figures | `payAsYouGo.showTimeWindows: false` |
| Track a spend limit | `budget.monthlyUsd` (and / or `budget.dailyUsd`, `budget.weeklyUsd`) |
| A model newer than the built-in prices | `pricing.modelOverrides` — see [PRICING.md](PRICING.md) |

---

## Testing status

Developed and tested on a Claude.ai Pro plan. Usage-based detection follows Claude Code's
own logic but has not been checked against a live usage-based Enterprise account. Please
[open an issue](https://github.com/long-910/vscode-claude-status/issues) with your plan
type if something looks wrong.
