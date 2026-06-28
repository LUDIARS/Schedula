/**
 * Public Poll (調整さん風 無認証日程調整) のビジネスロジック
 *
 * - 候補の集計 / 最多得票の決定
 * - 日程確定 (finalize): ステータス更新 → Discord 確定通知 →
 *   開催前リマインドの予約 → (opt-in 時) コア events への登録
 * - 締切超過の自動確定 / 期限到来リマインドの送信 (sweeper から呼ぶ)
 *
 * 個人データ規約: 参加者名は匿名ゲスト名 (Cernere 非管理) のため poll
 * テーブルに保持してよい。events 登録は作成者が calendarOwnerId を明示
 * 指定した場合のみ行い、匿名者の Cernere ID 捏造はしない。
 */

import { v4 as uuidv4 } from "uuid";
import { secretManager } from "../config/secrets.js";
import {
  publicPollRepo,
  eventRepo,
  type PollEvent,
  type PollCandidate,
  type PollResponse,
  type NewPollEvent,
  type NewPollReminder,
} from "../db/repository.js";
import {
  sendDiscordWebhook,
  type DiscordMessage,
  type DiscordEmbed,
} from "./discord-notify.js";

/** ○=2, △=1, ×=0 の重み付け */
const ANSWER_WEIGHT: Record<string, number> = { ok: 2, maybe: 1, ng: 0 };
const SCHEDULA_COLOR = 0x4f7cff;

// ─── 表示整形 ────────────────────────────────────────────────

function fmtJst(d: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function fmtJstTime(d: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** 候補の表示ラベル (label 指定があれば優先、無ければ start/end から整形) */
export function candidateLabel(c: PollCandidate): string {
  if (c.label && c.label.trim()) return c.label.trim();
  const start = fmtJst(c.startTime);
  if (c.endTime) return `${start}〜${fmtJstTime(c.endTime)}`;
  return start;
}

// ─── 集計 ────────────────────────────────────────────────────

export interface CandidateTally {
  candidateId: string;
  ok: number;
  maybe: number;
  ng: number;
  score: number;
}

export function tallyResponses(
  candidates: PollCandidate[],
  responses: PollResponse[],
): Map<string, CandidateTally> {
  const map = new Map<string, CandidateTally>();
  for (const c of candidates) {
    map.set(c.id, { candidateId: c.id, ok: 0, maybe: 0, ng: 0, score: 0 });
  }
  for (const r of responses) {
    const t = map.get(r.candidateId);
    if (!t) continue;
    if (r.answer === "ok") t.ok += 1;
    else if (r.answer === "maybe") t.maybe += 1;
    else if (r.answer === "ng") t.ng += 1;
    t.score += ANSWER_WEIGHT[r.answer] ?? 0;
  }
  return map;
}

/**
 * 最多得票の候補を選ぶ。
 * score 降順 → ng 昇順 → sortOrder 昇順 → startTime 昇順 で決定。
 * 回答が無くても (score 全 0) 先頭候補を返す。
 */
export function pickBestCandidate(
  candidates: PollCandidate[],
  responses: PollResponse[],
): PollCandidate | undefined {
  if (candidates.length === 0) return undefined;
  const tally = tallyResponses(candidates, responses);
  const sorted = [...candidates].sort((a, b) => {
    const ta = tally.get(a.id);
    const tb = tally.get(b.id);
    const sa = ta?.score ?? 0;
    const sb = tb?.score ?? 0;
    if (sb !== sa) return sb - sa;
    const na = ta?.ng ?? 0;
    const nb = tb?.ng ?? 0;
    if (na !== nb) return na - nb;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.startTime.getTime() - b.startTime.getTime();
  });
  return sorted[0];
}

// ─── Discord メッセージ ──────────────────────────────────────

function frontendBase(): string {
  return secretManager
    .getOrDefault("FRONTEND_URL", "http://localhost:8080")
    .replace(/\/$/, "");
}

/** 参加者が結果を見るための URL (publicId + accessToken) */
export function pollViewUrl(event: PollEvent): string {
  return `${frontendBase()}/p/${event.publicId}?t=${event.accessToken}`;
}

function buildConfirmEmbed(event: PollEvent, candidate: PollCandidate): DiscordEmbed {
  return {
    title: `📅 日程が決定しました: ${event.title}`,
    description: event.description || undefined,
    url: pollViewUrl(event),
    color: SCHEDULA_COLOR,
    fields: [{ name: "確定日時", value: candidateLabel(candidate), inline: false }],
    footer: { text: "Schedula 日程調整" },
    timestamp: new Date().toISOString(),
  };
}

function buildConfirmMessage(event: PollEvent, candidate: PollCandidate): DiscordMessage {
  return { embeds: [buildConfirmEmbed(event, candidate)] };
}

function buildReminderMessage(event: PollEvent, minutesBefore: number): DiscordMessage {
  const when = event.finalizedStartTime ? candidateLabelFromDate(event) : "";
  const lead =
    minutesBefore >= 1440
      ? `${Math.floor(minutesBefore / 1440)}日前`
      : minutesBefore >= 60
        ? `${Math.floor(minutesBefore / 60)}時間前`
        : `${minutesBefore}分前`;
  return {
    embeds: [
      {
        title: `⏰ まもなく開催 (${lead}): ${event.title}`,
        description: event.description || undefined,
        url: pollViewUrl(event),
        color: SCHEDULA_COLOR,
        fields: when ? [{ name: "開催日時", value: when, inline: false }] : undefined,
        footer: { text: "Schedula 日程調整" },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

function candidateLabelFromDate(event: PollEvent): string {
  if (!event.finalizedStartTime) return "";
  const start = fmtJst(event.finalizedStartTime);
  if (event.finalizedEndTime) return `${start}〜${fmtJstTime(event.finalizedEndTime)}`;
  return start;
}

// ─── 確定処理 ────────────────────────────────────────────────

export interface FinalizeResult {
  candidate: PollCandidate;
  calendarEventId: string | null;
  discordSent: boolean;
}

/**
 * 指定候補で日程を確定する。
 * 1. events ステータス更新 2. (opt-in 時) コア events 登録
 * 3. Discord 確定通知 4. 開催前リマインド予約
 *
 * Discord 通知の失敗は finalize 自体を失敗させず、ログに出して
 * discordNotifiedAt を据え置く (sweeper が後で再送可能)。
 */
export async function finalizePoll(
  event: PollEvent,
  candidateId: string,
): Promise<FinalizeResult> {
  const candidate = await publicPollRepo.findCandidateById(candidateId);
  if (!candidate || candidate.eventId !== event.id) {
    throw new Error("candidate not found for this poll");
  }

  const update: Partial<Omit<NewPollEvent, "id">> = {
    status: "finalized",
    finalizedCandidateId: candidate.id,
    finalizedStartTime: candidate.startTime,
    finalizedEndTime: candidate.endTime ?? null,
    finalizedAt: new Date(),
  };

  // コア events への登録 (作成者が calendarOwnerId を明示した場合のみ)
  let calendarEventId: string | null = event.calendarEventId ?? null;
  if (event.calendarOwnerId && !calendarEventId) {
    calendarEventId = uuidv4();
    await eventRepo.create({
      id: calendarEventId,
      ownerId: event.calendarOwnerId,
      groupId: event.calendarGroupId ?? null,
      title: event.title,
      description: event.description || null,
      startTime: candidate.startTime,
      endTime: candidate.endTime ?? candidate.startTime,
      isAllDay: false,
      visibility: event.calendarGroupId ? "group" : "private",
      pluginId: "public-poll",
      pluginRef: event.id,
      pluginPayload: { publicId: event.publicId },
    });
    update.calendarEventId = calendarEventId;
  }

  await publicPollRepo.updateEvent(event.id, update);
  const finalized: PollEvent = { ...event, ...update } as PollEvent;

  // Discord 確定通知 + リマインド予約 (Webhook 設定時のみ)
  let discordSent = false;
  if (event.discordWebhookUrl) {
    try {
      await sendDiscordWebhook(event.discordWebhookUrl, buildConfirmMessage(finalized, candidate));
      await publicPollRepo.updateEvent(event.id, { discordNotifiedAt: new Date() });
      discordSent = true;
    } catch (err) {
      console.error(`[public-poll] Discord 確定通知に失敗 (event=${event.id}):`, err);
    }
    await scheduleReminders(finalized, candidate);
  }

  return { candidate, calendarEventId, discordSent };
}

/** 開催前リマインドを poll_reminders に予約する (Webhook 設定時のみ呼ばれる) */
async function scheduleReminders(event: PollEvent, candidate: PollCandidate): Promise<void> {
  const offsets = (event.reminderOffsets ?? []).filter(
    (n: number) => Number.isFinite(n) && n > 0 && n <= 60 * 24 * 30,
  );
  if (offsets.length === 0) return;
  const startMs = candidate.startTime.getTime();
  const now = Date.now();
  const rows: NewPollReminder[] = [];
  for (const m of offsets) {
    const remindMs = startMs - m * 60 * 1000;
    if (remindMs <= now) continue;
    rows.push({
      id: uuidv4(),
      eventId: event.id,
      remindAt: new Date(remindMs),
      minutesBefore: Math.floor(m),
      sentAt: null,
    });
  }
  await publicPollRepo.addReminders(rows);
}

// ─── sweeper から呼ばれる定期処理 ────────────────────────────

/** 締切超過の open イベントを最多得票で自動確定する */
export async function autoFinalizeDuePolls(): Promise<number> {
  const due = await publicPollRepo.findOpenPastDeadline(new Date());
  let finalized = 0;
  for (const event of due) {
    try {
      const candidates = await publicPollRepo.listCandidates(event.id);
      if (candidates.length === 0) {
        await publicPollRepo.updateEvent(event.id, { status: "closed" });
        continue;
      }
      const responses = await publicPollRepo.listResponses(event.id);
      const best = pickBestCandidate(candidates, responses);
      if (!best) {
        await publicPollRepo.updateEvent(event.id, { status: "closed" });
        continue;
      }
      await finalizePoll(event, best.id);
      finalized += 1;
    } catch (err) {
      console.error(`[public-poll] 自動確定に失敗 (event=${event.id}):`, err);
    }
  }
  return finalized;
}

/** 送信予定を過ぎた開催前リマインドを Discord へ送る */
export async function sendDueReminders(): Promise<number> {
  const due = await publicPollRepo.findDueReminders(new Date());
  let sent = 0;
  for (const r of due) {
    const event = await publicPollRepo.findById(r.eventId);
    // 宛先が無い / 確定解除済みは送らず、再評価を避けるため sent 記録
    if (
      !event ||
      !event.discordWebhookUrl ||
      event.status !== "finalized" ||
      !event.finalizedStartTime
    ) {
      await publicPollRepo.markReminderSent(r.id);
      continue;
    }
    try {
      await sendDiscordWebhook(event.discordWebhookUrl, buildReminderMessage(event, r.minutesBefore));
      await publicPollRepo.markReminderSent(r.id);
      sent += 1;
    } catch (err) {
      console.error(`[public-poll] リマインド送信に失敗 (event=${event.id}):`, err);
      // markSent しない → 次 tick で再試行
    }
  }
  return sent;
}
