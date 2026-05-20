# Schedula — 設計書 (draft v0.1 / 復活)

> Schedula は元々 LUDIARS の予定管理基盤で、 2026-03 に Actio に rename された。 2026-05-20、 Actio が「タスク + 予定」 の 2 概念を抱えて肥大化したため、 **予定 (Event) / カレンダー軸を Schedula として再分離** することを決定。 Actio は「タスク管理」 に専念する。

## 0. なぜ分けるのか

Actio は JIRA 流に「コア 2 概念 = 予定 (Event) + タスク (Task)」 を 1 サービスに同居させ、 周辺に 16 モジュールがぶら下がる構成だった。 これにより:

- 「予定」 と 「タスク」 でライフサイクル・UI・連携先がほぼ別物なのに 1 リポに混在
- 新サービス Aedilis ([[../Aedilis/DESIGN.md]]) がカレンダーに連結するとき、 依存先が「タスクも持つ大きな Actio」 になり境界が曖昧
- Calicula はカリキュラム「予定」 の consumer なのに「Actio」 を相手にしていた

責務を「いつ起きるか (Schedula)」 と 「何を解決するか (Actio)」 に割り、 各々を単機能化する。 Hub (Memoria Hub Shell) で統合表示する前提なら、 サービス単機能化はそのまま pane 構成の単純化につながる。

| | **Schedula** (本リポ) | **Actio** (分離後) |
|---|---|---|
| コア概念 | 予定 (Event) — 時間拘束のある未来の事象 | タスク (Task) — 解決すべき事象、 deadline + requirements |
| 代表 API | `/api/events` | `/api/tasks` |
| 連携 | Google Calendar / Aedilis / Calicula | GitHub / Notion (PM) / Discutere |
| 短縮コード | **Sc** | At / A |

## 1. スコープ

### 1.1 Schedula が持つ (Actio から移植)

| 対象 | 元 Actio パス | 区分 |
|---|---|---|
| コア「予定」 | `modules/event/` | コア |
| Google Calendar 連携 | `modules/calendar/` | モジュール |
| 週間ルーティーン | `modules/myplan/` | モジュール |
| 自動配置スケジューラ | `modules/smart-scheduler/` | モジュール |
| 休日・休業期間管理 | `modules/holiday/` | モジュール |
| カリキュラム配置 | `modules/schedule/` | モジュール |
| 学校カリキュラム | `modules/school/` (facility-booking を除く) | モジュール |
| 日程調整 (Voting) | `modules/voting/` | モジュール |
| GPS placement | `modules/placement/` | モジュール |
| Event プラグイン基盤 | `src/event-plugins.ts` | フレームワーク |

### 1.2 Actio に残す

- コア「タスク」 `modules/task/`
- PM (GitHub/Notion 同期) `modules/pm/`
- Task プラグイン基盤 `src/task-plugins.ts`

### 1.3 Aedilis へ移す (Schedula にも Actio にも残さない)

- 施設予約 `modules/school/facility-booking/` → [[../Aedilis/DESIGN.md]]
- 予約プラグイン基盤 `src/reservation-plugins.ts` → Aedilis の `FacilitySource` 抽象に吸収
- 途中実装 `modules/reservation/` → 破棄 (2026-05-20 確定)

### 1.4 両サービスに複製する共通基盤

`src/auth/` (Cernere) / `src/db/` (repository + dialects) / `src/plugins/` (loader/registry) / `src/ws/` / `src/session/` (Redis) / `modules/group/` / `modules/profile/` / `modules/settings/` / `modules/notification/` / `packages/sdk/` のコア (`defineModule` 等)。

> 共通基盤の重複は将来 `@ludiars/schedula-sdk` (または分離後の共有パッケージ) に切り出して解消する余地を残す。 v0.1 では複製で割り切る。

## 2. 既存サービスとの境界

| サービス | 関係 |
|---|---|
| **Actio** | 兄弟。 タスクが予定に紐づく場合 (例: 会議準備 task)、 連携は Hub 層 or 相互 REST。 v0.1 では疎結合 (お互い相手の ID を緩く参照) |
| **Aedilis** | 施設予約サービス。 Schedula を「カレンダー provider」 として叩く。 予約 confirm → Schedula に event 作成 |
| **Calicula** | カリキュラム決定の権威。 決定済みカリキュラムを Schedula が consume し、 日次スケジュール / 教室割当に展開 |
| **Cernere** | 認証。 PASETO V4 / id-cache |
| **Nuntius** | 予定リマインダーの shadow write |
| **Google Calendar** | 外部カレンダー双方向連携 |

## 3. Aedilis 連結インタフェース

Aedilis ([[../Aedilis/DESIGN.md]] §3.3 / §8) は `CalendarProvider` 抽象の `actio` 実装を **`schedula` 実装に差し替える**。 Schedula が公開すべき API:

| Method | Path | 用途 |
|---|---|---|
| POST   | `/api/events`          | 予定作成 (Aedilis 予約 confirm 時) |
| PATCH  | `/api/events/:id`      | 予定更新 (予約の時刻/施設変更時) |
| DELETE | `/api/events/:id`      | 予定削除 (予約キャンセル時) |
| GET    | `/api/events?from=&to=&facility=` | 期間/施設での予定検索 (空き判定用) |
| POST   | `/api/events/webhook/subscribe` | Aedilis への inbound 通知購読 (v0.2) |

- Aedilis が作る event には extendedProperty `aedilis:<reservationId>` を必ず付与 (inbound ループ防止)
- Schedula 側は施設 ID を event の `location` または専用フィールドで保持し、 空き判定に使う
- 認証は Cernere project-token (per-user × per-project)

## 4. 技術スタック (Actio から継承)

| 分類 | 技術 |
|---|---|
| バックエンド | Hono + Node.js + TypeScript |
| フロントエンド | React 19 + Vite + React Router 7 |
| ORM | Drizzle ORM (SQLite / PostgreSQL / MySQL) |
| 認証 | Cernere (`@ludiars/cernere-id-cache` / `-composite`) |
| セッション | Redis (ioredis) |
| モジュール SDK | `@ludiars/schedula-sdk` (名が示す通り Schedula が本来の home) |
| シークレット | Infisical (`@ludiars/cernere-env-cli`) |

## 5. ポート

PORT-MAP 原則: 8000-8999 = HTTP API バックエンド。 Schedula は Actio 級のマルチユーザ基盤なので 8xxx レンジ (17xxx loopback は不可)。

| 用途 | Host port | 備考 |
|---|---|---|
| Schedula backend | **8889** | Actio backend 8888 の隣 (暫定、 移植 PR で infra/PORT-MAP.md 確定) |
| Schedula frontend | **8487** | Actio frontend 8486 の隣 |

> 旧 PORT-MAP に残る「Schedula backend 3000 (legacy)」 は rename 前の死蔵エントリ。 復活に伴い再定義する。

## 6. 移行戦略

**方式 = clone-and-prune**。 共通基盤が 80% 重なるため、 手でコピーするのではなく
Schedula を Actio の `git clone` として作り、 各リポで「相手の責務」 を削除する。
ビルドが通る状態から始まり、 import 崩れが激減し、 git 履歴も保たれる。

| Phase | 内容 | 状態 |
|---|---|---|
| **P0** | DESIGN/README/CLAUDE 起草、 memory & Actio 宣言、 旧 stale clone 削除 | ✅ 2026-05-20 |
| **P1** | Schedula = Actio main の clone、 package.json/README/CLAUDE を再識別、 `feat/split-from-actio` branch | ✅ 2026-05-20 (commit 05be835) |
| **P2 Schedula prune** | Schedula からタスク系を除去 (§6.1)、 wiring + frontend 修正、 `ci-check.sh` 通過 | 🔜 |
| **P3 Actio prune** | Actio から予定系を除去、 wiring + frontend 修正、 `ci-check.sh` 通過 | 🔜 |
| **P4 外部リポ振り分け** | Actio-PublicModules / Actio-SchoolModules を schedule 系 / task 系に振り分け | 🔜 |
| **P5 結線** | Aedilis の provider を `schedula` に、 Calicula の export 先を Schedula に | 🔜 |
| **P6 公開** | LUDIARS/Schedula gh repo create + push、 infra/PORT-MAP.md + LUDIARS/PROJECT-CODES.md を PR | 🔜 |

5月目標 ([[memory:project_2026_05_goals]]) との関係: 目標は「Hub で Aedilis (施設予約) が動く」。 Aedilis は P2 完了 (Schedula の event API 稼働) で結線可能。

### 6.1 P2 — Schedula から除去する対象 (実行チェックリスト)

| 対象 | 種別 | 備考 |
|---|---|---|
| `modules/task/` | 削除 | コア「タスク」 → Actio |
| `modules/pm/` | 削除 | PM (GitHub/Notion) → Actio |
| `modules/reservation/` | 削除 | 途中実装、 破棄 |
| `modules/school/facility-booking/` | 削除 | 施設予約 → Aedilis |
| `src/task-plugins.ts` | 削除 | Task プラグイン基盤 → Actio |
| `src/reservation-plugins.ts` | 削除 | 予約プラグイン基盤 → Aedilis |
| `src/app.ts` | 修正 | 上記モジュールの `installModule` / `registerTaskPlugin` 呼び出しを除去 |
| `frontend` router / `lib/api.ts` | 修正 | task / pm / reservations / facility-booking ページと API namespace を除去 |
| `frontend/src/pages/PM*.tsx` `Reservations*.tsx` `FacilityBooking*.tsx` 等 | 削除 | 対応ページ |
| `src/db/schema.ts` の `tasks` / `pm_*` テーブル | **保持** | AIFormat の DROP 禁止ルール。 未使用テーブルは無害なので残す |

> 検証: 各除去後に `bash scripts/ci-check.sh` (build + test + lint + frontend build) を通す。 これは CLAUDE.md の必須ルール。 ビルドが緑になるまで P6 (push) に進まない。

## 7. オープン論点

1. ~~**SDK 名**~~ → 決定 (2026-05-20): `@ludiars/schedula-sdk` は名前的に Schedula が home。 home は Schedula の `packages/sdk/`。 v0.1 は clone により両リポが `packages/sdk/` を物理的に持つ (共通基盤の複製方針に含める)。 将来は Schedula から単一 publish し Actio が dependency として consume
2. **予定 ↔ タスク連携** — 「会議 (Schedula) の準備 task (Actio)」 のような相互参照をどのレイヤーで吸収するか (Hub 層 / 相互 REST / 専用リンクサービス)
3. **Actio-PublicModules / Actio-SchoolModules の分割** — モジュール単位で schedule 系 / task 系に振り分けるか、 一旦両 host か
4. **DB 分離** — 共有 PostgreSQL 上で論理 DB を `actio` と `schedula` に分けるか、 同一 DB を共用するか
5. **frontend** — Schedula / Actio で React アプリを完全分離するか、 Hub Shell に寄せて各々は API + 最小 admin のみにするか
