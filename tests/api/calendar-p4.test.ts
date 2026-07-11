import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearTestDatabase,
  generateTestToken,
  initTestDatabase,
  insertTestUser,
  request,
} from "../helpers.js";
import { createOAuthState, verifyOAuthState } from "../../modules/calendar/oauth-state.js";
import { mergeBusy, recurringBusy } from "../../modules/calendar/freebusy.js";

let app: ReturnType<(typeof import("../../src/app.js"))["createApp"]>["app"];
let token: string;

beforeAll(async () => {
  initTestDatabase();
  app = (await import("../../src/app.js")).createApp().app;
});

beforeEach(() => {
  clearTestDatabase();
  insertTestUser({ id: "p4-user", name: "Calendar User", email: "calendar-p4@test.invalid" });
  token = generateTestToken("p4-user");
  process.env.GOOGLE_CLIENT_ID = "google-client";
  process.env.GOOGLE_CLIENT_SECRET = "google-secret";
  process.env.GOOGLE_CALENDAR_REDIRECT_URI = "http://localhost/api/calendar/oauth/callback";
  process.env.GOOGLE_OAUTH_STATE_SECRET = "state-secret";
});

afterEach(() => vi.restoreAllMocks());

describe("P4 calendar primitives", () => {
  it("signs expiring OAuth state", () => {
    const state = createOAuthState("user-1", "secret", 1000);
    expect(verifyOAuthState(state, "secret", 2000).userId).toBe("user-1");
    expect(() => verifyOAuthState(state, "other", 2000)).toThrow();
    expect(() => verifyOAuthState(state, "secret", 10 * 60 * 1000 + 1001)).toThrow();
  });

  it("projects Monday JST recurrence and merges overlapping busy intervals", () => {
    const local = recurringBusy(
      [{ day: 0, startTime: "09:30", endTime: "10:30" }],
      new Date("2026-07-13T00:00:00.000Z"),
      new Date("2026-07-13T03:00:00.000Z"),
    );
    expect(mergeBusy([...local, {
      start: "2026-07-13T01:00:00.000Z", end: "2026-07-13T02:00:00.000Z",
    }])).toEqual([{
      start: "2026-07-13T00:30:00.000Z", end: "2026-07-13T02:00:00.000Z",
    }]);
  });
});

describe("P4 calendar routes", () => {
  it("degrades freeBusy to local recurring events when Google is not connected", async () => {
    await request(app, "POST", "/api/calendar/personal", {
      token,
      body: { title: "Review", day: 0, period: 0, startTime: "09:30", endTime: "10:30" },
    });
    const response = await request(app, "GET",
      "/api/calendar/freebusy?timeMin=2026-07-13T00%3A00%3A00.000Z&timeMax=2026-07-13T03%3A00%3A00.000Z",
      { token });
    expect(response.status).toBe(200);
    expect(response.json).toMatchObject({
      connected: false,
      warnings: ["google_calendar_not_connected"],
      busy: [{ start: "2026-07-13T00:30:00.000Z", end: "2026-07-13T01:30:00.000Z" }],
    });
  });

  it("completes consent and writes a tagged Google event", async () => {
    const start = await request(app, "GET", "/api/calendar/oauth/start", { token });
    expect(start.status).toBe(200);
    const authorizationUrl = new URL(start.json.authorizationUrl);
    const state = authorizationUrl.searchParams.get("state");
    expect(state).toBeTruthy();

    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({
        access_token: "access", refresh_token: "refresh", expires_in: 3600,
        scope: "https://www.googleapis.com/auth/calendar.events",
      }))
      .mockResolvedValueOnce(Response.json({
        id: "google-event-1", status: "confirmed", summary: "Calliope block", description: "",
        start: { dateTime: "2026-07-13T01:00:00.000Z" },
        end: { dateTime: "2026-07-13T02:00:00.000Z" },
        extendedProperties: { private: { calliope: "entry-1" } },
      }))
      .mockResolvedValueOnce(Response.json({
        items: [
          {
            id: "calliope-owned", status: "confirmed", summary: "Owned", description: "",
            start: { dateTime: "2026-07-13T02:00:00.000Z" },
            end: { dateTime: "2026-07-13T03:00:00.000Z" },
            extendedProperties: { private: { calliope: "entry-2" } },
          },
          {
            id: "human-event", status: "confirmed", summary: "Human meeting", description: "",
            start: { dateTime: "2026-07-13T03:00:00.000Z" },
            end: { dateTime: "2026-07-13T04:00:00.000Z" },
          },
        ],
        nextSyncToken: "sync-1",
      }))
      .mockResolvedValueOnce(Response.json({ items: [], nextSyncToken: "sync-2" }));
    const callback = await request(app, "GET",
      `/api/calendar/oauth/callback?code=code&state=${encodeURIComponent(state ?? "")}`);
    expect(callback.status).toBe(200);

    const created = await request(app, "POST", "/api/calendar/events", {
      token,
      body: {
        summary: "Calliope block",
        start: { dateTime: "2026-07-13T01:00:00.000Z" },
        end: { dateTime: "2026-07-13T02:00:00.000Z" },
        extendedProperties: { private: { calliope: "entry-1" } },
      },
    });
    expect(created.status).toBe(201);
    expect(created.json.event.id).toBe("google-event-1");
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    );
    expect(String(fetchMock.mock.calls[1]?.[1]?.body)).toContain('"calliope":"entry-1"');

    const firstSync = await request(app, "POST", "/api/calendar/sync", { token });
    expect(firstSync.status).toBe(200);
    expect(firstSync.json).toMatchObject({ imported: 1, skipped: 1, syncTokenReset: false });
    const secondSync = await request(app, "POST", "/api/calendar/sync", { token });
    expect(secondSync.status).toBe(200);
    expect(String(fetchMock.mock.calls[3]?.[0])).toContain("syncToken=sync-1");

    const status = await request(app, "GET", "/api/calendar/status", { token });
    expect(status.json.connected).toBe(true);
    const disconnected = await request(app, "POST", "/api/calendar/disconnect", { token });
    expect(disconnected.status).toBe(200);
    const afterDisconnect = await request(app, "GET", "/api/calendar/status", { token });
    expect(afterDisconnect.json.connected).toBe(false);
  });
});
