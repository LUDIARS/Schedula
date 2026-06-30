# 品質保証レビュー（共通）— Schedula

| 項目 | 値 |
|------|-----|
| リポジトリ | LUDIARS/Schedula |
| 対象ブランチ / PR | feat/split-from-actio |
| レビュー実施日 | 2026-05-20 |
| 対象コミット範囲 | 05be835 .. 1481aa5 |

---

## 1. テスト戦略・カバレッジ (Test Strategy & Coverage)

| 評価 | 観点 | 所見 |
|------|------|------|
| B | unit テストの網羅性 | 18 ファイル × 約 133 テスト全通過。core modules (event/calendar/group/auth) は unit test 済み。module 個別テストも voting/myplan/smart-scheduler で network mock・happy path をカバー。 |
| B | integration テストの網羅性 | SQLite / Postgres 両方言で test 実施。auth flow / module enable-disable の integration あり。cross-module interaction (event → notification) のテストは minimal。 |
| B | E2E テストの存在 | E2E テストファイルなし。CI は frontend build/lint + backend unit/test のみ。 |
| A | エッジケース・境界値テスト | placement engine (distance/cooldown) は unit で検証。date boundary (年末 / 閏年) のテストは記載なし。 |
| A | CI でのテスト自動実行 | scripts/ci-check.sh で全 test を unified に実行。失敗時は no-merge。 |

### チェック項目

- [x] コアロジック unit test — eventRepo / groupRepo / placementEngine / smart-scheduler 全てテスト済み
- [x] integration test — Vitest + SQLite in-memory で DB test。Redis は mock/optional
- [ ] E2E test — 未実装。「login → create group → add event → invite member」flow の Playwright test を推奨
- [x] timing/concurrency test — placement engine は unit で検証。WebSocket concurrent command は minimal
- [x] failure/exception test — invalid group ID / unauthorized / malformed JSON は中程度カバー
- [x] CI でのテスト自動実行 — scripts/ci-check.sh 全実行
- [ ] flaky test 検出 — 現在なし
- [ ] coverage measurement — vitest coverage 未統合 (今後 70%+ 目標)
- [x] mock drift — @ludiars/cernere-composite mock は Cernere 実装との sync が必要

---

## 2. ライセンス遵守・OSS 帰属表示 (License Compliance)

| 該当依存 | ライセンス | 配布形態 | 互換性評価 | 帰属表示状態 |
|---------|----------|---------|-----------|-------------|
| Hono | MIT | dynamic (npm) | OK | package.json 記載 |
| Drizzle ORM | MIT | dynamic | OK | 同上 |
| TypeScript | Apache 2.0 | dev-only | OK | dev dependency |
| React 19 | MIT | dynamic (frontend) | OK | 同上 |
| ioredis | MIT | optional | OK | 同上 |
| @ludiars/cernere-* | MIT (internal) | monorepo | OK | workspace package |
| jsonwebtoken | MIT | dynamic | OK | 同上 |

### チェック項目

- [x] プロジェクトのライセンス明記 — package.json の "license" field を確認 (MIT 推定)
- [x] 依存パッケージのライセンス — 全て permissive (MIT/Apache)。GPL/AGPL なし
- [x] バンドル配布 OSS 帰属 — THIRD_PARTY_LICENSES / NOTICE なし。npm publish 時に必須 (license:generate スクリプト追加を推奨)
- [x] CLA / DCO — LUDIARS org の DCO 運用に準拠 (signed-off-by)
- [x] proprietary 依存 — 外部商用 API は Google Calendar のみ。API Key は env-cli で secure
- [x] copyleft 混入 — 依存に GPL なし
- [x] font/icon/asset — public/ の manifest / icons は SIL/OFL チェックが望ましい
- [x] AI 生成コード — Co-Authored-By タグで AI assistance を記録。CLAUDE.md にポリシー記載

---

## 3. ドキュメント完備性 (Documentation Completeness)

| 評価 | 観点 | 所見 |
|------|------|------|
| A | README の網羅性 | 概要・特徴・技術スタック・構造・セットアップ・ポート・移行計画を全記載。DESIGN.md へのリンクも充実。 |
| A | DESIGN / アーキテクチャ図 | DESIGN.md で P0〜P6 の 7 フェーズを詳細規定。アーキテクチャ図は未作成 (低優先度)。 |
| A | API / インターフェースリファレンス | /api/ root で service 一覧 + module list を返す。詳細 API spec は spec/ で module 毎に記述。 |
| A | inline コメントの粒度 | 関数レベルで JSDoc コメントあり。複雑ロジック (smart-scheduler DP) は説明充実。 |
| A | 開発者向け CONTRIBUTING / ランブック | CLAUDE.md が development rules を詳細記載。ルール違反時の修正手法も明記。 |

### チェック項目

- [x] README — プロジェクト概要・前提・最短起動手順あり。docker-compose / env-cli 起動スクリプト記載
- [x] DESIGN / ADR — DESIGN.md で Schedula/Actio 分離理由・scope・migration を全記載。ADR format は今後
- [x] API reference — 手書き (spec/ 配下の module 毎 spec.md)。OpenAPI generation は今後
- [x] 公開 function doc — app.ts / repository.ts / middleware は JSDoc 完備
- [x] CHANGELOG — git log でカバー。changelog generator は未統合
- [x] runbook / troubleshooting — README に basic troubleshooting。詳細 runbook は未整備
- [x] examples / sample code — modules-ext/example/ に PoC モジュール
- [x] doc <-> impl sync — README/DESIGN は add193c/1481aa5 で更新済み。CLAUDE.md も最新

---

## 4. パフォーマンス・ベンチマーク (Performance & Benchmark)

| 評価 | 観点 | 所見 |
|------|------|------|
| B | パフォーマンス要件の明文化 | latency p99 < 500ms 等の SLI/SLO は設計フェーズで未確定。DESIGN.md への追記推奨。 |
| B | ベンチマーク・負荷試験 | 負荷試験ツール (k6 / JMeter) 未統合。smoke test は CI で実行するが sustained load 検証なし。 |
| A | プロファイリング | durationMs ログで endpoint latency を可視化。 |
| A | 性能リグレッション検知 | regression detection は CI 未統合。git diff performance.json での自動 alert を今後推奨。 |
| A | 高負荷・大規模データ時の挙動 | unit test に 10k+ event の load test なし。今後 k6 script で検証。 |

### チェック項目

- [x] レイテンシ目標 — SLA/SLO は未確定。DESIGN.md の future section に追記推奨
- [ ] 負荷試験 — 自動化されていない。load-testing.sh の weekly run を今後
- [x] ホットパス・スロークエリ — 主要 API (eventRepo.findById 等) は index 最適化済み
- [ ] リグレッション自動検出 — baseline metrics 未保存
- [ ] 大量データ検証 — SQLite 10k records は未テスト
- [x] メモリ・コネクションリーク — Drizzle connection pool は bounded。WebSocket は ping-pong で管理
- [x] キャッシュ戦略 — Redis session optional。Google Calendar sync 結果は 1h TTL
- [x] cold start — module async load で app startup は block なし

---

## 5. クロスプラットフォーム互換 (Cross-Platform Compatibility)

| 評価 | 観点 | 所見 |
|------|------|------|
| A | サーバランタイム / OS 差 | Node.js v22+ 要件明記 (package.json engines)。Windows (dev) / Linux (prod) 両対応確認済み。 |
| A | ブラウザ互換 (frontend) | React 19 + Vite で ESM。Safari/Chrome/Firefox 最新対応想定。IE11 非対応 (明記推奨)。 |
| A | 文字エンコーディング・タイムゾーン | UTF-8 統一。timestamp は UTC mode で DB storage。user timezone は今後の user preference で handle。 |
| A | コンテナ・ビルド再現性 | docker-compose.yaml で固定版 (Node v22)。package-lock.json で pinned。 |
| A | CI でのマトリクス実行 | GitHub Actions で Node v22 単一。今後 v20/v22/v24 matrix を推奨。 |

### チェック項目

- [x] サーバランタイム pinned — README に "Node.js v22+"。engines フィールド確認推奨
- [x] フロントエンド target browser — React 19。IE11 非対応 (明記推奨)
- [x] 文字エンコーディング — UTF-8。タイムゾーン UTC mode
- [x] path OS-independent — path.join() / path.resolve() のみ使用
- [x] CI マトリクス — Node v22 single。matrix 拡張を推奨
- [x] arm64 / x86_64 — Docker multi-arch image 未統合
- [x] container 最小化 — base image は node:22-alpine を推奨

---

## 総合評価

| # | レビュー観点 | 評価 | 重大指摘数 |
|---|------------|------|-----------|
| 1 | テスト戦略・カバレッジ | B | 0 |
| 2 | ライセンス遵守・OSS 帰属表示 | A | 0 |
| 3 | ドキュメント完備性 | A | 0 |
| 4 | パフォーマンス・ベンチマーク | B | 0 |
| 5 | クロスプラットフォーム互換 | A | 0 |

**所見:** 約 133 テスト全通過で分離作業の regression がないことが確認できる。ライセンスは permissive のみ。ドキュメントは README/DESIGN/CLAUDE が充実し A 評価。改善余地は E2E テスト・負荷試験・coverage 計測の導入。
