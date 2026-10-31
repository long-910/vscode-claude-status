// Local-time calendar helpers shared by the usage totals, heatmap, export and
// budgets. Pure functions — no vscode import.

/** Local midnight on the 1st of `now`'s month, in ms. */
export function startOfMonth(now: Date = new Date()): number {
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

/** Local calendar date "YYYY-MM-DD" — the key used by the heatmap, export and budget alerts. */
export function localDateKey(time: Date | number): string {
  const d = new Date(time);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
