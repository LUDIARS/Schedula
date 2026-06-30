# Schedula コードレビュー — REVIEW (2026-05-22)

## 対象情報

| 項目 | 値 |
|------|-----|
| リポジトリ | LUDIARS/Schedula (短縮コード: Sc) |
| 対象ブランチ | feat/split-from-actio |
| 最新コミット | e00c4cc (docs: spec/features.md に機能リストを追加) |
| レビュー実施日 | 2026-05-22 |
| プロジェクトスタイル | Web サービス (Hono + React + Drizzle ORM) |

Schedula は 2026-05-20 に Actio から clone-and-prune による分離を開始、P2 (タスク系コード除去) を完了した予定 (Event) / カレンダー管理基盤。

---

## 総合評価表 (16 項目)

| # | レビュー観点 | 区分 | 評価 | 重大指摘数 | 主要所見 |
|---|------------|------|------|-----------|---------|
| 1 | 設計強度 | 共通 | A | 0 | clone-and-prune による責務明確化・単一化成功 |
| 2 | 設計思想の一貫性 | 共通 | A | 0 | Actio clone からの移植コードが一貫。プラグインアーキテクチャに統一 |
| 3 | モジュール分割度 | 共通 | B | 1 | modules/ 構成は適切。SDK モジュールと core モジュールの分け方に曖昧さ (Phase 4 確定) |
| 4 | コード品質 | 共通 | A | 0 | TypeScript strict 有効。unused import なし。any 型 12 個は全て disable コメント付き |
| 5 | コードレベル脆弱性 | 共通 | A | 0 | パストラバーサル・コマンドインジェクション・デシリアライゼーション脆弱性なし |
| 6 | テスト戦略・カバレッジ | 共通 | B | 1 | 18 個の .test.ts。新規モジュールのテストが不完全。coverage 計測なし |
| 7 | ライセンス遵守 | 共通 | A | 0 | MIT 明記。直接依存 35 個すべて互換性確認済み (MIT/Apache) |
| 8 | ドキュメント完備性 | 共通 | A | 0 | README・DESIGN・CLAUDE・spec/features.md 充実 |
| 9 | 機能改善 | 共通 | — | | REVIEW_MISSING_FEATURES.md 参照 |
| 10 | 不足機能 | 共通 | — | | REVIEW_MISSING_FEATURES.md 参照 |
| 11 | Web 脆弱性 | Web | A | 0 | SQLi: Drizzle parameterized。XSS: React escaping。CSRF: SameSite=Lax + httpOnly |
| 12 | ゼロトラスト | Web | B | 1 | Cernere ID cache で認可検証。マイクロセグメンテーション・管理操作監査が未実装 |
| 13 | セキュリティ強度 | Web | A | 0 | JWT HMAC-SHA256。bcryptjs。TLS 強制 (HSTS)。CSP・セキュリティヘッダ設定 |
| 14 | データスキーマ | Web | B | 1 | 正規化適切。tasks / pm_* テーブルは Actio 分離後の未使用 (残置はルール遵守) |
| 15 | SRE | Web | B | 1 | 構造化ログ、ヘルスチェック稼働。Blue-Green 未実装 |
| 16 | パフォーマンス・ベンチマーク | Web | B | 0 | Redis セッション cache。N+1 回避。負荷テスト結果なし |

**加重評価:** A (設計・セキュリティが堅牢、運用整備が課題)
**重大指摘数:** Critical 0 / High 3 (audit log、API rate limiting、event recurrence)

## 評価基準

- **A**: 問題なし。ベストプラクティスに準拠
- **B**: 軽微な改善点あり。運用上の影響は低い
- **C**: 改善が必要。リリース前の対応を推奨
- **D**: 重大な問題あり。即時対応が必要

## 総括

Schedula は Actio 分離直後の状態であり、概ね堅牢・明確な設計である。clone-and-prune 方式により既存実装との高い互換性を保ちつつ、予定 (Event) コアに責務を集中させた。改善点は運用整備領域 (テストカバレッジ計測、admin 監査ログ、API rate limiting、event recurrence support) に集中。

## 関連ドキュメント

- [REVIEW_DESIGN.md](REVIEW_DESIGN.md) / [REVIEW_VULNERABILITY.md](REVIEW_VULNERABILITY.md) / [REVIEW_IMPLEMENTATION.md](REVIEW_IMPLEMENTATION.md) / [REVIEW_MISSING_FEATURES.md](REVIEW_MISSING_FEATURES.md) / [REVIEW_QUALITY.md](REVIEW_QUALITY.md) / [AUTOFIX.md](AUTOFIX.md)
