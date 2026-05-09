import { Crumbs } from "@/components/shell/Crumbs";
import { SearchForm } from "@/components/search/SearchForm";

export default function SearchPage() {
  return (
    <main className="page">
      <div className="shell" style={{ maxWidth: 960 }}>
        <Crumbs items={[{ label: "ダッシュボード", href: "/" }, { label: "新しい探索" }]} />
        <div className="eyebrow">UC-01 · カテゴリ探索</div>
        <h1 className="h1" style={{ marginTop: 8, marginBottom: 16 }}>新しい探索</h1>
        <p className="muted" style={{ fontSize: 14, marginBottom: 56, maxWidth: 560 }}>
          カテゴリを起点に、用途・問題解決・サイズ・セット・利用シーンの 5 軸でキーワードを生成。
          Keepa取得後、5軸スコアリング + ゲート判定で初期判定まで自動実行する。
        </p>

        <SearchForm />
      </div>
    </main>
  );
}
