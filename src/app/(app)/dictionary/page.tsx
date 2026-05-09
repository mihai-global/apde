import { DictionaryManager } from "@/components/dictionary/DictionaryManager";
import { Crumbs } from "@/components/shell/Crumbs";
import { listDictionary } from "@/lib/supabase/repositories";

export const dynamic = "force-dynamic";

export default async function DictionaryPage() {
  const rows = await listDictionary();
  return (
    <main className="page">
      <div className="shell">
        <Crumbs items={[{ label: "ダッシュボード", href: "/" }, { label: "辞書" }]} />
        <div className="rowsplit" style={{ marginBottom: 32 }}>
          <div>
            <div className="eyebrow">UC-07 · 学習辞書</div>
            <h1 className="h1" style={{ marginTop: 8 }}>学習辞書</h1>
            <p className="muted" style={{ marginTop: 12, fontSize: 14 }}>
              個人の経験を蓄積し、次回の探索キーワード生成と除外フィルタに反映する。
              4 種別 (除外ブランド / 除外カテゴリ / NGパターン / 有望キーワード) を管理。
            </p>
          </div>
        </div>
        <DictionaryManager rows={rows} />
      </div>
    </main>
  );
}
