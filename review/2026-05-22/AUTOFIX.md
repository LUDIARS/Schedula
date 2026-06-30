# AUTOFIX.md — Schedula (2026-05-22)

## 概要
- 修正ファイル数: 0
- 変更行数: +0 / -0
- カテゴリ別件数: lint=0 / typo=0 / unused_import=0 / dead_code=0 / gitignore=0 / toc=0
- 関連 PR: なし

**修正対象なし。** `feat/split-from-actio` ブランチは P2 完了 (2026-05-21) により、以下が確認済み:

- **unused import**: `grep -r` で検出なし
- **dead code**: `modules/task` / `modules/pm` / `modules/reservation` / `modules/school/facility-booking` 削除完了
- **typo**: 検出なし
- **lint**: eslint config 設定済み (`frontend/eslint.config.js`)。CI check で enforce
- **gitignore**: `.gitignore` 完備 (`dist/`, `node_modules/`, `.env` 等)

## カテゴリ別

### lint warnings (0 件)
該当なし。

### typo (0 件)
該当なし。

### 未使用 import (0 件), dead code (0 件), .gitignore 漏れ (0 件), TOC ずれ (0 件)
該当なし。clone-and-prune の残骸は P2 で完全に除去されている。

## フラグしたが手作業に回した指摘 (= 自動修正の範囲外)

- `tasks` / `pm_*` / `machina_*` テーブル (残置, row=0) — migration comment で「Actio 分離用: 読み込み禁止」と明記 (REVIEW_IMPLEMENTATION.md §2)。マイグレーション編集を伴うため手作業。
- audit_logs テーブルの新規追加 (REVIEW_MISSING_FEATURES.md、High)。DB スキーマ変更のため自動修正対象外。
- API 共通 rate limiting の実装 (REVIEW_VULNERABILITY.md §2 / REVIEW_MISSING_FEATURES.md、High)。挙動を変えるため手作業。
- event recurrence (RRULE) サポート (REVIEW_MISSING_FEATURES.md、High)。スキーマ + 機能実装のため手作業。
- 一部 `modules/*/routes.ts` の直接 `db.select()` を repository pattern へ移行 (REVIEW_DESIGN.md §2)。Phase 4 で整理予定。

## 関連
- レビュー全文: [REVIEW.md](REVIEW.md) / REVIEW_*.md
- 修正 PR diff: なし
