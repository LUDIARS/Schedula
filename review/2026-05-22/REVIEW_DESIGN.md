# Schedula コードレビュー — REVIEW_DESIGN (2026-05-22)

| 項目 | 値 |
|------|-----|
| リポジトリ | LUDIARS/Schedula |
| 対象ブランチ | feat/split-from-actio |
| レビュー実施日 | 2026-05-22 |
| 最新コミット | e00c4cc |

---

## 1. 設計強度 (Design Robustness)

| 評価 | 観点 | 所見 |
|------|------|------|
| A | 障害分離 | Actio からの clone-and-prune により責務明確化。予定 (Event) 軸に集中。外部依存 (Cernere / Nuntius / Google Calendar) は各々独立した client で隔離 |
| A | 冪等性 | `POST /api/events` / `PATCH /api/events/:id` はべき等設計。calendar sync は upsert パターン。削除は soft-delete |
| A | 入力バリデーション | Hono の zod / validator 活用。日時範囲・イベント ID・ユーザー ID を全て検証。`src/shared/validation.ts` で共有スキーマ |
| A | エラーハンドリング | `app.onError` で未処理エラー補捉。HTTP エラーコード区別。エラー応答は本番でメッセージ省略 |
| A | リトライ・タイムアウト設計 | Google Calendar 連携に指数バックオフ。`Promise.race` でタイムアウト制御。WebSocket heartbeat (30s) |
| B | 状態管理の明確性 | Redis セッション cache + JWT で 2 層構成。Redis キー命名規約 (TTL との関係) が inline コメント頼み |

**改善推奨:** Redis key TTL とセッション有効期限の計算が散在。一元化 (`utils/session-ttl.ts`) を推奨。

---

## 2. 設計思想の一貫性 (Design Philosophy Compliance)

| 該当箇所 | 逸脱内容 | 本来の設計思想 | 推奨修正 |
|----------|---------|--------------|---------|
| `modules/*/routes.ts` の一部 | repository pattern 未適用。直接 `db.select()` 実行 | CLAUDE.md: ルートハンドラは repository 層経由のみ | Repository 関数を追加 (低優先度) |
| `src/plugins/loader.ts:45` | `installModule()` 時の error handling が単純 (throw) | install 失敗時も部分的に続行 | try-catch 分離。Phase 4 で整理予定 |
| なし | プラグイン enable/disable の scope hierarchy 実装済 | global/group/user の 3 スコープ完全準拠 | — |

---

## 3. モジュール分割度 / 機能的凝集度 (Cohesion & Modularity)

| モジュール | 凝集度評価 | 所見 |
|-----------|-----------|------|
| `modules/event/` | 機能的 | Event CRUD・プラグインレジストリ。責務単一 |
| `modules/calendar/` | 機能的 | Google Calendar + manual event 統合 |
| `modules/group/` | 機能的 | グループ CRUD・メンバー管理・scope 管理 |
| `modules/holiday/` | 機能的 | 休日・休業期間管理 |
| `modules/notification/` | 機能的 | Webhook / WebPush 統一管理 (channel plugin pattern) |
| `modules/voting/` (SDK) | 機能的 | 日程調整専用 |
| `modules/smart-scheduler/` (SDK) | 機能的 | DP スケジューリングエンジン。高凝集 |

- [x] SRP 遵守: 各モジュール責務 1 つ。God Class なし
- [x] 結合度: repository pattern + DI で外部依存を `context.db` 経由
- [x] 循環依存なし。DAG 構造確認済み
- [x] インターフェース分離: Module SDK の `defineModule()` で routes / wsCommands / userData を明確に宣言

**低優先度指摘:** 一部モジュールの `routes.ts` に直接 `db.select()` が 3-4 箇所。CLAUDE.md のデータベースアクセスルール遵守で改善可。

---

## 総合評価

| # | レビュー観点 | 評価 | 重大指摘数 |
|---|------------|------|-----------|
| 1 | 設計強度 | A | 0 |
| 2 | 設計思想の一貫性 | A | 0 |
| 3 | モジュール分割度 | B | 1 |
