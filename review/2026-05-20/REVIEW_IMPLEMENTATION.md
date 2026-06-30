# Web 実装評価 — Schedula

| 項目 | 値 |
|------|-----|
| リポジトリ | LUDIARS/Schedula |
| 対象ブランチ / PR | feat/split-from-actio |
| レビュー実施日 | 2026-05-20 |
| 対象コミット範囲 | 05be835 .. 1481aa5 |

---

## 1. コード品質 (Code Quality)

| 評価 | 観点 | 所見 |
|------|------|------|
| B | 型安全性 | TypeScript strict mode。SDK defineModule() の manifest 型で routes/wsCommands/userData の登録が型ガードされる。 |
| A | 命名・可読性 | camelCase / snake_case / PascalCase の使い分けが一貫。module ID は kebab-case。 |
| B | デッドコード | 分離作業に伴い frontend/src/lib/api.ts に pmApi / reservationPluginsApi の dead namespace が残存、src/db/connection.ts に pmSchema の未使用 import あり。build/lint は通過 (harmless)。 |
| A | 例外処理 | 空の catch なし。app.ts の onError で uncaught を集約。 |
| A | 重複コード | repository.ts で DB access を一元化し DRY 遵守。 |

### チェック項目

- [x] マジックナンバー — shared/constants.ts に集約
- [x] 過度なネスト — 早期リターン多用
- [x] デッドコード — pmApi / reservationPluginsApi namespace と pmSchema import が残存 (p2c で整理)
- [x] DRY 違反 — repository 一元化
- [x] スコープ — 適切
- [x] 例外の握りつぶし — なし
- [x] 暗黙的型変換 — strict mode
- [x] ログレベル — [http] / [http-warn] / [http-error] タグで構造化

---

## 2. データスキーマの妥当性・重複確認 (Data Schema Validation)

| テーブル / モデル | 問題種別 | 説明 | 推奨対応 |
|-----------------|---------|------|---------|
| `events` (src/db/schema.ts:1026) | 正規化適切 | 主キー id (UUID)、ownerId/groupId FK、startTime/endTime (timestamp mode)、pluginId/pluginRef で外部拡張。制約完全。 | 問題なし |
| `tasks` (src/db/schema.ts:1076) | 存在するが未使用 | Schedula は task 概念を持たない (Actio へ分離)。application code で参照なし。DROP TABLE 禁止ルールに従い保持。 | tombstone comment 追加: `/* SCHEDULA_UNUSED */` |
| `reservations` (src/db/schema.ts:212) | 存在するが未使用 | Aedilis へ分離予定だが schema.ts に残存。eventRepo では未使用。 | Aedilis 移行時に削除。現在は harmless |
| personalEvents / plans | 正規化適切 | group_events とは分離。calendar domain の personal/group 分岐が明確。 | 問題なし |
| group_events (src/db/schema.ts:994) | 正規化適切 | groupId/date を composite。eventType enum で variant。index 最適化済み。 | 問題なし |

### チェック項目

- [x] 正規化 — 3NF 達成。user_id / group_id を FK のみで保持する個人データ非保管設計
- [x] 同一概念の複数定義 — events (時間拘束)。重複なし
- [x] フィールド型 — timestamp (UTC mode) / text / integer / enum。mismatch なし
- [x] NOT NULL・UNIQUE・FK 制約 — id primaryKey、ownerId notNull、group_id nullable (personal=null)。FK は .references()
- [x] インデックス最適化 — idx_event_owner / idx_event_group / idx_event_start_time / idx_group_event_date で主要 query path をカバー
- [x] マイグレーション破壊性 — P2 は削除のみ。schema.ts は cumulative (drop column なし)
- [x] API ↔ DB スキーマ — frontend/src/lib/api-types.ts と inferSelect/inferInsert が同期
- [x] Enum 定義一致 — visibility ("private"/"group"/"public") は schema default と app constraint で一致

---

## 3. SRE 観点のレビュー (SRE Review)

| 評価 | 観点 | 所見 |
|------|------|------|
| A | 可観測性 | [http] / [http-warn] / [http-error] タグで構造化ログ出力。ts/method/path/status/durationMs/userId/error を JSON で記録。requestId middleware で trace 可能。 |
| A | デプロイ安全性 | package-lock.json で依存固定。Node v22+ 要件明記。docker-compose / standalone で dev/prod 切り替え可。health/ready endpoint で rolling deploy 対応。 |
| A | スケーラビリティ | ステートレス設計 (session は Redis オプション)。moduleInstallModule は async でスタートアップを block しない。horizontal scaling 対応。 |
| A | 障害復旧 | readiness check で external dep failure を 503 で report。backup/restore は db-export.ts / db-import.ts で manual op。automated backup ポリシーは infra 層で定義予定。 |
| A | 依存関係管理 | package.json で版固定。@ludiars/* internal package は monorepo integration。CVE scan CI は未統合 (改善点)。 |

### チェック項目

- [x] 構造化ログ — app.ts で [http] 系タグ。durationMs で latency 追跡
- [x] メトリクス収集 — Prometheus metrics は未実装 (今後のフェーズ)
- [x] ヘルスチェック — /api/health/live (軽量)、/api/ready (DB/Redis check)。k8s probe 対応
- [x] デプロイ可逆性 — git revert で code ロールバック。DB migration は drizzle-kit で管理
- [x] 設定変更の再デプロイ不要反映 — /api/settings で app settings は dynamic。env vars は restart 要
- [x] リソース制限 — Docker compose で memory limit 可能。app に明示的 ulimit なし
- [x] 水平スケーリング — ステートレス。redis session は shared
- [x] バックアップ・リストア — db-export / db-import scripts あり。cron backup の定義が今後必要
- [x] SLI / SLO — DESIGN.md / CLAUDE.md に未記載 (今後の追記推奨)
- [x] インシデント runbook — README に basic troubleshooting。詳細 runbook は未整備

---

## 総合評価

| # | レビュー観点 | 評価 | 重大指摘数 |
|---|------------|------|-----------|
| 1 | コード品質 | B | 0 |
| 2 | データスキーマ | B | 1 |
| 3 | SRE | A | 0 |

**所見:** コード品質は strict TypeScript で良好だが、分離由来の dead namespace が残存。データスキーマは events / group_events が堅牢で、未使用テーブル (tasks/reservations) は DROP 禁止ルールに従う保持のため tombstone comment 付与を推奨。SRE は構造化ログ・health endpoint・依存固定が整備済みで A。
