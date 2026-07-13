import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  initTestDatabase,
  clearTestDatabase,
  insertTestUser,
  generateTestToken,
  request,
} from "../helpers.js";

let app: any;

const USER_ID = "user-notif-1";
const OTHER_USER_ID = "user-notif-2";

beforeAll(async () => {
  initTestDatabase();
  const mod = await import("../../src/app.js");
  app = mod.createApp().app;
});

beforeEach(() => {
  clearTestDatabase();
  insertTestUser({ id: USER_ID, name: "NotifUser", email: "notif@test.com" });
  insertTestUser({ id: OTHER_USER_ID, name: "OtherNotifUser", email: "other-notif@test.com" });
});

const token = generateTestToken(USER_ID);

describe("Notification Preferences", () => {
  it("GET /api/webhooks/notifications/preferences should return empty initially", async () => {
    const { status, json } = await request(app, "GET", "/api/webhooks/notifications/preferences", {
      headers: { "X-User-Id": USER_ID },
    });

    expect(status).toBe(200);
    expect(json.userId).toBe(USER_ID);
    expect(json.preferences).toBeDefined();
    expect(json.preferences.length).toBe(0);
  });

  it("PUT /api/webhooks/notifications/preferences should create preference", async () => {
    const { status, json } = await request(app, "PUT", "/api/webhooks/notifications/preferences", {
      headers: { "X-User-Id": USER_ID },
      body: {
        channel: "in_app",
        enabledEvents: ["reservation.created", "schedule.confirmed"],
        reminder: { dayBefore: true, before: true, beforeMinutes: 30 },
      },
    });

    expect(status).toBe(201);
    expect(json.channel).toBe("in_app");
  });

  it("PUT /api/webhooks/notifications/preferences should update existing", async () => {
    // Create first
    await request(app, "PUT", "/api/webhooks/notifications/preferences", {
      headers: { "X-User-Id": USER_ID },
      body: { channel: "in_app", enabledEvents: [] },
    });

    // Update
    const { status, json } = await request(app, "PUT", "/api/webhooks/notifications/preferences", {
      headers: { "X-User-Id": USER_ID },
      body: {
        channel: "in_app",
        enabledEvents: ["reservation.created"],
        quietHoursStart: "23:00",
      },
    });

    expect(status).toBe(200);
  });
});

describe("Notification History", () => {
  it("GET /api/webhooks/notifications/history should return empty initially", async () => {
    const { status, json } = await request(app, "GET", "/api/webhooks/notifications/history", {
      headers: { "X-User-Id": USER_ID },
    });

    expect(status).toBe(200);
    expect(json.notifications).toBeDefined();
    expect(json.notifications.length).toBe(0);
  });
});

describe("Webhook CRUD", () => {
  it("POST /api/webhooks/webhooks should create webhook", async () => {
    const { status, json } = await request(app, "POST", "/api/webhooks/webhooks", {
      headers: { "X-User-Id": USER_ID },
      body: {
        url: "https://example.com/webhook",
        events: ["reservation.created", "schedule.confirmed"],
      },
    });

    expect(status).toBe(201);
    expect(json.id).toBeDefined();
    expect(json.url).toBe("https://example.com/webhook");
    expect(json.secret).toBeDefined();
    expect(json.isActive).toBe(true);
  });

  it("GET /api/webhooks/webhooks should list webhooks (without secrets)", async () => {
    await request(app, "POST", "/api/webhooks/webhooks", {
      headers: { "X-User-Id": USER_ID },
      body: { url: "https://example.com/hook", events: ["*"] },
    });

    const { status, json } = await request(app, "GET", "/api/webhooks/webhooks", {
      headers: { "X-User-Id": USER_ID },
    });

    expect(status).toBe(200);
    expect(json.webhooks).toBeDefined();
    expect(json.webhooks.length).toBe(1);
    expect(json.webhooks[0].secret).toBeUndefined();
  });

  it("PUT /api/webhooks/webhooks/:id should update webhook", async () => {
    const create = await request(app, "POST", "/api/webhooks/webhooks", {
      headers: { "X-User-Id": USER_ID },
      body: { url: "https://example.com/hook", events: ["*"] },
    });

    const { status, json } = await request(app, "PUT", `/api/webhooks/webhooks/${create.json.id}`, {
      headers: { "X-User-Id": USER_ID },
      body: { url: "https://example.com/updated", isActive: false },
    });

    expect(status).toBe(200);
    expect(json.url).toBe("https://example.com/updated");
    expect(json.isActive).toBe(false);
  });

  it("DELETE /api/webhooks/webhooks/:id should delete webhook", async () => {
    const create = await request(app, "POST", "/api/webhooks/webhooks", {
      headers: { "X-User-Id": USER_ID },
      body: { url: "https://example.com/hook", events: ["*"] },
    });

    const { status, json } = await request(app, "DELETE", `/api/webhooks/webhooks/${create.json.id}`, {
      headers: { "X-User-Id": USER_ID },
    });

    expect(status).toBe(200);
    expect(json.message).toBe("Webhook deleted");
  });

  it("POST /api/webhooks/webhooks/:id/rotate-secret should rotate secret", async () => {
    const create = await request(app, "POST", "/api/webhooks/webhooks", {
      headers: { "X-User-Id": USER_ID },
      body: { url: "https://example.com/hook", events: ["*"] },
    });

    const oldSecret = create.json.secret;

    const { status, json } = await request(app, "POST", `/api/webhooks/webhooks/${create.json.id}/rotate-secret`, {
      headers: { "X-User-Id": USER_ID },
    });

    expect(status).toBe(200);
    expect(json.secret).toBeDefined();
    expect(json.secret).not.toBe(oldSecret);
  });

  it("GET /api/webhooks/webhooks/:id/logs should return delivery logs", async () => {
    const create = await request(app, "POST", "/api/webhooks/webhooks", {
      headers: { "X-User-Id": USER_ID },
      body: { url: "https://example.com/hook", events: ["*"] },
    });

    const { status, json } = await request(app, "GET", `/api/webhooks/webhooks/${create.json.id}/logs`, {
      headers: { "X-User-Id": USER_ID },
    });

    expect(status).toBe(200);
    expect(json.logs).toBeDefined();
  });
});

describe("Webhook authorization", () => {
  async function createWebhook(userId = USER_ID) {
    const { status, json } = await request(app, "POST", "/api/webhooks/webhooks", {
      headers: { "X-User-Id": userId },
      body: { url: "https://example.com/private-hook", events: ["*"] },
    });

    expect(status).toBe(201);
    return json;
  }

  it("denies anonymous list requests without leaking webhooks", async () => {
    const webhook = await createWebhook();

    const { status, json } = await request(app, "GET", "/api/webhooks/webhooks");

    expect(status).toBe(401);
    expect(json.webhooks).toBeUndefined();
    expect(JSON.stringify(json)).not.toContain(webhook.id);
    expect(JSON.stringify(json)).not.toContain(webhook.url);
  });

  it("denies anonymous access to every webhook endpoint", async () => {
    const webhook = await createWebhook();
    const endpointRequests = [
      request(app, "POST", "/api/webhooks/webhooks", {
        body: { url: "https://example.com/anonymous", events: ["*"] },
      }),
      request(app, "PUT", `/api/webhooks/webhooks/${webhook.id}`, {
        body: { url: "https://example.com/anonymous" },
      }),
      request(app, "DELETE", `/api/webhooks/webhooks/${webhook.id}`),
      request(app, "POST", `/api/webhooks/webhooks/${webhook.id}/test`),
      request(app, "POST", `/api/webhooks/webhooks/${webhook.id}/rotate-secret`),
      request(app, "GET", `/api/webhooks/webhooks/${webhook.id}/logs`),
    ];

    for (const response of await Promise.all(endpointRequests)) {
      expect(response.status).toBe(401);
    }
  });

  it("does not allow another user to access a webhook by ID", async () => {
    const webhook = await createWebhook();
    const otherUser = { headers: { "X-User-Id": OTHER_USER_ID } };
    const otherUserList = await request(app, "GET", "/api/webhooks/webhooks", otherUser);
    expect(otherUserList.status).toBe(200);
    expect(otherUserList.json.webhooks).toEqual([]);

    const endpointRequests = [
      request(app, "PUT", `/api/webhooks/webhooks/${webhook.id}`, {
        ...otherUser,
        body: { url: "https://example.com/other-user" },
      }),
      request(app, "DELETE", `/api/webhooks/webhooks/${webhook.id}`, otherUser),
      request(app, "POST", `/api/webhooks/webhooks/${webhook.id}/test`, otherUser),
      request(app, "POST", `/api/webhooks/webhooks/${webhook.id}/rotate-secret`, otherUser),
      request(app, "GET", `/api/webhooks/webhooks/${webhook.id}/logs`, otherUser),
    ];

    for (const response of await Promise.all(endpointRequests)) {
      expect(response.status).toBe(404);
      expect(JSON.stringify(response.json)).not.toContain(webhook.id);
      expect(JSON.stringify(response.json)).not.toContain(webhook.secret);
    }
  });

  it("allows the webhook owner to update, rotate, read logs, and delete", async () => {
    const webhook = await createWebhook();
    const owner = { headers: { "X-User-Id": USER_ID } };

    const update = await request(app, "PUT", `/api/webhooks/webhooks/${webhook.id}`, {
      ...owner,
      body: { url: "https://example.com/owner-updated" },
    });
    expect(update.status).toBe(200);
    expect(update.json.url).toBe("https://example.com/owner-updated");

    const rotate = await request(app, "POST", `/api/webhooks/webhooks/${webhook.id}/rotate-secret`, owner);
    expect(rotate.status).toBe(200);
    expect(rotate.json.secret).not.toBe(webhook.secret);

    const logs = await request(app, "GET", `/api/webhooks/webhooks/${webhook.id}/logs`, owner);
    expect(logs.status).toBe(200);
    expect(logs.json.logs).toEqual([]);

    const deletion = await request(app, "DELETE", `/api/webhooks/webhooks/${webhook.id}`, owner);
    expect(deletion.status).toBe(200);
  });
});
