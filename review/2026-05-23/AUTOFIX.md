# AUTOFIX — Schedula (2026-05-23)

## 概要

- 修正ファイル数: 0
- 変更行数: +0 / -0
- カテゴリ別件数: lint=0 / typo=0 / unused_import=0 / dead_code=0 / gitignore=0 / toc=0 / critical_high=0
- 関連 PR: なし

**修正対象なし**: 本周期 2 commits (P1 clone + CI workflow 撤去) は意図的な暫定対応であり、機械的 fix を後追いすると P4 移行と干渉する。React Hook lint warning (4 件) は単純な変更だが、useCallback dependency 修正は再レンダリング挙動を変えうるため bounded fix としては不安全 (テスト追補が必要)。

## カテゴリ別

該当なし。

## フラグしたが手作業に回した指摘

- `frontend/src/contexts/AuthContext.tsx:184` — Low — useCallback dependency に completeLogin 追加。再レンダリング挙動の検証が必要 — REVIEW_VULNERABILITY.md §1
- `frontend/src/pages/{Dashboard,DbViewerPage,ModuleManagementPage}.tsx` — Low — useEffect setState 最適化。同上 — REVIEW_VULNERABILITY.md §1
- `.github/workflows/test.yml` — High — CI 復元。P4 dependency resolution (GitHub Packages access) と要相談 — REVIEW_QUALITY.md §1
- `/api/readiness` (新規) — High — Readiness probe 追加。k8s infra PR と連携必要 — REVIEW_MISSING_FEATURES.md
- API OpenAPI schema 生成 — Medium — spec/core/*/spec.md → Swagger UI 自動化設計 — REVIEW_QUALITY.md §3
- `NOTICE / THIRD_PARTY_LICENSES` — Medium — 配布前提決定後に追加 — REVIEW_QUALITY.md §2

## 関連

- レビュー全文: REVIEW.md / REVIEW_*.md
