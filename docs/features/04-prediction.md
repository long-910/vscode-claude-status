# Feature 04: Usage Prediction & Budget Alerts

## Purpose

**VSCode-exclusive feature** — predict when the rate limit will be exhausted
based on the current burn rate, and alert the user before it happens.
Also supports a user-defined USD budget with its own alert threshold.

---

## Prediction Engine (`src/data/prediction.ts`)

### Burn Rate Calculation

Use a sliding window of the **last 30 minutes** of JSONL entries:

```typescript
export function calculateBurnRate(
  entries: ReadonlyArray<{ timestamp: number; cost: number }>
): number {
  if (entries.length < 2) return 0  // not enough data

  const totalCost = entries.reduce((sum, e) => sum + e.cost, 0)
  const spanMs = Date.now() - entries[0].timestamp
  const spanHours = spanMs / (1000 * 3600)

  return spanHours > 0 ? totalCost / spanHours : 0  // USD/hour
}
```

> **Note:** Costs are always calculated from token counts (`entry.message.usage`).
> There is no `costUSD` field in JSONL.

### Rate Limit Exhaustion Prediction

```typescript
export async function computePrediction(
  utilization5h: number,    // 0.0–1.0
  resetIn5h: number,        // seconds until reset
  cost5h: number,           // USD spent in current 5h window
  costToday: number,        // USD spent today (for budget)
  dailyBudget: number | null,
): Promise<PredictionData>
```

**Algorithm:**

1. Read all JSONL entries from the last 30 minutes
2. Calculate burn rate (USD/hour) from those entries
3. If `utilization5h >= 1.0`: already exhausted → `estimatedExhaustionIn = 0`
4. If `burnRate > 0` and `utilization5h > 0`:
   - Estimate total capacity: `estimatedCapacityUsd = cost5h / utilization5h`
   - Remaining USD: `remainingUsd = estimatedCapacityUsd * (1.0 - utilization5h)`
   - Hours until exhaustion: `remainingUsd / burnRate`
   - Cap at `resetIn5h` (exhaustion can't happen after the window resets)
5. `safeToStartHeavyTask = effectiveSeconds > 1800` (30 min threshold)

### Recommendation Text

```typescript
export function buildRecommendation(exhaustionIn: number): string {
  if (exhaustionIn < 600)   return 'Less than 10 min remaining. Save your work and pause.'
  if (exhaustionIn < 1800)  return 'Less than 30 min remaining. Wrap up current task.'
  if (exhaustionIn < 3600)  return 'About 1 hour remaining. Plan your next task accordingly.'
  return 'Plenty of capacity. Safe to start heavy tasks.'
}
```

---

## Budget System

### User Configuration

```json
// settings.json
{
  "claudeStatus.budget.dailyUsd": 20.0,
  "claudeStatus.budget.weeklyUsd": 100.0,
  "claudeStatus.budget.monthlyUsd": 400.0,
  "claudeStatus.budget.alertThresholdPercent": 80
}
```

Default: no budget set (`null` = disabled).

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

```typescript
// In computePrediction():
if (dailyBudget !== null) {
  const remaining = dailyBudget - costToday
  budgetRemaining = Math.max(0, remaining)
  if (remaining <= 0) {
    budgetExhaustionTime = new Date()
  } else if (burnRateUsdPerHour > 0) {
    const hoursUntil = remaining / burnRateUsdPerHour
    budgetExhaustionTime = new Date(Date.now() + hoursUntil * 3600 * 1000)
  }
}
```

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

In the Prediction card of the dashboard:

```html
<div class="card">
  <p class="card-title">Prediction</p>

  <div class="prediction-row">Burn rate: $4.2 / hr</div>

  <!-- Rate limit prediction -->
  <div class="alert warning">
    ⚠ At this rate, 5h limit reached in ~45 min (at 14:23)
  </div>

  <!-- Budget (if configured) -->
  <div class="cost-row">
    <span class="cost-label">Daily budget</span>
    <span>$3.21 / $20.00 (16%)</span>
  </div>
  <div class="progress-track">
    <div class="progress-fill" style="width: 16%"></div>
  </div>

  <div class="prediction-row">💡 Wrap up current task.</div>

  <!-- Budget configure input (always visible in dashboard) -->
  <div class="budget-configure">
    <label>Daily budget ($)</label>
    <input type="number" id="dailyBudget" min="0" step="5">
    <button id="btn-save-budget">Save</button>
    <button id="btn-clear-budget">Clear</button>
  </div>
</div>
```
