// 月次の API コスト集計を JSON で返す。ダッシュボードの BudgetCard と同データを REST で公開。
import { env } from "@/lib/env";
import { getAppSetting, listApiUsageThisMonth } from "@/lib/supabase/repositories";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const [usage, settingBudget] = await Promise.all([
    listApiUsageThisMonth(),
    getAppSetting<number>("cost_budget_jpy"),
  ]);
  const totalsByProvider = new Map<string, number>();
  for (const row of usage) {
    totalsByProvider.set(
      row.provider,
      (totalsByProvider.get(row.provider) ?? 0) + Number(row.cost_estimate ?? 0),
    );
  }
  const total = Array.from(totalsByProvider.values()).reduce((sum, v) => sum + v, 0);
  return Response.json({
    total,
    budget: settingBudget ?? env.costBudgetJpy,
    perProvider: Array.from(totalsByProvider.entries()).map(([provider, cost]) => ({ provider, cost })),
    callsLast24h: usage.filter((row) => Date.parse(row.occurred_at) >= Date.now() - 24 * 3600 * 1000).length,
  });
}
