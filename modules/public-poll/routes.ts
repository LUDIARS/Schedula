/**
 * Public Poll Module — 調整さん風 無認証日程調整
 *
 * 認証なしで使えるイベント日程調整。URL は publicId (event 固有 ID) +
 * accessToken (UUIDv4) の両方が揃って初めて参照でき、推測による特定を
 * 避ける。作成者は adminToken で管理し、各参加者は editKey で自分の回答を
 * 編集する。
 *
 * このルータは認証ミドルウェア (userContext) より前にマウントされ、
 * /api/public-poll 配下を完全に無認証で公開する (src/app.ts 参照)。
 *
 * 機能:
 *  1. Discord 確定通知 (作成時に Webhook URL を登録)
 *  2. 参加者へのリマインド (確定後 Discord チャンネルへ開催前通知)
 *  3. 投票締切での自動確定 (sweeper)
 *  4. 確定予定のコア events 登録 (calendarOwnerId 指定時のみ)
 */

import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  publicPollRepo,
  type PollEvent,
  type PollCandidate,
  type NewPollCandidate,
  type NewPollResponse,
} from "../../src/db/repository.js";
import { isValidDiscordWebhookUrl } from "../../src/lib/discord-notify.js";
import {
  finalizePoll,
  candidateLabel,
  tallyResponses,
  pollViewUrl,
} from "../../src/lib/poll-service.js";

export const publicPollRoutes = new Hono();

const VALID_ANSWERS = new Set(["ok", "maybe", "ng"]);
const MAX_CANDIDATES = 100;
const MAX_REMINDER_OFFSETS = 10;

// ─── helpers ──────────────────────────────────────────────

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/** 推測されにくい短い event 固有 ID (base36, 約 11 文字) */
function genPublicId(): string {
  return randomBytes(8).toString("hex").slice(0, 11);
}

/** 定数時間でトークン比較 (タイミング攻撃対策) */
function tokenEquals(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** Webhook URL の末尾を伏せた表示用文字列 */
function maskWebhook(url: string | null): string | null {
  if (!url) return null;
  return url.replace(/\/[\w-]+$/, "/****");
}

function reminderOffsetsOf(input: unknown): number[] | null {
  if (input == null) return null;
  if (!Array.isArray(input)) return null;
  const offsets = input
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n > 0 && n <= 60 * 24 * 30)
    .map((n) => Math.floor(n))
    .slice(0, MAX_REMINDER_OFFSETS);
  return offsets;
}

interface CandidateView {
  id: string;
  startTime: string;
  endTime: string | null;
  label: string;
  sortOrder: number;
}

function toCandidateView(c: PollCandidate): CandidateView {
  return {
    id: c.id,
    startTime: c.startTime.toISOString(),
    endTime: c.endTime ? c.endTime.toISOString() : null,
    label: candidateLabel(c),
    sortOrder: c.sortOrder,
  };
}

/** publicId のイベントと候補・参加者・回答・集計をまとめて取得 */
async function loadPollView(event: PollEvent): Promise<{
  candidates: CandidateView[];
  participants: Array<{ id: string; name: string; comment: string; responses: Record<string, string> }>;
  tally: Array<{ candidateId: string; ok: number; maybe: number; ng: number; score: number }>;
}> {
  const candidates = await publicPollRepo.listCandidates(event.id);
  const participants = await publicPollRepo.listParticipants(event.id);
  const responses = await publicPollRepo.listResponses(event.id);

  const byParticipant = new Map<string, Record<string, string>>();
  for (const r of responses) {
    let m = byParticipant.get(r.participantId);
    if (!m) {
      m = {};
      byParticipant.set(r.participantId, m);
    }
    m[r.candidateId] = r.answer;
  }

  const tallyMap = tallyResponses(candidates, responses);

  return {
    candidates: candidates.map(toCandidateView),
    participants: participants.map((p) => ({
      id: p.id,
      name: p.name,
      comment: p.comment,
      responses: byParticipant.get(p.id) ?? {},
    })),
    tally: candidates.map((c) => {
      const t = tallyMap.get(c.id);
      return {
        candidateId: c.id,
        ok: t?.ok ?? 0,
        maybe: t?.maybe ?? 0,
        ng: t?.ng ?? 0,
        score: t?.score ?? 0,
      };
    }),
  };
}

function publicEventFields(event: PollEvent) {
  return {
    publicId: event.publicId,
    title: event.title,
    description: event.description,
    creatorName: event.creatorName,
    status: event.status,
    deadline: event.deadline ? event.deadline.toISOString() : null,
    autoFinalize: event.autoFinalize,
    finalizedCandidateId: event.finalizedCandidateId,
    finalizedStartTime: event.finalizedStartTime ? event.finalizedStartTime.toISOString() : null,
    finalizedEndTime: event.finalizedEndTime ? event.finalizedEndTime.toISOString() : null,
    discordConfigured: !!event.discordWebhookUrl,
    createdAt: event.createdAt.toISOString(),
  };
}

// ─── POST /api/public-poll/events ─────────────────────────
// イベント作成 (無認証)。candidates は最低 1 件必要。
publicPollRoutes.post("/events", async (c) => {
  interface CandidateInput {
    startTime?: string;
    endTime?: string | null;
    label?: string;
  }
  interface CreateBody {
    title?: string;
    description?: string;
    creatorName?: string;
    candidates?: CandidateInput[];
    deadline?: string | null;
    autoFinalize?: boolean;
    discordWebhookUrl?: string | null;
    reminderOffsets?: number[];
    calendarOwnerId?: string | null;
    calendarGroupId?: string | null;
  }
  const body = await c.req.json<CreateBody>().catch(() => null);
  if (!body || typeof body.title !== "string" || !body.title.trim()) {
    return c.json({ error: "title は必須です" }, 400);
  }
  if (!Array.isArray(body.candidates) || body.candidates.length === 0) {
    return c.json({ error: "candidates を 1 件以上指定してください" }, 400);
  }
  if (body.candidates.length > MAX_CANDIDATES) {
    return c.json({ error: `candidates は最大 ${MAX_CANDIDATES} 件です` }, 400);
  }

  // 候補のパース・検証
  const eventId = uuidv4();
  const candidateRows: NewPollCandidate[] = [];
  for (let i = 0; i < body.candidates.length; i++) {
    const cand = body.candidates[i];
    const start = parseDate(cand.startTime);
    if (!start) return c.json({ error: `candidates[${i}].startTime が不正です` }, 400);
    const end = cand.endTime ? parseDate(cand.endTime) : null;
    if (cand.endTime && !end) return c.json({ error: `candidates[${i}].endTime が不正です` }, 400);
    if (end && end <= start) return c.json({ error: `candidates[${i}].endTime は startTime より後に` }, 400);
    candidateRows.push({
      id: uuidv4(),
      eventId,
      startTime: start,
      endTime: end,
      label: (cand.label ?? "").trim(),
      sortOrder: i,
    });
  }

  // Discord webhook 検証
  let webhook: string | null = null;
  if (body.discordWebhookUrl) {
    if (!isValidDiscordWebhookUrl(body.discordWebhookUrl)) {
      return c.json({ error: "discordWebhookUrl が Discord の Webhook URL ではありません" }, 400);
    }
    webhook = body.discordWebhookUrl;
  }

  const deadline = body.deadline ? parseDate(body.deadline) : null;
  if (body.deadline && !deadline) return c.json({ error: "deadline が不正です" }, 400);

  const accessToken = uuidv4();
  const adminToken = uuidv4();

  // publicId の衝突回避 (最大数回リトライ)
  let publicId = genPublicId();
  for (let attempt = 0; attempt < 5; attempt++) {
    const exists = await publicPollRepo.findByPublicId(publicId);
    if (!exists) break;
    publicId = genPublicId();
  }

  await publicPollRepo.createEvent({
    id: eventId,
    publicId,
    accessToken,
    adminToken,
    title: body.title.trim(),
    description: (body.description ?? "").trim(),
    creatorName: (body.creatorName ?? "").trim(),
    status: "open",
    deadline,
    autoFinalize: body.autoFinalize ?? true,
    discordWebhookUrl: webhook,
    reminderOffsets: reminderOffsetsOf(body.reminderOffsets),
    calendarOwnerId: body.calendarOwnerId ?? null,
    calendarGroupId: body.calendarGroupId ?? null,
  });
  await publicPollRepo.addCandidates(candidateRows);

  const created = await publicPollRepo.findByPublicId(publicId);
  return c.json(
    {
      publicId,
      accessToken,
      adminToken,
      viewUrl: created ? pollViewUrl(created) : null,
    },
    201,
  );
});

// ─── GET /api/public-poll/events/:publicId?t=accessToken ──
// 公開閲覧。accessToken が一致しないと 404 (存在も伏せる)。
publicPollRoutes.get("/events/:publicId", async (c) => {
  const event = await publicPollRepo.findByPublicId(c.req.param("publicId"));
  if (!event || !tokenEquals(c.req.query("t"), event.accessToken)) {
    return c.json({ error: "見つかりません" }, 404);
  }
  const view = await loadPollView(event);
  return c.json({ event: publicEventFields(event), ...view });
});

// ─── POST /api/public-poll/events/:publicId/responses ─────
// 新規参加者の回答登録。editKey を返す。
publicPollRoutes.post("/events/:publicId/responses", async (c) => {
  const event = await publicPollRepo.findByPublicId(c.req.param("publicId"));
  if (!event || !tokenEquals(c.req.query("t"), event.accessToken)) {
    return c.json({ error: "見つかりません" }, 404);
  }
  if (event.status !== "open") {
    return c.json({ error: "この日程調整は締め切られています" }, 409);
  }

  interface SubmitBody {
    name?: string;
    comment?: string;
    answers?: Array<{ candidateId?: string; answer?: string }>;
  }
  const body = await c.req.json<SubmitBody>().catch(() => null);
  if (!body || typeof body.name !== "string" || !body.name.trim()) {
    return c.json({ error: "name は必須です" }, 400);
  }
  const candidates = await publicPollRepo.listCandidates(event.id);
  const candidateIds = new Set(candidates.map((c2) => c2.id));

  const participantId = uuidv4();
  const editKey = uuidv4();
  const responseRows: NewPollResponse[] = [];
  for (const a of body.answers ?? []) {
    if (!a.candidateId || !candidateIds.has(a.candidateId)) continue;
    if (!a.answer || !VALID_ANSWERS.has(a.answer)) continue;
    responseRows.push({
      id: uuidv4(),
      eventId: event.id,
      participantId,
      candidateId: a.candidateId,
      answer: a.answer,
    });
  }

  await publicPollRepo.addParticipant({
    id: participantId,
    eventId: event.id,
    name: body.name.trim(),
    editKey,
    comment: (body.comment ?? "").trim(),
  });
  await publicPollRepo.replaceResponses(participantId, responseRows);

  return c.json({ participantId, editKey }, 201);
});

// ─── PUT /api/public-poll/events/:publicId/responses ──────
// 自分の回答編集 (editKey で認可)。
publicPollRoutes.put("/events/:publicId/responses", async (c) => {
  const event = await publicPollRepo.findByPublicId(c.req.param("publicId"));
  if (!event || !tokenEquals(c.req.query("t"), event.accessToken)) {
    return c.json({ error: "見つかりません" }, 404);
  }
  if (event.status !== "open") {
    return c.json({ error: "この日程調整は締め切られています" }, 409);
  }

  interface EditBody {
    editKey?: string;
    name?: string;
    comment?: string;
    answers?: Array<{ candidateId?: string; answer?: string }>;
  }
  const body = await c.req.json<EditBody>().catch(() => null);
  if (!body || !body.editKey) return c.json({ error: "editKey は必須です" }, 400);
  const participant = await publicPollRepo.findParticipantByEditKey(body.editKey);
  if (!participant || participant.eventId !== event.id) {
    return c.json({ error: "回答が見つかりません" }, 404);
  }

  const candidates = await publicPollRepo.listCandidates(event.id);
  const candidateIds = new Set(candidates.map((c2) => c2.id));
  const responseRows: NewPollResponse[] = [];
  for (const a of body.answers ?? []) {
    if (!a.candidateId || !candidateIds.has(a.candidateId)) continue;
    if (!a.answer || !VALID_ANSWERS.has(a.answer)) continue;
    responseRows.push({
      id: uuidv4(),
      eventId: event.id,
      participantId: participant.id,
      candidateId: a.candidateId,
      answer: a.answer,
    });
  }

  const patch: { name?: string; comment?: string } = {};
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (typeof body.comment === "string") patch.comment = body.comment.trim();
  if (Object.keys(patch).length > 0) await publicPollRepo.updateParticipant(participant.id, patch);
  await publicPollRepo.replaceResponses(participant.id, responseRows);

  return c.json({ ok: true });
});

// ─── GET /api/public-poll/events/:publicId/admin?k=adminToken ──
// 作成者向け管理ビュー (accessToken / マスク済 webhook を含む)。
publicPollRoutes.get("/events/:publicId/admin", async (c) => {
  const event = await publicPollRepo.findByPublicId(c.req.param("publicId"));
  if (!event || !tokenEquals(c.req.query("k"), event.adminToken)) {
    return c.json({ error: "見つかりません" }, 404);
  }
  const view = await loadPollView(event);
  return c.json({
    event: {
      ...publicEventFields(event),
      accessToken: event.accessToken,
      viewUrl: pollViewUrl(event),
      discordWebhookMasked: maskWebhook(event.discordWebhookUrl),
      reminderOffsets: event.reminderOffsets ?? [],
      calendarOwnerId: event.calendarOwnerId,
      calendarGroupId: event.calendarGroupId,
      calendarEventId: event.calendarEventId,
    },
    ...view,
  });
});

// ─── POST /api/public-poll/events/:publicId/finalize ──────
// 作成者が候補を選んで日程確定。Discord 通知 + リマインド予約 + events 登録。
publicPollRoutes.post("/events/:publicId/finalize", async (c) => {
  const event = await publicPollRepo.findByPublicId(c.req.param("publicId"));
  if (!event || !tokenEquals(c.req.query("k"), event.adminToken)) {
    return c.json({ error: "見つかりません" }, 404);
  }
  if (event.status === "finalized") {
    return c.json({ error: "すでに確定済みです" }, 409);
  }
  const body = await c.req.json<{ candidateId?: string }>().catch(() => null);
  if (!body || !body.candidateId) return c.json({ error: "candidateId は必須です" }, 400);

  const candidate = await publicPollRepo.findCandidateById(body.candidateId);
  if (!candidate || candidate.eventId !== event.id) {
    return c.json({ error: "候補が見つかりません" }, 404);
  }

  const result = await finalizePoll(event, candidate.id);
  return c.json({
    ok: true,
    finalizedCandidate: toCandidateView(result.candidate),
    discordSent: result.discordSent,
    calendarEventId: result.calendarEventId,
  });
});

// ─── POST /api/public-poll/events/:publicId/reopen ────────
publicPollRoutes.post("/events/:publicId/reopen", async (c) => {
  const event = await publicPollRepo.findByPublicId(c.req.param("publicId"));
  if (!event || !tokenEquals(c.req.query("k"), event.adminToken)) {
    return c.json({ error: "見つかりません" }, 404);
  }
  await publicPollRepo.updateEvent(event.id, {
    status: "open",
    finalizedCandidateId: null,
    finalizedStartTime: null,
    finalizedEndTime: null,
    finalizedAt: null,
  });
  return c.json({ ok: true });
});

// ─── PUT /api/public-poll/events/:publicId/settings ───────
// 作成者によるイベント設定の更新。
publicPollRoutes.put("/events/:publicId/settings", async (c) => {
  const event = await publicPollRepo.findByPublicId(c.req.param("publicId"));
  if (!event || !tokenEquals(c.req.query("k"), event.adminToken)) {
    return c.json({ error: "見つかりません" }, 404);
  }
  interface SettingsBody {
    title?: string;
    description?: string;
    deadline?: string | null;
    autoFinalize?: boolean;
    discordWebhookUrl?: string | null;
    reminderOffsets?: number[];
    calendarOwnerId?: string | null;
    calendarGroupId?: string | null;
  }
  const body = await c.req.json<SettingsBody>().catch(() => null);
  if (!body) return c.json({ error: "不正なリクエストです" }, 400);

  const patch: Partial<{
    title: string;
    description: string;
    deadline: Date | null;
    autoFinalize: boolean;
    discordWebhookUrl: string | null;
    reminderOffsets: number[] | null;
    calendarOwnerId: string | null;
    calendarGroupId: string | null;
  }> = {};

  if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim();
  if (typeof body.description === "string") patch.description = body.description.trim();
  if (body.deadline !== undefined) {
    if (body.deadline === null) patch.deadline = null;
    else {
      const d = parseDate(body.deadline);
      if (!d) return c.json({ error: "deadline が不正です" }, 400);
      patch.deadline = d;
    }
  }
  if (typeof body.autoFinalize === "boolean") patch.autoFinalize = body.autoFinalize;
  if (body.discordWebhookUrl !== undefined) {
    if (body.discordWebhookUrl === null || body.discordWebhookUrl === "") {
      patch.discordWebhookUrl = null;
    } else if (isValidDiscordWebhookUrl(body.discordWebhookUrl)) {
      patch.discordWebhookUrl = body.discordWebhookUrl;
    } else {
      return c.json({ error: "discordWebhookUrl が不正です" }, 400);
    }
  }
  if (body.reminderOffsets !== undefined) patch.reminderOffsets = reminderOffsetsOf(body.reminderOffsets);
  if (body.calendarOwnerId !== undefined) patch.calendarOwnerId = body.calendarOwnerId || null;
  if (body.calendarGroupId !== undefined) patch.calendarGroupId = body.calendarGroupId || null;

  await publicPollRepo.updateEvent(event.id, patch);
  return c.json({ ok: true });
});

// ─── DELETE /api/public-poll/events/:publicId ─────────────
publicPollRoutes.delete("/events/:publicId", async (c) => {
  const event = await publicPollRepo.findByPublicId(c.req.param("publicId"));
  if (!event || !tokenEquals(c.req.query("k"), event.adminToken)) {
    return c.json({ error: "見つかりません" }, 404);
  }
  await publicPollRepo.deleteEvent(event.id);
  return c.json({ ok: true });
});
