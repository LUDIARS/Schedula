import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { initTestDatabase, clearTestDatabase, request } from "../helpers.js";

let app: any;
let autoFinalizeDuePolls: () => Promise<number>;

beforeAll(async () => {
  initTestDatabase();
  const mod = await import("../../src/app.js");
  app = mod.createApp().app;
  ({ autoFinalizeDuePolls } = await import("../../src/lib/poll-service.js"));
});

beforeEach(() => {
  clearTestDatabase();
});

const futureIso = (minutesFromNow: number) =>
  new Date(Date.now() + minutesFromNow * 60_000).toISOString();

async function createPoll(body: any) {
  return request(app, "POST", "/api/public-poll/events", { body });
}

async function getView(publicId: string, accessToken: string) {
  return request(app, "GET", `/api/public-poll/events/${publicId}?t=${accessToken}`);
}

describe("POST /api/public-poll/events", () => {
  it("無認証でイベントを作成し token を返す", async () => {
    const { status, json } = await createPoll({
      title: "ランチ会",
      candidates: [{ startTime: futureIso(60) }, { startTime: futureIso(120) }],
    });
    expect(status).toBe(201);
    expect(json.publicId).toBeDefined();
    expect(json.accessToken).toBeDefined();
    expect(json.adminToken).toBeDefined();
    expect(json.publicId).not.toBe(json.accessToken);
  });

  it("title 無し / candidates 無しは 400", async () => {
    expect((await createPoll({ title: "" })).status).toBe(400);
    expect((await createPoll({ title: "x", candidates: [] })).status).toBe(400);
  });

  it("不正な Discord webhook URL は 400", async () => {
    const { status } = await createPoll({
      title: "x",
      candidates: [{ startTime: futureIso(60) }],
      discordWebhookUrl: "https://evil.example.com/webhook",
    });
    expect(status).toBe(400);
  });

  it("正規の Discord webhook URL は許可", async () => {
    const { status } = await createPoll({
      title: "x",
      candidates: [{ startTime: futureIso(60) }],
      discordWebhookUrl: "https://discord.com/api/webhooks/123456789/abcDEF-token_123",
    });
    expect(status).toBe(201);
  });
});

describe("GET /api/public-poll/events/:publicId", () => {
  it("publicId + accessToken の両方が揃えば閲覧できる", async () => {
    const created = (await createPoll({
      title: "閲覧テスト",
      candidates: [{ startTime: futureIso(60) }],
    })).json;
    const { status, json } = await getView(created.publicId, created.accessToken);
    expect(status).toBe(200);
    expect(json.event.title).toBe("閲覧テスト");
    expect(json.candidates.length).toBe(1);
    // accessToken / adminToken / webhook は公開ビューに出さない
    expect(json.event.accessToken).toBeUndefined();
    expect(json.event.adminToken).toBeUndefined();
    expect(json.event.discordWebhookUrl).toBeUndefined();
  });

  it("accessToken が違う / 無い場合は 404 (存在も伏せる)", async () => {
    const created = (await createPoll({
      title: "x",
      candidates: [{ startTime: futureIso(60) }],
    })).json;
    expect((await request(app, "GET", `/api/public-poll/events/${created.publicId}`)).status).toBe(404);
    expect(
      (await request(app, "GET", `/api/public-poll/events/${created.publicId}?t=wrong`)).status,
    ).toBe(404);
  });
});

describe("回答の登録・編集と集計", () => {
  it("参加者が回答を登録し editKey で編集できる", async () => {
    const created = (await createPoll({
      title: "回答テスト",
      candidates: [{ startTime: futureIso(60) }, { startTime: futureIso(120) }],
    })).json;
    const view = (await getView(created.publicId, created.accessToken)).json;
    const [c1, c2] = view.candidates;

    const submit = await request(
      app,
      "POST",
      `/api/public-poll/events/${created.publicId}/responses?t=${created.accessToken}`,
      { body: { name: "太郎", answers: [
        { candidateId: c1.id, answer: "ok" },
        { candidateId: c2.id, answer: "ng" },
      ] } },
    );
    expect(submit.status).toBe(201);
    expect(submit.json.editKey).toBeDefined();

    // 集計に反映
    const after = (await getView(created.publicId, created.accessToken)).json;
    const t1 = after.tally.find((t: any) => t.candidateId === c1.id);
    expect(t1.ok).toBe(1);
    expect(t1.score).toBe(2);

    // editKey で回答を ng → ok に変更
    const edit = await request(
      app,
      "PUT",
      `/api/public-poll/events/${created.publicId}/responses?t=${created.accessToken}`,
      { body: { editKey: submit.json.editKey, answers: [
        { candidateId: c1.id, answer: "ok" },
        { candidateId: c2.id, answer: "ok" },
      ] } },
    );
    expect(edit.status).toBe(200);
    const after2 = (await getView(created.publicId, created.accessToken)).json;
    const t2 = after2.tally.find((t: any) => t.candidateId === c2.id);
    expect(t2.ok).toBe(1);
    expect(t2.ng).toBe(0);
  });
});

describe("管理 (adminToken)", () => {
  it("adminToken で確定し、公開ビューに反映される", async () => {
    const created = (await createPoll({
      title: "確定テスト",
      candidates: [{ startTime: futureIso(60) }, { startTime: futureIso(120) }],
    })).json;
    const view = (await getView(created.publicId, created.accessToken)).json;
    const candId = view.candidates[0].id;

    const fin = await request(
      app,
      "POST",
      `/api/public-poll/events/${created.publicId}/finalize?k=${created.adminToken}`,
      { body: { candidateId: candId } },
    );
    expect(fin.status).toBe(200);
    expect(fin.json.discordSent).toBe(false); // webhook 未設定

    const after = (await getView(created.publicId, created.accessToken)).json;
    expect(after.event.status).toBe("finalized");
    expect(after.event.finalizedCandidateId).toBe(candId);
  });

  it("誤った adminToken の管理操作は 404", async () => {
    const created = (await createPoll({
      title: "x",
      candidates: [{ startTime: futureIso(60) }],
    })).json;
    const admin = await request(
      app,
      "GET",
      `/api/public-poll/events/${created.publicId}/admin?k=bogus`,
    );
    expect(admin.status).toBe(404);
  });

  it("calendarOwnerId 指定時は確定でコア events に登録される", async () => {
    const created = (await createPoll({
      title: "カレンダー連携",
      candidates: [{ startTime: futureIso(60), endTime: futureIso(120) }],
      calendarOwnerId: "owner-xyz",
    })).json;
    const view = (await getView(created.publicId, created.accessToken)).json;
    const candId = view.candidates[0].id;
    const fin = await request(
      app,
      "POST",
      `/api/public-poll/events/${created.publicId}/finalize?k=${created.adminToken}`,
      { body: { candidateId: candId } },
    );
    expect(fin.status).toBe(200);
    expect(fin.json.calendarEventId).toBeTruthy();
  });

  it("adminToken で削除すると参照できなくなる", async () => {
    const created = (await createPoll({
      title: "削除テスト",
      candidates: [{ startTime: futureIso(60) }],
    })).json;
    const del = await request(
      app,
      "DELETE",
      `/api/public-poll/events/${created.publicId}?k=${created.adminToken}`,
    );
    expect(del.status).toBe(200);
    expect((await getView(created.publicId, created.accessToken)).status).toBe(404);
  });
});

describe("締切での自動確定 (sweeper)", () => {
  it("締切超過の open イベントを最多得票で自動確定する", async () => {
    const created = (await createPoll({
      title: "自動確定",
      candidates: [{ startTime: futureIso(60) }, { startTime: futureIso(120) }],
      deadline: new Date(Date.now() - 1000).toISOString(), // 過去
      autoFinalize: true,
    })).json;
    const view = (await getView(created.publicId, created.accessToken)).json;
    const [c1, c2] = view.candidates;

    // c2 に多く ok を入れる
    await request(app, "POST", `/api/public-poll/events/${created.publicId}/responses?t=${created.accessToken}`, {
      body: { name: "A", answers: [{ candidateId: c1.id, answer: "ng" }, { candidateId: c2.id, answer: "ok" }] },
    });

    const n = await autoFinalizeDuePolls();
    expect(n).toBeGreaterThanOrEqual(1);

    const after = (await getView(created.publicId, created.accessToken)).json;
    expect(after.event.status).toBe("finalized");
    expect(after.event.finalizedCandidateId).toBe(c2.id);
  });
});
