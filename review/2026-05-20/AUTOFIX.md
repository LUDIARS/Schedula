# AUTOFIX (Schedula — 2026-05-20)

## 概要
- 修正ファイル数: 0
- 変更行数: +0 / -0
- カテゴリ別件数: lint=0 / typo=0 / unused_import=0 / dead_code=0 / gitignore=0 / toc=0
- 関連 PR: なし

**本日は自動修正対象なし。** Actio からの分離 (P0〜P2b) を精査し safe auto-fix 候補を 8 件検出したが、いずれも本日の自動修正対象から除外した。理由は下記の通り — 大半が DESIGN.md で計画済みの **P2c フェーズ (removal sweep)** の作業範囲に属し、進行中のリファクタリングブランチ (feat/split-from-actio) 上で先回り修正すると開発者の計画作業と衝突するため。

## カテゴリ別

### lint warnings (0 件)
- `frontend/src/pages/ModuleManagementPage.tsx` — useEffect 内 setState の react-hooks 警告。修正には useEffect の依存配列・ロジック変更が必要で挙動変更を伴うため、純粋な lint auto-fix の範疇を超える → 手作業

### typo (0 件)
- 該当なし

### 未使用 import (0 件), dead code (0 件), .gitignore 漏れ (0 件), TOC ずれ (0 件)
- 未使用 import / dead namespace (pmSchema / pmApi / reservationPluginsApi) は検出したが、DESIGN.md §P2c (removal sweep) の計画作業範囲。進行中の分離ブランチで先回り修正すると衝突するため P2c に委ねる
- dead code (tasks / reservations テーブル) は DROP TABLE 禁止ルールにより削除不可

## フラグしたが手作業に回した指摘 (= 自動修正の範囲外 / P2c へ委譲)

- `src/db/connection.ts:32` — `pmSchema` の未使用 import (pm module 削除済み)。P2c removal sweep へ (REVIEW_DESIGN.md §2)
- `frontend/src/lib/api.ts:1449-1497` — `pmApi` / `pmProjectRepo` / `pmTaskRepo` の dead namespace。P2c removal sweep へ (REVIEW_IMPLEMENTATION.md §1)
- `frontend/src/lib/api.ts:554-598` — `reservationPluginsApi` / `facilityBooking` の dead namespace。Aedilis 分離後の P2c へ (REVIEW_DESIGN.md §2)
- `src/db/schema.ts:1076` (tasks) / `:212` (reservations) — 未使用テーブル。DROP TABLE 禁止ルールにより削除不可、tombstone comment 付与は手作業 (REVIEW_IMPLEMENTATION.md §2)
- `src/app.ts:214-215` — `/api/m5` と `/api/webhooks` の二重登録。ルーティング整理は手作業 (REVIEW_DESIGN.md §2)
- `frontend/src/pages/ModuleManagementPage.tsx` — react-hooks/set-state-in-effect 警告。挙動変更を伴うため手作業
- `README.md` — プロジェクト構造図に Actio 時代の記述残存。本文書き換えのため手作業 (REVIEW_QUALITY.md §3)

## 関連
- レビュー全文: REVIEW.md / REVIEW_DESIGN.md / REVIEW_VULNERABILITY.md / REVIEW_IMPLEMENTATION.md / REVIEW_MISSING_FEATURES.md / REVIEW_QUALITY.md
- 修正 PR diff: なし
