# 設計レビュー — Schedula (2026-05-23)

## 1. 設計強度 (A)

| 評価 | 観点 | 所見 |
|------|------|------|
| A | 障害分離 | イベント軸の単機能化で責務境界明確、Actio と疎結合 (ID 緩参照)。Cernere 委譲で認証分離 |
| B | 冪等性 | WS module_request の破壊操作定義あり、タイムアウト・リトライ機構は未記載 |
| A | 入力バリデーション | Hono + Zod パターン、DB スキーマ制約遵守 |
| B | エラーハンドリング | 共通例外ハンドラ (src/index.ts)、recovery 戦略の詳細化不足 |
| B | リトライ・タイムアウト | Redis/DB connection 制限のみ、WS 再接続は frontend 任せ |
| B | 状態管理 | Event/Task lifecycle (draft→confirmed→cancelled) の状態遷移図未整備 |

## 2. 設計思想の一貫性 (B)

| 該当箇所 | 逸脱内容 | 推奨修正 |
|----------|---------|----------|
| src/app.ts:35-50 | Module SDK import 未整理 | P4 完了まで据え置き |
| frontend/src/lib/modules/index.ts | pm.ts/reservation.ts 削除漏れ参照が若干残存 (export 削除済) | include/export 統一確認 |

## 3. モジュール分割度 (A)

| モジュール | 凝集度 | 所見 |
|-----------|--------|------|
| modules/event/ | 機能的 | コア Event 定義に専念、pluginRef で calendar/myplan/school 拡張可 |
| modules/calendar/ | 機能的 | Google Calendar 連携 + personal event |
| modules/group/ | 機能的 | グループ CRUD/member/schedule |
| src/plugins/loader.ts | 通信的 | installModule/enable/disable/registry が同一ファイル、責務やや重い |
| frontend/src/contexts/AuthContext.tsx | 時間的 | ログイン初期化と state 管理が混在、useCallback dependency lint warning |

責務分離機能的、loader は helper 扱いでスケール時分割容易。
