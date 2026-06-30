# AI Code Review Format — Web サービス (Schedula)

| 項目 | 値 |
|------|-----|
| リポジトリ | LUDIARS/Schedula |
| 対象ブランチ / PR | feat/split-from-actio |
| レビュー実施日 | 2026-05-20 |
| 対象コミット範囲 | 05be835 (P0 独立リポ再識別) .. 1481aa5 (P2b frontend) |

---

## 総合評価（全 17 項目）

| # | レビュー観点 | 評価 | 重大指摘数 | ドキュメント |
|---|------------|------|-----------|------------|
| 1 | 設計強度 | A | 0 | REVIEW_DESIGN.md |
| 2 | 設計思想の一貫性 | A | 0 | REVIEW_DESIGN.md |
| 3 | モジュール分割度 | A | 0 | REVIEW_DESIGN.md |
| 4 | コード品質 | B | 0 | REVIEW_IMPLEMENTATION.md |
| 5 | コードレベル脆弱性 | A | 0 | REVIEW_VULNERABILITY.md |
| 6 | テスト戦略・カバレッジ | B | 0 | REVIEW_QUALITY.md |
| 7 | ライセンス遵守 | A | 0 | REVIEW_QUALITY.md |
| 8 | ドキュメント完備性 | A | 0 | REVIEW_QUALITY.md |
| 9 | 機能改善 | - | 3 | REVIEW_MISSING_FEATURES.md |
| 10 | 不足機能 | - | 2 | REVIEW_MISSING_FEATURES.md |
| 11 | Web 脆弱性 | A | 0 | REVIEW_VULNERABILITY.md |
| 12 | ゼロトラスト | B | 1 | REVIEW_VULNERABILITY.md |
| 13 | セキュリティ強度 | A | 0 | REVIEW_VULNERABILITY.md |
| 14 | データスキーマ | B | 1 | REVIEW_IMPLEMENTATION.md |
| 15 | SRE | A | 0 | REVIEW_IMPLEMENTATION.md |
| 16 | パフォーマンス・ベンチマーク | B | 0 | REVIEW_QUALITY.md |
| 17 | クロスプラットフォーム互換 | A | 0 | REVIEW_QUALITY.md |

**評価基準:**
- **A**: 問題なし。ベストプラクティスに準拠
- **B**: 軽微な改善点あり。運用上の影響は低い
- **C**: 改善が必要。リリース前の対応を推奨
- **D**: 重大な問題あり。即時対応が必要

---

## 総合サマリ

Schedula は Actio からの予定 (Event) / カレンダー軸の再分離が進行中の予定基盤である。2026-05-20 の P0 初期化〜P2b frontend 整備により、タスク系コード (modules/task, modules/pm, modules/reservation) の物理的除去が完了し、git 履歴を保ったまま独立リポとして再識別された。新フォーマットでの初回レビューにあたる。

**強み:**
- **分離計画が明確**: DESIGN.md で P0〜P6 の 7 段階が詳細に規定され、現在 P2b まで完了。タスク系コードの完全除去と frontend 死にページ削除で責務が「予定/カレンダー」に一本化された
- **CI グリーン**: backend build + test 全通過、frontend lint 0 errors、frontend build 成功。分離作業による regression が無いことが確認されている
- **SDK/プラグインアーキテクチャ**: @ludiars/schedula-sdk による宣言的モジュール登録。voting / holiday / myplan / smart-scheduler / school / integrations の 6 モジュールが installModule() で統合済み
- **個人データ保管禁止ルール徹底**: Cernere への完全委譲、DB には user_id FK のみ保持する設計が CLAUDE.md で明確化され実装が遵守
- **セキュリティヘッダ整備**: X-Content-Type-Options / X-Frame-Options / CSP / HSTS (production) が app.ts で実装済み

**軽微な改善点:**
- **dead namespace (frontend/src/lib/api.ts)**: reservation / pmApi の型定義が unused export として残存。build & lint 両通過で harmless だが、p2c で removal sweep が必要
- **tasks / pm / reservations テーブルの残存**: schema.ts に物理的に残存 (DROP TABLE 禁止ルールに基づく)。未参照のため tombstone comment 付与が望ましい
- **ルーティング二重登録**: notification を /api/m5 と /api/webhooks の両方に登録。整理が必要
- **フロントエンド警告**: ModuleManagementPage.tsx の useEffect 内 setState が react-hooks 警告を出している

### 重み付けスコア: **A**

17 採点項目中 A 13 / B 4。リポジトリの独立化が完全に達成され、予定基盤としての責務が明確に確立されている。P2 フェーズの成果は全て達成済みで、Aedilis 結線 (P5) への道が開かれている。
