# Feature 04: Usage Prediction & Budget Alerts

Source: [`src/data/prediction.ts`](../../src/data/prediction.ts),
[`src/data/budget.ts`](../../src/data/budget.ts), notifications in [`src/extension.ts`](../../src/extension.ts)

## Purpose

**VSCode-exclusive feature** — predict when the rate limit will be exhausted
based on the current burn rate, and alert the user before it happens.
Also supports a user-defined USD budget with its own alert threshold.

---

## Prediction Engine (`src/data/prediction.ts`)

### Burn Rate Calculation

`calculateBurnRate()` uses a sliding window of the **last 30 minutes** of transcript entries:
total cost of the entries ÷ hours since the first one = USD/hour. Fewer than two entries → `0`
(shown as *Calculating…*).

> **Note:** Costs are always calculated from token counts (`message.usage`), priced with the same
> `CostOptions` as every other view ([PRICING.md](../PRICING.md)). There is no `costUSD` field in JSONL.

### Rate Limit Exhaustion Prediction

`computePrediction(utilization5h, resetIn5h, cost5h, costToday, dailyBudget, costOptions)`:

1. Read the transcript entries of the last 30 minutes and compute the burn rate.
2. `utilization5h >= 1.0` → already exhausted (`estimatedExhaustionIn = 0`).
3. With a positive burn rate and utilization:
   - estimated window capacity = `cost5h / utilization5h`
   - remaining USD = capacity × (1 − `utilization5h`)
   - time until exhaustion = remaining ÷ burn rate, **capped at `resetIn5h`**
     (exhaustion cannot happen after the window resets)
4. `safeToStartHeavyTask` = more than 30 minutes left.

### Recommendation

`recommendationKey` (translated in the dashboard; `recommendation` is the English fallback):

| Time left | Key | Text |
|---|---|---|
| limit reached | `rate-limit-reached` | Rate limit reached. Wait for reset. |
| < 10 min | `critical` | Less than 10 min remaining. Save your work and pause. |
| < 30 min | `warning` | Less than 30 min remaining. Wrap up current task. |
| < 60 min | `caution` | About 1 hour remaining. Plan your next task accordingly. |
| otherwise | `safe` | Plenty of capacity. Safe to start heavy tasks. |

---

## Budget System

### User Configuration

`claudeStatus.budget.dailyUsd`, `weeklyUsd` and `monthlyUsd` (USD, `null` = disabled, the default)
and `alertThresholdPercent` (default 80) — see [SETTINGS.md](../SETTINGS.md). The daily budget can
also be set with **Claude Status: Set Budget…** or the dashboard's budget form.

| Budget | Period | Compared with | Shown in | Notification |
|---|---|---|---|---|
| `dailyUsd` | local calendar day | `costDay` | dashboard bar + exhaustion time | once per day (also re-armed on a 5h window reset) |
| `weeklyUsd` | rolling 7 days | `cost7d` | dashboard bar | — |
| `monthlyUsd` | local calendar month | `costMonth` | dashboard bar, sidebar *This month*, tooltip | once per month |

The monthly budget is meant for spend limits on usage-based plans (e.g. usage-based
Enterprise, where admins set monthly limits per organization or user). `costMonth` is
summed in `readAllUsage()` from the same usage index, which keeps 32 days so a 31-day month
is always covered.

### Budget Exhaustion Prediction

With a daily budget, `computePrediction()` sets `budgetRemaining = max(0, budget − costToday)` and
`budgetExhaustionTime` = now when the budget is used up, or now + remaining ÷ burn rate while
spending continues.

---

## Notification System

`checkAndNotify()` in `src/extension.ts` runs on every data update. All notifications are
non-modal and can be turned off in Settings.

| Notification | Condition | Kind | Shown at most | Setting |
|---|---|---|---|---|
| Rate limit critical | predicted 5h exhaustion < 10 min (`claude-ai` only) | error, with *Open Dashboard* | once per 5h window | `notifications.rateLimitWarning` |
| Rate limit warning | predicted exhaustion < `rateLimitWarningThresholdMinutes` (default 30) | warning | once per 5h window | `notifications.rateLimitWarning` |
| Daily budget | `costDay` ≥ `alertThresholdPercent` % of `budget.dailyUsd` | warning | once per calendar day (also re-armed on a 5h window reset) | `notifications.budgetWarning` |
| Monthly budget | `costMonth` ≥ `alertThresholdPercent` % of `budget.monthlyUsd` | warning | once per calendar month | `notifications.budgetWarning` |

### Notification Deduplication

- Rate-limit keys live in a `Set` that is cleared when the 5h window resets (detected as
  `resetIn5h` jumping up by more than an hour).
- Budget alerts use `BudgetAlertTracker` (`src/data/budget.ts`), keyed by calendar period
  (`budgetPeriodKey()`): a new day re-arms the daily alert and a new month the monthly one.
  This matters for pay-as-you-go providers, which never see a window reset. A window reset
  re-arms only the daily alert.
- The weekly budget (`budget.weeklyUsd`, rolling 7 days) is shown in the dashboard only and
  has no notification.

---

## WebView Display

The Prediction card of the dashboard ([Feature 02](02-webview.md)) shows, top to bottom:

- the [rate limit timeline chart](02-webview.md#rate-limit-timeline-chart) (Claude.ai only)
- **Burn rate** in $/hr
- the 5h exhaustion estimate — plain text, a warning box under 30 min, an error box under 10 min
- **Daily / Weekly / Monthly budget** progress bars (amber from 60 %, red from 80 %), each with an
  alert box when nearly or fully used; *💸 Budget exhausted ~ at this rate* for the daily one
- a *⚙ Set daily budget* / *Configure budget* link that opens an inline form (Save / Disable)
- 💡 the recommendation
