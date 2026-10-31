// Budget periods and alert rules. Pure functions — no vscode import — so they
// are unit-testable outside the extension host.

import { localDateKey } from './localTime';

/** Local calendar period a budget alert belongs to: "2026-10-31" or "2026-10". */
export function budgetPeriodKey(kind: 'day' | 'month', now: Date = new Date()): string {
  const day = localDateKey(now);
  return kind === 'month' ? day.slice(0, 7) : day;
}

/**
 * Projected cost for the whole calendar month: this month's cost so far spread
 * over the days elapsed (today counts as a full day), times the days in the
 * month. Null while nothing has been spent this month.
 */
export function projectMonthCost(costMonth: number, now: Date = new Date()): number | null {
  if (!(costMonth > 0)) { return null; }
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return costMonth / now.getDate() * daysInMonth;
}

/** True once `spent` reaches `thresholdPercent` of a positive `budget`. */
export function budgetThresholdReached(spent: number, budget: number | null, thresholdPercent: number): boolean {
  if (budget === null || !(budget > 0)) { return false; }
  return (spent / budget) * 100 >= thresholdPercent;
}

/**
 * Remembers which budget alerts were shown, once per calendar period: a new
 * day re-arms the daily alert and a new month the monthly one, also for
 * pay-as-you-go users, whose usage never hits a 5-hour window reset.
 */
export class BudgetAlertTracker {
  private readonly shown = new Set<string>();

  /** True the first time it is called for `kind` in the period of `now`. */
  shouldShow(kind: 'day' | 'month', now: Date = new Date()): boolean {
    const key = `${kind}:${budgetPeriodKey(kind, now)}`;
    if (this.shown.has(key)) { return false; }
    this.shown.add(key);
    return true;
  }

  /** Re-arm `kind` within the current period (the daily alert on a 5-hour window reset). */
  rearm(kind: 'day' | 'month'): void {
    for (const key of this.shown) {
      if (key.startsWith(`${kind}:`)) { this.shown.delete(key); }
    }
  }
}
