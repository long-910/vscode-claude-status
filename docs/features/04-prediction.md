# Feature 04: Usage Prediction & Budget Alerts

## Purpose

**VSCode-exclusive feature** — predict when the rate limit will be exhausted
based on the current burn rate, and alert the user before it happens.
Also supports a user-defined USD budget with its own alert threshold.

---

## Prediction Engine (`src/data/prediction.ts`)

### Burn Rate Calculation

Use a sliding window of the last 30 minutes to calculate the current burn rate:

```typescript
function calculateBurnRate(entries: JournalEntry[]): number {
  const windowMs = 30 * 60 * 1000  // 30 minutes
  const now = Date.now()
  const recent = entries.filter(e => now - new Date(e.timestamp).getTime() < windowMs)

  if (recent.length < 2) return 0  // not enough data

  const totalCost = recent.reduce((sum, e) => sum + (e.costUSD ?? 0), 0)
  const spanMs = now - new Date(recent[0].timestamp).getTime()
  const spanHours = spanMs / (1000 * 3600)

  return spanHours > 0 ? totalCost / spanHours : 0  // USD/hour
}
```

### Rate Limit Exhaustion Prediction

```typescript
function predictExhaustion(
  utilization5h: number,    // 0.0–1.0
  resetIn5h: number,        // seconds until reset
  burnRateUsdPerHour: number,
  cost5h: number,           // USD spent in current 5h window
): PredictionData {

  if (burnRateUsdPerHour <= 0) {
    return { estimatedExhaustionTime: null, ... safeToStartHeavyTask: true }
  }

  // Remaining capacity: estimate from utilization
  const remainingCapacity = 1.0 - utilization5h  // fraction of limit remaining

  if (remainingCapacity <= 0) {
    return {
      estimatedExhaustionTime: new Date(),
      estimatedExhaustionIn: 0,
      safeToStartHeavyTask: false,
      recommendation: 'Rate limit reached. Wait for reset.',
      ...
    }
  }

  // If we know the cost that corresponds to 100% utilization:
  // cost5h / utilization5h = total capacity in USD
  const estimatedCapacityUsd = utilization5h > 0
    ? cost5h / utilization5h
    : null

  if (estimatedCapacityUsd !== null) {
    const remainingUsd = estimatedCapacityUsd * remainingCapacity
    const hoursUntilExhaustion = remainingUsd / burnRateUsdPerHour
    const secondsUntilExhaustion = hoursUntilExhaustion * 3600

    // Cap at reset time — exhaustion can't be after the window resets
    const effectiveSeconds = Math.min(secondsUntilExhaustion, resetIn5h)

    return {
      estimatedExhaustionTime: new Date(Date.now() + effectiveSeconds * 1000),
      estimatedExhaustionIn: effectiveSeconds,
      currentBurnRate: burnRateUsdPerHour,
      safeToStartHeavyTask: effectiveSeconds > 1800,  // >30 min remaining
      recommendation: buildRecommendation(effectiveSeconds, resetIn5h),
      ...
    }
  }

  // Fallback: can't estimate capacity without knowing cost scale
  return { estimatedExhaustionTime: null, safeToStartHeavyTask: true, ... }
}
```

### Recommendation Text

```typescript
function buildRecommendation(exhaustionIn: number, resetIn: number): string {
  if (exhaustionIn < 600)   return '🔴 Less than 10 min remaining. Save your work and pause.'
  if (exhaustionIn < 1800)  return '⚠️ Less than 30 min remaining. Wrap up current task.'
  if (exhaustionIn < 3600)  return '🟡 About 1 hour remaining. Plan your next task accordingly.'
  return '✅ Plenty of capacity. Safe to start heavy tasks.'
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
  "claudeStatus.budget.alertThresholdPercent": 80
}
```

Default: no budget set (null = disabled).

### Budget Exhaustion Prediction

```typescript
function predictBudgetExhaustion(
  costToday: number,
  burnRateUsdPerHour: number,
  dailyBudget: number | null,
): { budgetRemaining: number | null; budgetExhaustionTime: Date | null } {
  if (!dailyBudget) return { budgetRemaining: null, budgetExhaustionTime: null }

  const remaining = dailyBudget - costToday
  if (remaining <= 0) return { budgetRemaining: 0, budgetExhaustionTime: new Date() }

  if (burnRateUsdPerHour <= 0) {
    return { budgetRemaining: remaining, budgetExhaustionTime: null }
  }

  const hoursUntil = remaining / burnRateUsdPerHour
  return {
    budgetRemaining: remaining,
    budgetExhaustionTime: new Date(Date.now() + hoursUntil * 3600 * 1000),
  }
}
```

---

## Notification System

### VSCode Notifications

Use `vscode.window.showWarningMessage` / `showErrorMessage`:

```typescript
async function checkAndNotify(prediction: PredictionData, config: ExtensionConfig) {
  const { estimatedExhaustionIn } = prediction

  // Rate limit warnings
  if (estimatedExhaustionIn !== null) {
    if (estimatedExhaustionIn < 600 && !wasNotified('ratelimit-critical')) {
      const action = await vscode.window.showErrorMessage(
        `Claude Code: Rate limit in ~${Math.round(estimatedExhaustionIn / 60)} min`,
        'Open Dashboard', 'Dismiss'
      )
      if (action === 'Open Dashboard') openDashboard()
      markNotified('ratelimit-critical')
    } else if (estimatedExhaustionIn < 1800 && !wasNotified('ratelimit-warning')) {
      vscode.window.showWarningMessage(
        `Claude Code: Rate limit in ~${Math.round(estimatedExhaustionIn / 60)} min`
      )
      markNotified('ratelimit-warning')
    }
  }

  // Budget warnings
  if (prediction.budgetRemaining !== null && config.budget.dailyUsd) {
    const pct = (prediction.budgetRemaining / config.budget.dailyUsd) * 100
    if (pct <= (100 - config.budget.alertThresholdPercent) && !wasNotified('budget')) {
      vscode.window.showWarningMessage(
        `Claude Code: Daily budget ${config.budget.alertThresholdPercent}% used ($${(config.budget.dailyUsd - prediction.budgetRemaining).toFixed(2)} / $${config.budget.dailyUsd})`
      )
      markNotified('budget')
    }
  }
}
```

### Notification Deduplication

Notifications must not repeat within a single session window.
Use an in-memory `Set<string>` of notified keys, cleared when the 5h window resets.

```typescript
const notifiedKeys = new Set<string>()

function wasNotified(key: string): boolean { return notifiedKeys.has(key) }
function markNotified(key: string): void { notifiedKeys.add(key) }

// Clear on window reset
function onWindowReset(): void { notifiedKeys.clear() }
```

---

## WebView Display

In the Prediction card of the dashboard:

```html
<div class="card prediction">
  <h3>Usage Prediction</h3>

  <div class="metric-row">
    <span class="label">Burn rate</span>
    <span class="value">$4.2 / hr</span>
  </div>

  <!-- Rate limit prediction -->
  <div class="alert warning">
    ⚠️ At this rate, 5h limit reached in ~45 min (at 14:23)
  </div>

  <!-- Budget prediction (if configured) -->
  <div class="metric-row">
    <span class="label">Daily budget</span>
    <span class="value">$3.21 / $20.00 (16%)</span>
  </div>
  <div class="progress-track">
    <div class="progress-fill" style="width: 16%"></div>
  </div>

  <div class="recommendation">
    💡 Wrap up current task. Plenty of budget remaining.
  </div>

  <!-- Budget input -->
  <div class="budget-input">
    <label>Set daily budget ($)</label>
    <input type="number" id="dailyBudget" min="0" step="5" value="20">
    <button onclick="saveBudget()">Save</button>
  </div>
</div>
```

Show the budget input only if no budget is set yet, or on click of a "⚙ Configure" link.
