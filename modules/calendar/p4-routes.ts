import { Hono, type Context } from "hono";
import { v4 as uuidv4 } from "uuid";
import { getUserId } from "../../src/middleware/getUserId.js";
import {
  eventRepo,
  integrationSettingRepo,
  personalEventRepo,
  syncLogRepo,
  userRepo,
} from "../../src/db/repository.js";
import { secretManager } from "../../src/config/secrets.js";
import {
  getGoogleCalendarAccess,
  getGoogleCalendarConfig,
  GOOGLE_CALENDAR_SERVICE,
} from "./connection.js";
import { mergeBusy, recurringBusy } from "./freebusy.js";
import {
  GoogleCalendarError,
  type GoogleEventInput,
  makeGoogleCalendarClient,
} from "./google-client.js";
import { createOAuthState, verifyOAuthState } from "./oauth-state.js";

const GOOGLE_PLUGIN = "calendar-google";

function stateSecret(): string {
  return secretManager.getRequired("GOOGLE_OAUTH_STATE_SECRET");
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function eventInput(value: unknown, partial = false): GoogleEventInput | Partial<GoogleEventInput> | null {
  const body = record(value);
  if (!body) return null;
  const summary = typeof body.summary === "string" && body.summary.trim() ? body.summary.trim() : undefined;
  const start = record(body.start);
  const end = record(body.end);
  if (!partial && (!summary || typeof start?.dateTime !== "string" || typeof end?.dateTime !== "string")) return null;
  if (start && typeof start.dateTime !== "string") return null;
  if (end && typeof end.dateTime !== "string") return null;
  const extended = record(body.extendedProperties);
  const privateProperties = extended ? record(extended.private) : null;
  if (privateProperties && Object.values(privateProperties).some((item) => typeof item !== "string")) return null;
  return {
    ...(summary === undefined ? {} : { summary }),
    ...(typeof body.description === "string" ? { description: body.description } : {}),
    ...(start ? { start: {
      dateTime: start.dateTime as string,
      ...(typeof start.timeZone === "string" ? { timeZone: start.timeZone } : {}),
    } } : {}),
    ...(end ? { end: {
      dateTime: end.dateTime as string,
      ...(typeof end.timeZone === "string" ? { timeZone: end.timeZone } : {}),
    } } : {}),
    ...(privateProperties ? { extendedProperties: { private: privateProperties as Record<string, string> } } : {}),
  };
}

function rangeFromQuery(c: Context): { from: Date; to: Date } | null {
  const range = c.req.query("range")?.split(",");
  const fromValue = c.req.query("timeMin") ?? c.req.query("from") ?? range?.[0];
  const toValue = c.req.query("timeMax") ?? c.req.query("to") ?? range?.[1];
  if (!fromValue || !toValue) return null;
  const from = new Date(fromValue);
  const to = new Date(toValue);
  return Number.isFinite(from.getTime()) && Number.isFinite(to.getTime()) && from < to ? { from, to } : null;
}

function routeError(error: unknown): Response {
  if (error instanceof GoogleCalendarError) {
    return Response.json({ error: "google_calendar_error", status: error.status, operation: error.operation }, { status: 502 });
  }
  const message = error instanceof Error ? error.message : "unknown";
  if (message.startsWith("[secrets] Required secret")) {
    return Response.json({ error: "google_calendar_unconfigured", message }, { status: 503 });
  }
  throw error;
}

async function mirrorGoogleEvents(userId: string, events: Awaited<ReturnType<ReturnType<typeof makeGoogleCalendarClient>["listEvents"]>>["events"]) {
  let imported = 0;
  let removed = 0;
  let skipped = 0;
  for (const item of events) {
    if (item.extendedProperties.private.calliope) {
      skipped++;
      continue;
    }
    const existing = await eventRepo.findByOwnerAndPluginRef(userId, GOOGLE_PLUGIN, item.id);
    if (item.status === "cancelled") {
      if (existing) {
        await eventRepo.deleteById(existing.id);
        removed++;
      }
      continue;
    }
    const startTime = new Date(item.start);
    const endTime = new Date(item.end);
    if (!Number.isFinite(startTime.getTime()) || !Number.isFinite(endTime.getTime()) || startTime >= endTime) {
      skipped++;
      continue;
    }
    const values = {
      ownerId: userId,
      title: item.summary,
      description: item.description || null,
      startTime,
      endTime,
      isAllDay: !item.start.includes("T"),
      visibility: "private",
      pluginId: GOOGLE_PLUGIN,
      pluginRef: item.id,
      pluginPayload: { source: "google" },
    };
    if (existing) await eventRepo.update(existing.id, values);
    else await eventRepo.create({ id: uuidv4(), ...values });
    imported++;
  }
  return { imported, removed, skipped };
}

export const p4CalendarRoutes = new Hono();

p4CalendarRoutes.get("/oauth/start", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  try {
    const client = makeGoogleCalendarClient(getGoogleCalendarConfig());
    return c.json({ authorizationUrl: client.authorizationUrl(createOAuthState(userId, stateSecret())) });
  } catch (error) {
    return routeError(error);
  }
});

p4CalendarRoutes.get("/oauth/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state) return c.json({ error: "code_and_state_required" }, 400);
  try {
    const { userId } = verifyOAuthState(state, stateSecret());
    const client = makeGoogleCalendarClient(getGoogleCalendarConfig());
    const tokens = await client.exchangeCode(code);
    if (!tokens.refreshToken) return c.json({ error: "google_refresh_token_missing" }, 409);
    const existing = await integrationSettingRepo.findByUserAndService(userId, GOOGLE_CALENDAR_SERVICE);
    const id = existing?.id ?? uuidv4();
    await integrationSettingRepo.upsert({
      id,
      userId,
      service: GOOGLE_CALENDAR_SERVICE,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresAt: Date.now() + tokens.expiresIn * 1000,
      config: { scopes: tokens.scope?.split(" ") ?? [], syncToken: null },
      isActive: true,
    });
    await userRepo.update(userId, { calendarAccessId: id });
    return c.json({ connected: true, calendarRef: "primary" });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof RangeError ||
      error instanceof Error && error.message.includes("OAuth state")) {
      return c.json({ error: "invalid_oauth_state" }, 400);
    }
    return routeError(error);
  }
});

p4CalendarRoutes.post("/events", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const body = await c.req.json().catch(() => null);
  const input = eventInput(body);
  if (!input) return c.json({ error: "invalid_event" }, 400);
  try {
    const connection = await getGoogleCalendarAccess(userId);
    if (!connection) return c.json({ error: "google_calendar_not_connected" }, 409);
    const calendarRef = record(body)?.calendarRef === "primary" ? "primary" : "primary";
    const event = await makeGoogleCalendarClient(getGoogleCalendarConfig()).createEvent(
      connection.token, calendarRef, input as GoogleEventInput,
    );
    await syncLogRepo.create({ id: uuidv4(), userId, service: GOOGLE_CALENDAR_SERVICE, action: "create", externalId: event.id, status: "success" });
    return c.json({ event }, 201);
  } catch (error) {
    return routeError(error);
  }
});

p4CalendarRoutes.patch("/events/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const body = await c.req.json().catch(() => null);
  const input = eventInput(body, true);
  if (!input || Object.keys(input).length === 0) return c.json({ error: "invalid_event" }, 400);
  try {
    const connection = await getGoogleCalendarAccess(userId);
    if (!connection) return c.json({ error: "google_calendar_not_connected" }, 409);
    const event = await makeGoogleCalendarClient(getGoogleCalendarConfig()).patchEvent(
      connection.token, "primary", c.req.param("id"), input,
    );
    await syncLogRepo.create({ id: uuidv4(), userId, service: GOOGLE_CALENDAR_SERVICE, action: "update", externalId: event.id, status: "success" });
    return c.json({ event });
  } catch (error) {
    return routeError(error);
  }
});

p4CalendarRoutes.delete("/events/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  try {
    const connection = await getGoogleCalendarAccess(userId);
    if (!connection) return c.json({ error: "google_calendar_not_connected" }, 409);
    await makeGoogleCalendarClient(getGoogleCalendarConfig()).deleteEvent(connection.token, "primary", c.req.param("id"));
    await syncLogRepo.create({ id: uuidv4(), userId, service: GOOGLE_CALENDAR_SERVICE, action: "delete", externalId: c.req.param("id"), status: "success" });
    return c.json({ deleted: true });
  } catch (error) {
    return routeError(error);
  }
});

p4CalendarRoutes.get("/freebusy", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const range = rangeFromQuery(c);
  if (!range) return c.json({ error: "valid_time_range_required" }, 400);
  const local = recurringBusy(await personalEventRepo.findByUserId(userId), range.from, range.to);
  try {
    const connection = await getGoogleCalendarAccess(userId);
    if (!connection) return c.json({
      busy: mergeBusy(local), connected: false, warnings: ["google_calendar_not_connected"],
    });
    const google = await makeGoogleCalendarClient(getGoogleCalendarConfig()).freeBusy(
      connection.token, range.from.toISOString(), range.to.toISOString(),
    );
    return c.json({ busy: mergeBusy([...local, ...google]), connected: true, warnings: [] });
  } catch (error) {
    return routeError(error);
  }
});

p4CalendarRoutes.post("/sync", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  try {
    const connection = await getGoogleCalendarAccess(userId);
    if (!connection) return c.json({ error: "google_calendar_not_connected" }, 409);
    const config = record(connection.setting.config) ?? {};
    const storedSyncToken = typeof config.syncToken === "string" ? config.syncToken : undefined;
    const client = makeGoogleCalendarClient(getGoogleCalendarConfig());
    let reset = false;
    let result;
    try {
      result = await client.listEvents(connection.token, storedSyncToken);
    } catch (error) {
      if (!(error instanceof GoogleCalendarError) || error.status !== 410 || !storedSyncToken) throw error;
      reset = true;
      result = await client.listEvents(connection.token);
    }
    const mirrored = await mirrorGoogleEvents(userId, result.events);
    await integrationSettingRepo.update(connection.setting.id, {
      config: { ...config, syncToken: result.nextSyncToken },
    });
    await syncLogRepo.create({ id: uuidv4(), userId, service: GOOGLE_CALENDAR_SERVICE, action: "sync_pull", status: "success" });
    return c.json({ ...mirrored, syncTokenReset: reset });
  } catch (error) {
    return routeError(error);
  }
});
