# 不足機能評価（共通）— Schedula

| 項目 | 値 |
|------|-----|
| リポジトリ | LUDIARS/Schedula |
| 対象ブランチ / PR | feat/split-from-actio |
| レビュー実施日 | 2026-05-20 |
| 対象コミット範囲 | 05be835 .. 1481aa5 |

---

## 1. 機能の改善提案 (Feature Improvement)

| 対象機能 | 改善提案 | 期待効果 | 優先度 |
|---------|---------|---------|--------|
| Event CRUD API | event 作成時に重複・競合チェック (同時刻に同ユーザの予定がないか confirm dialog 表示) | 誤作成防止、batch import 時の validation 強化 | Medium |
| Module Installation | installModule() の async awaiter を createApp() 内で逐次実行し、失敗時に app start を fail (現在 fire-and-forget) | 依存モジュール未ロード時の silent failure 防止 | Medium |
| Frontend chunk size | vite build warning「chunks > 500kB」の code-split 最適化 (lazy import defineModule) | 初期ロード時間短縮 | Low |
| Notification aggregation | deadline approaching の複数通知を bundle | 通知疲労軽減 | Low |

---

## 2. 不足機能の提案 (Missing Feature Proposal)

| 提案機能 | 必要性の根拠 | 実装優先度 | 想定影響範囲 |
|---------|------------|-----------|------------|
| E2E Test Suite | CI で frontend smoke test (Playwright) が未実装。P2 完了前に login → create group → add event flow の自動検証が必要 | High | tests/, .github/workflows/ |
| Prometheus Metrics | durationMs はログ記録されるが alerting 用 metrics (event_create_latency_p99 等) がない。SRE 運用に必須 | High | src/middleware/metrics.ts (新規) + prometheus exporter |
| Advanced RBAC | role は "admin" / "general" のみ。resource-level permission が Aedilis 連携時に必須 | High | db schema: permissions table + middleware gate |
| API Documentation (OpenAPI) | spec/ の Markdown は手書き。Swagger UI / ReDoc で interactive docs 生成が運用効率化 | Medium | schema → openapi.yaml 自動生成 |
| Audit Log Retention Policy | activity log は append-only だが保持期間・rotation ポリシーがない | Medium | db: log_rotation_config + cron job |

---

## 総合評価

| # | レビュー観点 | 指摘数 | 優先度別内訳 |
|---|------------|--------|------------|
| 1 | 機能改善 | 4 | High: 0 / Medium: 2 / Low: 2 |
| 2 | 不足機能 | 5 | High: 3 / Medium: 2 / Low: 0 |

**所見:** 最優先は E2E テスト・Prometheus metrics・Advanced RBAC。前 2 者は P2 完了の品質ゲート、RBAC は Aedilis 結線 (P5) の前提となる。
