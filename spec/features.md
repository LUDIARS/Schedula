# Schedula 機能リスト

LUDIARS の **予定 (Event) / カレンダー管理基盤**。 2026-05-20 に Actio から
予定軸を再分離して復活したリポジトリ。 タスク管理は Actio の領分。

> 注: P4 (モジュール配置、 DESIGN.md §6.2) は設計確定済・実装未。 本リストは
> 機能の所在を示すもので、 リポジトリ配置は P4 完了後に確定する。

## コア

| 機能 | 説明 | API |
|---|---|---|
| 予定 (Event) | 時間拘束のある未来の事象 (MTG・講義) の CRUD | `/api/events` |
| カレンダー | Google Calendar 連携 + 手動予定 + 月表示 | `/api/calendar` |
| バッティング検知 | 同一時間帯の予定衝突を警告 | (calendar 内) |
| Event プラグイン基盤 | 機能を Event の plugin として拡張登録 | `src/event-plugins.ts` |

## 予定系モジュール (P4 で Schedula core 内包予定)

| 機能 | 説明 | API |
|---|---|---|
| マイプラン | 週間ルーティーンの登録・展開 | `/api/myplans` |
| 自動配置スケジューラ | DP による予定の自動配置 | `/api/smart-scheduler` |
| 休日管理 | 日本の祝日自動取得、 グループ固有の休日・審査会期間 | `/api/holidays` |
| 外部サービス連携 | Google Calendar 同期 / Notion | `/api/integrations` |

## ドメイン特化モジュール (P4 で別リポ化予定)

| 機能 | 説明 | 配置 (P4 後) |
|---|---|---|
| 学校カリキュラム管理 | 学科 / 講師 / カリキュラム CRUD、 時間割展開、 教室割当 | `Schedula-School` |
| 在席シェア (Cocoiru) | opt-in の学校在席共有 | `Schedula-School` 内包 |
| 日程調整 (Voting) | 投票による日程決定 | `Schedula-Voting` |

## その他

| 機能 | 説明 | API |
|---|---|---|
| GPS Placement | 場所登録 + enter/leave トリガーで webhook 発火 | `/api/placement` |
| グループ管理 | グループ / メンバー / グループ予定 | `/api/groups` |
| 通知 | Webhook 通知 | `/api/webhooks` |
| WebPush | PWA プッシュ通知 (Nuntius プロキシ) | `/api/push` |

## 共通基盤 (Actio と複製保持)

- 認証 — Cernere SSO (PASETO V4 / id-cache)。 個人データは Cernere 単一情報源
- モジュール SDK — `@ludiars/schedula-sdk` (`defineModule()`)、 有効/無効を global/group/user スコープで制御
- マルチ DB — SQLite / PostgreSQL / MySQL (Drizzle ORM)
- WebSocket — 破壊的操作は `module_request` 経由、 読み取りは REST
- 外部 API 連携 — API Key 認証 (`/api/external`)
- 設定管理 / シークレット管理 (Infisical) / 操作ログ / DB ビューア / プロフィール

## 担わない (他サービスの領分)

- タスク管理 (Task / PM) → [Actio](https://github.com/LUDIARS/Actio)
- 施設予約 → [Aedilis](https://github.com/LUDIARS/Aedilis)
- カリキュラムの予定決定プロセス → [Calicula](https://github.com/LUDIARS/Calicula) (Schedula は consumer)
