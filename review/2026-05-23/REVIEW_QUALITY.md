# 品質保証レビュー — Schedula (2026-05-23)

## 1. テスト戦略 (A)

| 評価 | 観点 | 所見 |
|------|------|------|
| A | unit | tests/api/* 18 ファイル、133 テスト。health/auth/event CRUD covering |
| B | integration | DB 操作テストあり (repository pattern)、cross-module (event + calendar) 連携テスト薄い |
| B | E2E | 無し、React 19 と統合 E2E absent |
| A | エッジケース | timezone edge case / negative timestamp 等は spec/features.md に list |
| A | CI 自動実行 | npm run ci-check (4 stage) + GH Actions ※現在 disabled (ca3b693) |

## 2. ライセンス遵守 (A)

| 依存 | ライセンス |
|------|----------|
| Hono | MIT |
| Drizzle | Apache 2.0 |
| React | MIT |
| @ludiars/* | MIT (internal) |

LICENSE = MIT。 NOTICE / THIRD_PARTY_LICENSES 未作成 (バンドル配布時必須)。

## 3. ドキュメント完備性 (B)

| 評価 | 観点 |
|------|------|
| A | README: setup / env / npm scripts 完全 |
| B | DESIGN.md: text のみで図なし、module relationships diagram 要 |
| B | API リファレンス: spec/core/*/spec.md fragment、OpenAPI/Swagger 未生成 |
| A | inline コメント: repository/loader.ts adequate |
| B | CONTRIBUTING/ランブック: CLAUDE.md 完備、incident runbook 別途要 |

## 4. パフォーマンス (C)

- SLI/SLO 未定義
- 負荷試験 absent (k6/locust setup なし)
- profiling 未統合
- リグレッション検知: CI disabled、現在 detection 機構なし
- N+1 query risk (calendar listing) 未対策

## 5. クロスプラットフォーム (A)

- Node.js v22+ pinned (.nvmrc)、Drizzle で PostgreSQL/MySQL dialect 抽象化
- React 19 + Vite、Safari/Chrome/Firefox 対応 (legacy IE 非対応)
- ISO 8601 (RFC 3339)、UTF-8、UTC ベース
- package-lock.json pinned (Dockerfile base image 要確認)
