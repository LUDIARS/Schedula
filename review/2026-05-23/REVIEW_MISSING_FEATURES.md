# 不足機能 — Schedula (2026-05-23)

## 機能改善

| 機能 | 改善提案 | 優先度 |
|------|---------|--------|
| event creation API | timezone 形式統一 (ISO 8601 推奨) | Medium |
| Module loader | dynamic import for external npm modules (P4 future) | High |
| WebSocket | heartbeat / keep-alive polling | Medium |
| Error recovery | explicit retry policy + exponential backoff | Medium |
| Audit log | comprehensive state change logging | Low |

## 不足機能

| 機能 | 必要性 | 優先度 |
|------|--------|--------|
| Readiness probe (`/api/readiness`) | k8s liveness/readiness 対応 | High |
| Prometheus exporter | SLO 定義・dashboard 基盤 | High |
| Event state diagram | lifecycle 明確化 | Medium |
| Rate limiting middleware | DoS protection / quota management | Medium |
| Database query optimization guide | EXPLAIN ANALYZE 記録 / slow query log | Low |
