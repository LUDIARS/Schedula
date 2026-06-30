# Schedula コードレビュー — REVIEW_MISSING_FEATURES (2026-05-22)

| 項目 | 値 |
|------|-----|
| リポジトリ | LUDIARS/Schedula |
| 対象ブランチ | feat/split-from-actio |
| レビュー実施日 | 2026-05-22 |
| 最新コミット | e00c4cc |

---

## 1. 機能の改善提案 (Feature Improvement)

| 対象機能 | 改善提案 | 期待効果 | 優先度 |
|---------|---------|---------|--------|
| calendar sync | Google Calendar 変更検知のポーリング周期を短縮 (hourly → 5-10min) | リアルタイム性向上 | Medium |
| event creation | template 機能の拡張 (recurring event・batch create) | 定期予定作成を UI から可視化 | Medium |
| API response | paginate を全 list endpoint に統一 | 大規模データ表示時の UI パフォーマンス改善 | Medium |
| notification | Webhook retry strategy を DLQ (Dead Letter Queue) 方式に | 失敗通知の確実な伝達、再試行ログ可視化 | Medium |
| error message | API error code の統一 (例: EVT_001 = event not found) | error handling の UI 側簡潔化 | Low |
| logging | request-level context (user-agent, IP, module) を追加 | abuse detection 効率化 | Low |

---

## 2. 不足機能の提案 (Missing Feature Proposal)

| 提案機能 | 必要性の根拠 | 実装優先度 | 想定影響範囲 |
|---------|------------|-----------|------------|
| admin audit log | module enable/disable / user role change は監査対象。記録なし | High | audit_logs テーブル新規。api/admin に access log 記録 |
| API rate limiting (共通) | 現在 `/api/setup` のみ。他 endpoint は無制限。brute-force / DoS 対策不完全 | High | 全 API endpoint に token bucket (redis-based) |
| event recurrence | コア「予定」が定期化に未対応。myplan module で部分解決も Event core に統合すべき | High | events schema に recurrenceRule (iCal RRULE format) |
| permission change notification | ユーザーの role 変更が UI にリアルタイム反映されない (最大 30m lag) | Medium | WebSocket broadcast on role update |
| calendar availability query | Aedilis 連携で「空き時間検索」が API 未実装 | Medium | GET /api/events/availability |
| event export (iCal) | ユーザーが予定を他アプリに export できない | Medium | GET /api/events/:id/ical (rfc5545 準拠) |
| custom field support | Module SDK の userData column 宣言が DB schema に未反映 (Phase 2) | Medium | userData schema generation + migration auto |
| performance benchmark CI | 負荷テスト結果が CI に未統合。deployment 前の regression 検知不能 | Low | k6 / autocannon を npm test の一部に |

---

## 総合評価

| # | レビュー観点 | 指摘数 | 優先度別内訳 |
|---|------------|--------|------------|
| 1 | 機能改善 | 6 | High: 0 / Medium: 4 / Low: 2 |
| 2 | 不足機能 | 8 | High: 3 / Medium: 4 / Low: 1 |

**推奨:** Phase 3 (Actio prune) 実施前に、High 優先度 3 項目 (audit log、API rate limiting、event recurrence) を補完。以降 Phase 5 (Aedilis 結線) へ。
