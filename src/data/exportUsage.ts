import type { DailyUsage } from '../webview/heatmap';

// Serializers for the "Export Usage Data" command. Pure functions — no vscode
// dependency — so they are unit-testable outside the extension host.

export function dailyUsageToCsv(daily: DailyUsage[]): string {
  const lines = ['date,cost_usd,messages,tokens'];
  for (const d of daily) {
    lines.push(`${d.date},${d.cost.toFixed(4)},${d.sessionCount},${d.tokensTotal}`);
  }
  return lines.join('\n') + '\n';
}

export function dailyUsageToJson(daily: DailyUsage[]): string {
  const totalCostUsd = daily.reduce((sum, d) => sum + d.cost, 0);
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      days: daily.length,
      totalCostUsd: Number(totalCostUsd.toFixed(4)),
      daily: daily.map(d => ({
        date: d.date,
        costUsd: Number(d.cost.toFixed(4)),
        messages: d.sessionCount,
        tokens: d.tokensTotal,
      })),
    },
    null,
    2
  ) + '\n';
}
