# Schedula コードレビュー — REVIEW_IMPLEMENTATION (2026-05-22)

| 項目 | 値 |
|------|-----|
| リポジトリ | LUDIARS/Schedula |
| 対象ブランチ | feat/split-from-actio |
| レビュー実施日 | 2026-05-22 |
| 最新コミット | e00c4cc |

---

## 1. 実装品質 — clone-and-prune 後の死にコード検査

**結論:** P2 (2026-05-21 完了) で主要な Actio タスク系コードは削除済み。schema テーブルは AIFormat 「DROP COLUMN 禁止」ルール遵守により残置。

| 対象 | ステータス | 所見 |
|------|-----------|------|
| `modules/task/` | ✅ 削除済み (P2) | module directory は存在しない (add193c で削除確認) |
| `modules/pm/` | ✅ 削除済み (P2) | pm.ts routes は削除 |
| `modules/reservation/` | ✅ 削除済み (P2) | 途中実装として破棄 |
| `modules/school/facility-booking/` | ✅ frontend 削除完了 (1481aa5) | backend routes は別途確認推奨 |
| `src/task-plugins.ts` | ✅ 削除済み (P2) | grep で「task-plugins」: 0 件 |

### Schema テーブル (残置)

| テーブル | 状態 | 推奨対応 |
|---------|------|---------|
| `tasks` | 残置 (row=0) | migration comment で「Actio 分離用: 読み込み禁止」と明記推奨 |
| `pm_*` (6 テーブル) | 残置 (row=0) | 同上 |
| `machina_*` (3 テーブル) | 残置 (row=0) | 同上 (chat-to-task は Discutere へ移行済) |
| `scheduling_tasks` | 使用中 | 問題なし |

**未使用 import 検査:** `grep -r "import.*task"` → 0 件。import 崩れなし。P2 が完全に完了している。

**評価:** A (clone-and-prune)。死にコードなし。TypeScript strict。

---

## 2. データスキーマの妥当性

| テーブル | 問題種別 | 説明 |
|---------|---------|------|
| `events` | 正常 | Event コア。正規化適正。index (userId, startTime, endTime) |
| `users` | legacy 列混在 | name, email, role, password_hash 等は legacy (Cernere 移管)。nullable 化済。新規コードから読み書き禁止ルール遵守 |
| `module_states` | 正常 | 3 スコープ hierarchy。unique constraint on (moduleId, scopeType, scopeId) |
| `googleCalendarSync` | 正常 | calendar 連携状態。lastSyncAt で incr sync 制御 |
| N+1 リスク | 軽微 | calendar.routes.ts で user batch fetch あり。event list + creator fetch は逐次 → batch 統一推奨 (低優先度) |

**評価:** B。legacy 列残置はルール遵守だが migration comment での明示を推奨。

---

## 3. SRE 観点

| 評価 | 観点 | 所見 |
|------|------|------|
| B | 可観測性 | 構造化ログ (JSON: ts/method/path/status/durationMs/userId/error)。request ID middleware あり。prometheus export なし。トレーシング未実装 |
| B | デプロイ安全性 | health check 検証必須。Blue-Green 未構築。Docker image versioning あり。Canary 未実装 |
| A | スケーラビリティ | ステートレス設計 (session → Redis)。DB connection pool あり。node.js multi-instance 対応。Redis singleton が bottleneck |
| C | 障害復旧 (DR) | DB backup は DBaaS に委譲。Schedula 側 script なし。RTO/RPO 未定義 |
| A | 依存関係管理 | 35 直接依存すべて MIT/Apache。package-lock.json で固定 |

**推奨:** Prometheus exporter 導入 / health endpoint 実装 + graceful shutdown / DESIGN.md に DR section 追加。

---

## 総合評価

| # | レビュー観点 | 評価 | 重大指摘数 |
|---|------------|------|-----------|
| 1 | 実装品質 (clone-and-prune) | A | 0 |
| 2 | データスキーマ | B | 1 |
| 3 | SRE | B | 1 |
