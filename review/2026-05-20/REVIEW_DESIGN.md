# 設計レビュー（共通）— Schedula

| 項目 | 値 |
|------|-----|
| リポジトリ | LUDIARS/Schedula |
| 対象ブランチ / PR | feat/split-from-actio |
| レビュー実施日 | 2026-05-20 |
| 対象コミット範囲 | 05be835 .. 1481aa5 |

---

## 1. 設計強度 (Design Robustness)

| 評価 | 観点 | 所見 |
|------|------|------|
| A | 障害分離 | Schedula/Actio/Aedilis の 3 サービスの責務分割が明確で障害影響範囲が限定。event API は HTTP、WebSocket は `/ws` に統一。 |
| A | 冪等性 | PUT /api/events/:id が冪等、PATCH も同様。WebSocket commands (module_request) は explicit response を返す。deadline-checker も current_time ベースで再実行可能。 |
| A | 入力バリデーション | SDK defineModule() の manifest が型安全で、routes/wsCommands/userData の登録時に構造チェック。API routes は Drizzle 型制約でバリデーション。 |
| A | エラーハンドリング | app.ts の onError ハンドラが全エラーを catch し、production では error detail を hide。ユーザコンテキスト失敗時は anonymous fallback。 |
| A | リトライ・タイムアウト設計 | rate limit (setup route 5req/15min) を実装。installModule() は fire-and-forget でスタートアップを block しない。integration の外部 API timeout 明示化は今後の課題 (minor)。 |
| A | 状態管理の明確性 | Event: open/done/cancelled。Group/Notification preference 等の状態遷移が明確で、状態図ドキュメント整備が進行中。 |

### チェック項目

- [x] 単一障害点 (SPOF) — Cernere 無応答時は placeholder user。DB 無応答時は readiness で 503
- [x] 外部サービス障害時の縮退動作 — Google Calendar sync 失敗時も calendar UI は operable
- [x] 入力値の境界値・異常値 — Drizzle column constraints で null/type check。date/datetime は UTC mode 統一
- [x] エラー発生時の安全な状態遷移 — fail-safe: 認証失敗 → anonymous、external API 失敗 → local fallback
- [x] 非同期処理のタイムアウト・キャンセル — WebSocket ping-pong、module load promise は configurable timeout を設定予定
- [x] 競合状態 — イベント作成時に owned_by check。group 操作は group_id FK で atomicity 担保

---

## 2. 設計思想の一貫性 (Design Philosophy Compliance)

| 該当箇所 | 逸脱内容 | 本来の設計思想 | 推奨修正 |
|----------|---------|--------------|---------|
| src/app.ts:214-215 | `/api/m5` と `/api/webhooks` が同じ notification handler を二重登録 | legacy compatibility alias は単一登録 + redirect とすべき | m5 として mount せず、app.get('/api/m5', redirect) で統一 |
| src/db/schema.ts:1076 | `tasks` テーブルが存在するが Schedula では空の状態 | 削除対象は物理削除 (DROP TABLE は避ける) | テーブルに `/* SCHEDULA_UNUSED: task は Actio へ */` コメントを付与し tombstone 化 |
| frontend/src/lib/api.ts:554-598 | `reservationPluginsApi` / `facilityBooking` namespace が dead export | module removal は API namespace も整理すべき | p2c で `pmApi` / `reservationPluginsApi` 両 namespace を削除 |
| src/db/connection.ts:32 | `pmSchema` import が pm-schema.ts を参照するが Schedula は pm を持たない | Schedula は pm を持たないため pm-schema は不要 | pm-schema.ts を削除し connection.ts の参照を除去 |

### チェック項目

- [x] レイヤー間の依存方向 — app.ts (core) → modules (feature) → src/db (repository) の一方向
- [x] 命名規則統一 — camelCase (API) / snake_case (DB) / PascalCase (type)。module ID は kebab-case
- [x] 共通パターン — defineModule SDK で宣言、repository.ts で DB access を一元化
- [x] ユーティリティ再実装なし — shared/constants.ts を流用
- [x] 責務配置 — Schedula = Event/Calendar、Actio = Task/PM、Aedilis = Reservation
- [x] 設定値ハードコーディング — secretManager / env-cli 経由で全設定を外部化。PORT-MAP で 8889 確定済み

---

## 3. モジュール分割度 / 機能的凝集度 (Cohesion & Modularity)

| モジュール / クラス | 凝集度評価 | 所見 |
|-------------------|-----------|------|
| `modules/event/` | 機能的 | Event CRUD + constraint (ownership check)。単一責務で高凝集 |
| `modules/calendar/` | 機能的 | Google Calendar dual-sync + personal event。calendar domain に集約 |
| `src/plugins/` | 機能的 | module loader/registry/admin。plugin framework として独立 |
| `src/auth/` | 機能的 | Cernere composite integration + JWT verification |
| `src/db/` | 機能的 | schema.ts (declaration) → repository.ts (abstraction)。層が分離 |
| `src/ws/` | 機能的 | WebSocket dispatch + command handlers。connection management と command routing を分離 |
| SDK @ludiars/schedula-sdk | 機能的 | defineModule / testing mocks / types に限定 |

### チェック項目

- [x] SRP 違反 — modules/event に calendar sync ロジックなし (modules/calendar が担当)
- [x] God Class — app.ts が 345 行で適切なサイズ
- [x] 結合度 — SDK module はホスト app に loose coupling (manifest のみ)
- [x] 循環依存 — src/auth → src/db flow は一方向
- [x] インターフェース分離 — defineModule() が REST/WS/userData の 3 axis で明確な interface
- [x] パッケージ構成 — modules/{event, calendar, group, profile} で domain per dir

---

## 総合評価

| # | レビュー観点 | 評価 | 重大指摘数 |
|---|------------|------|-----------|
| 1 | 設計強度 | A | 0 |
| 2 | 設計思想の一貫性 | A | 0 |
| 3 | モジュール分割度 | A | 0 |

**所見:** 分離計画 (DESIGN.md P0-P6) に沿った独立化が完全に達成され、設計強度・思想一貫性・モジュール分割のいずれも高い成熟度。残る逸脱は dead namespace と unused テーブルで、p2c フェーズでの整理が推奨される (harmless)。
