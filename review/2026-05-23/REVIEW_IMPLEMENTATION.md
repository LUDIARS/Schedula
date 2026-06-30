# 実装評価 — Schedula (2026-05-23)

## 1. データスキーマ (A)

| テーブル | 問題種別 | 説明 |
|---------|---------|------|
| events / tasks / pm_* | 保持 (DROP 禁止) | P2 で tasks/pm_* テーブルを削除せず unused 化、AIFormat ルール順守 |
| event / calendar | 正規化 | event primary、calendar.event_id で FK 参照、N:M は eventPlugin registry で吸収 |

正規化妥当、query plan は EXPLAIN ANALYZE で最適化待ち。

## 2. SRE (B)

| 観点 | 状況 | 評価 |
|------|------|------|
| ログ | structured logging (src/logger.ts)、request/trace ID 付与ポリシー未記載 | B |
| メトリクス | Prometheus/StatsD 未実装、timing 計測なし | C |
| ヘルスチェック | `/api/health` 定義、readiness (DB/Redis) は未実装 | B |
| デプロイ | Docker/docker-compose 整備、ロールバック = git revert + deploy | B |
| リソース制限 | Node.js `--max-old-space-size` env のみ、connection pool 明示上限なし | C |
| スケーラビリティ | Redis session で水平 scaling 可、WS は sticky 不要 (stateless) | A |
