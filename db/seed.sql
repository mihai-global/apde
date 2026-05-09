-- 初期データ: standalone HTML (`APDE-standalone.html`) のモックを移植。
-- - 12 商品 + 6 除外候補 (探索ラン履歴)
-- - 学習辞書サンプル (除外ブランド / NG パターン / 有望キーワード)
-- - app_settings 既定値

-- products
insert into products (asin, title, category, brand, current_price, weight_grams, size_tier, review_count, seller_count, brand_strength, rating, is_hazmat, is_regulated)
values
  ('B0CXM7K2PQ', '本革デスクマット ブラウン 90×45cm 撥水 ステッチエッジ', 'デスク周り', 'MUUTO Crafts', 5980, 720, 'LARGE_STANDARD', 287, 8, 32, 4.4, false, false),
  ('B09JFR2T8L', 'ケーブルオーガナイザー トレイ マグネット式 シリコン製', 'デスク周り', 'Anker系列', 2480, 280, 'SMALL_STANDARD', 124, 12, 28, 4.2, false, false),
  ('B0BQHM6X5K', 'シリコン スプーンレスト & 蓋置き 2点セット 耐熱 食洗機対応', 'キッチン雑貨', 'kitchenia', 1680, 180, 'SMALL_STANDARD', 432, 18, 18, 4.5, false, false),
  ('B0D2VMC7XR', '在宅ワーク向け モニター下 デスクトレイ 木目 引き出し付き', 'デスク周り', 'Sanwa Supply', 4980, 1240, 'OVERSIZE', 96, 5, 61, 4.1, false, false),
  ('B0CLM4HRNV', '美顔ローラー チタン製 リフトケア 防水 24金コーティング', '美容', 'RefaWave', 6800, 110, 'SMALL_STANDARD', 348, 22, 24, 4.0, false, false),
  ('B07P2HK3ZD', '猫用 自動給餌器 タイマー式 ステンレストレイ 6L', 'ペット用品', 'Petlibro', 7480, 1860, 'OVERSIZE', 1240, 14, 71, 4.3, false, false),
  ('B0BMGQ2NXL', 'ノートカバー A5 本革 リフィル交換式 マルチペン挿し', '文房具', 'Itoya inspired', 4200, 240, 'SMALL_STANDARD', 218, 10, 20, 4.6, false, false),
  ('B0DKW6Q83V', 'ステンレス クッキングトング サラダ 24cm シリコンチップ', 'キッチン雑貨', 'OXO風', 1280, 145, 'SMALL_STANDARD', 612, 28, 14, 4.4, false, false),
  ('B0F1XW82KH', '折りたたみチェア 軽量 アルミ アウトドア キャンプ 耐荷重120kg', 'アウトドア', 'Coleman compatible', 5480, 1320, 'OVERSIZE', 540, 16, 42, 4.2, false, false),
  ('B0G7MNCVTQ', 'プラ収納ボックス 10L 透明 スタッキング 蓋付き 3個セット', '収納 / 整理', 'Iris風', 3280, 940, 'LARGE_STANDARD', 178, 9, 36, 4.3, false, false),
  ('B0HQR4P9TN', 'ヘアブラシ ボリュームアップ 静電気防止 木製ハンドル', '美容', 'Mason Pearson系', 3680, 95, 'SMALL_STANDARD', 84, 6, 22, 4.5, false, false),
  ('B0J2KH8VRT', '電動ドライバー 小型 USB-C充電 6.35mm ビット10本付属', 'DIY / 工具', 'Worx alt', 4980, 410, 'SMALL_STANDARD', 286, 14, 48, 4.1, true, false)
on conflict (asin) do update set
  title = excluded.title,
  category = excluded.category,
  brand = excluded.brand,
  current_price = excluded.current_price,
  weight_grams = excluded.weight_grams,
  size_tier = excluded.size_tier,
  review_count = excluded.review_count,
  seller_count = excluded.seller_count,
  brand_strength = excluded.brand_strength,
  rating = excluded.rating,
  is_hazmat = excluded.is_hazmat,
  is_regulated = excluded.is_regulated;

-- discovery_runs サンプル
insert into discovery_runs (category, filters, generated_keywords, candidate_count, candidates, excluded_candidates, duration_ms, source, created_at)
values
  ('デスク周り / ガジェット',
   '{"minPrice":3000,"maxPrice":8000,"maxReviews":500,"limit":50,"applyDictionary":true}'::jsonb,
   '["デスク 整理","ケーブル ごちゃごちゃ 解消","コンパクト デスクトレイ","デスクマット セット","在宅ワーク デスク","モニター下 収納","本革 デスク用品","ガジェット 整理 木製"]'::jsonb,
   12,
   '[]'::jsonb,
   '[
      {"asin":"B0XX1Y92AA","title":"シャープ 加湿空気清浄機 KI-RX75 大型タイプ","reason":"サイズ区分: 大型超"},
      {"asin":"B0XX2Y31BB","title":"Anker PowerCore 26800 モバイルバッテリー 100W","reason":"危険物 (リチウム)"},
      {"asin":"B0XX3T48CC","title":"ニトリ ベッドフレーム シングル 引き出し付き","reason":"重量過多 18,000g"},
      {"asin":"B0XX4P11DD","title":"DAISO 100均ライト系 デスク収納 ホワイト","reason":"個人除外辞書: DAISO"},
      {"asin":"B0XX5K70EE","title":"Apple純正 Magic Mouse 2 シルバー","reason":"強ブランド独占 91%"},
      {"asin":"B0XX6L29FF","title":"化粧品 美白美容液 医薬部外品 30ml","reason":"規制カテゴリ: 化粧品"}
    ]'::jsonb,
   23000,
   'mock',
   now() - interval '6 hours'),
  ('美容 / 健康',
   '{"minPrice":3000,"maxPrice":8000,"maxReviews":500,"limit":50,"applyDictionary":true}'::jsonb,
   '["セルフケア 持ち運び","むくみ ケア","ハンディ サイズ","ケアセット","在宅ケア 道具"]'::jsonb,
   28, '[]'::jsonb, '[]'::jsonb, 41000, 'mock', now() - interval '20 hours'),
  ('キッチン雑貨',
   '{"minPrice":1500,"maxPrice":5000,"maxReviews":800,"limit":50,"applyDictionary":true}'::jsonb,
   '["キッチン 整理","洗いやすい 工夫","コンパクト 軽量","キッチンツール 5点セット"]'::jsonb,
   21, '[]'::jsonb, '[]'::jsonb, 32000, 'mock', now() - interval '28 hours');

-- 学習辞書サンプル
insert into dictionary (type, value, note) values
  ('exclude_brand', 'DAISO', '100均ブランドは利益が出ない'),
  ('exclude_brand', 'Apple純正', '強ブランド独占'),
  ('exclude_category', '医薬部外品', '規制カテゴリは扱わない'),
  ('ng_pattern', '中古', '中古品は対象外'),
  ('ng_pattern', '訳あり', '訳あり品は除外'),
  ('promising_keyword', '本革 ステッチ', '差別化しやすい素材軸'),
  ('promising_keyword', 'コンパクト デスクトレイ', '実績のあるキーワード')
on conflict do nothing;

-- watchlist サンプル
insert into watchlist (asin, status, user_note) values
  ('B0CXM7K2PQ', 'sourcing', 'OEM見積もり3社依頼済'),
  ('B09JFR2T8L', 'candidate', '価格帯やや低めだが回転良好'),
  ('B0CLM4HRNV', 'candidate', 'パッケージ差別化を要検討'),
  ('B0BMGQ2NXL', 'candidate', '素材グレードでアップサイドあり'),
  ('B0HQR4P9TN', 'candidate', '月販ギリギリ — 監視継続')
on conflict (asin) do nothing;

-- app_settings 既定値
insert into app_settings (key, value) values
  ('cache_only_mode', 'false'::jsonb),
  ('cost_budget_jpy', to_jsonb(10000))
on conflict (key) do nothing;
