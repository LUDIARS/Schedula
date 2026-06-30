# Schedula コードレビュー — REVIEW_QUALITY (2026-05-22)

| 項目 | 値 |
|------|-----|
| リポジトリ | LUDIARS/Schedula |
| 対象ブランチ | feat/split-from-actio |
| レビュー実施日 | 2026-05-22 |
| 最新コミット | e00c4cc |

---

## 1. テスト戦略・カバレッジ (Test Strategy & Coverage)

| 評価 | 観点 | 所見 |
|------|------|------|
| B | unit テストの網羅性 | 18 個の .test.ts。core (event / group / calendar) はカバー。新規モジュール (voting / placement / cocoiru) のテスト不完全 |
| B | integration テストの網羅性 | DB + Redis を使用した integration test 実装。Google Calendar API mock の信頼性が不明 |
| B | E2E テストの存在 | smoke test なし。docker-compose で UI までの e2e 検証ツール未構築 |
| A | エッジケース・境界値テスト | 日時境界 (midnight transition)、empty user list 等のテストあり |
| A | CI での自動実行 | `npm run ci-check` で `[1/4] npm test` が実行。失敗時 CI red |

**改善推奨:** coverage 計測で `< 80%` threshold check (statements > 80%, branches > 70%)。

**評価:** B。

---

## 2. ライセンス遵守・OSS 帰属表示 (License Compliance)

| 該当依存 | ライセンス | 配布形態 | 互換性評価 | 帰属表示状態 |
|---------|----------|---------|-----------|-------------|
| hono | MIT | dynamic (npm) | OK | package.json 記載 |
| drizzle-orm | Apache-2.0 | dynamic | OK | package.json 記載 |
| jsonwebtoken | MIT | dynamic | OK | package.json 記載 |
| bcryptjs | MIT | dynamic | OK | package.json 記載 |
| ioredis | MIT | dynamic | OK | package.json 記載 |
| @ludiars/cernere-* | MIT | dynamic | OK (internal) | package.json 記載 |
| @ludiars/schedula-module-* | MIT | dynamic | OK (internal) | package.json 記載 |

- [x] LICENSE ファイル (MIT) 存在
- [x] package.json に `license: "MIT"` 明記
- [x] GPL 等 copyleft 依存なし
- [x] vendor 配布バイナリなし

**評価:** A。

---

## 3. ドキュメント完備性 (Documentation Completeness)

| 評価 | 観点 | 所見 |
|------|------|------|
| A | README の網羅性 | 概要・特徴・tech stack・project structure・setup・clone-and-prune 方式を記載。充実 |
| A | DESIGN / アーキテクチャ図 | DESIGN.md §0-6 で分離戦略・スコープ・既存サービス境界・ポート MAP・移行戦略を詳述 |
| A | API / インターフェースリファレンス | spec/features.md に機能リスト。spec/dbs/*.md に schema doc |
| A | inline コメント粒度 | `src/app.ts` で section comment による区切り。関数内コメント粒度適正 |
| A | 開発者向け CLAUDE.md | 開発ルール・auth・SDK・個人データポリシー・DB access・TypeScript・モジュール修正ルール完全記載 |

**改善推奨:** API endpoint reference の自動生成 (OpenAPI spec) / DB schema diagram (Mermaid)。

**評価:** A。

---

## 4. Web 品質保証観点

### パフォーマンス・ベンチマーク

| 項目 | 状態 | 所見 |
|------|------|------|
| response time | △ | durationMs ログあり。SLA 目標値は未設定 |
| memory leak | ✓ | heapdump on OOM。jest isolation で test memory isolation |
| query efficiency | ✓ | N+1 リスク低い |
| load test | ✗ | k6 / artillery script なし |

**評価: B** — wrk / k6 による baseline benchmark (p50, p95, p99) を推奨。

### クロスプラットフォーム互換

- Node.js v22 (LTS, .nvmrc で pinning) / DB は SQLite/PostgreSQL/MySQL (Drizzle dialect 別) / React 19
- `scripts/ci-check.sh` が bash-only。Windows dev は WSL / Git Bash 推奨。PowerShell batch script なし
- **評価: B**

---

## 総合評価

| # | レビュー観点 | 評価 | 重大指摘数 |
|---|------------|------|-----------|
| 1 | テスト戦略・カバレッジ | B | 1 |
| 2 | ライセンス遵守 | A | 0 |
| 3 | ドキュメント完備性 | A | 0 |
| 4 | パフォーマンス (Web) | B | 0 |
| 5 | クロスプラットフォーム | B | 0 |
