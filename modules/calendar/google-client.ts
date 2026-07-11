export class GoogleCalendarError extends Error {
  constructor(public status: number, public operation: string) {
    super(`Google Calendar ${operation} failed with HTTP ${status}`);
    this.name = "GoogleCalendarError";
  }
}

export interface GoogleCalendarConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface GoogleTokenResult {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  scope: string | null;
}

export interface GoogleEventInput {
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
  extendedProperties?: { private?: Record<string, string> };
}

export interface GoogleEvent {
  id: string;
  status: string;
  summary: string;
  description: string;
  start: string;
  end: string;
  extendedProperties: { private: Record<string, string> };
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Google response");
  return value as Record<string, unknown>;
}

function string(value: unknown, field: string): string {
  if (typeof value !== "string" || !value) throw new Error(`Invalid Google response field: ${field}`);
  return value;
}

function tokenResult(value: unknown): GoogleTokenResult {
  const row = object(value);
  return {
    accessToken: string(row.access_token, "access_token"),
    refreshToken: typeof row.refresh_token === "string" ? row.refresh_token : null,
    expiresIn: typeof row.expires_in === "number" ? row.expires_in : 3600,
    scope: typeof row.scope === "string" ? row.scope : null,
  };
}

function normalizeEvent(value: unknown): GoogleEvent {
  const row = object(value);
  const status = typeof row.status === "string" ? row.status : "confirmed";
  const start = status === "cancelled" && row.start === undefined ? {} : object(row.start);
  const end = status === "cancelled" && row.end === undefined ? {} : object(row.end);
  const extended = row.extendedProperties ? object(row.extendedProperties) : {};
  const privateProperties = extended.private ? object(extended.private) : {};
  return {
    id: string(row.id, "event.id"),
    status,
    summary: typeof row.summary === "string" ? row.summary : "(untitled)",
    description: typeof row.description === "string" ? row.description : "",
    start: status === "cancelled" ? String(start.dateTime ?? start.date ?? "") : string(start.dateTime ?? start.date, "event.start"),
    end: status === "cancelled" ? String(end.dateTime ?? end.date ?? "") : string(end.dateTime ?? end.date, "event.end"),
    extendedProperties: { private: Object.fromEntries(
      Object.entries(privateProperties).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    ) },
  };
}

async function responseJson(response: Response, operation: string): Promise<unknown> {
  if (!response.ok) {
    await response.body?.cancel();
    throw new GoogleCalendarError(response.status, operation);
  }
  return response.json();
}

export function makeGoogleCalendarClient(config: GoogleCalendarConfig) {
  async function tokenRequest(values: Record<string, string>): Promise<GoogleTokenResult> {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...values }),
    });
    return tokenResult(await responseJson(response, "token exchange"));
  }

  async function calendarRequest(accessToken: string, method: string, path: string, body?: unknown) {
    const response = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
      method,
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/json",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status === 204) return null;
    return responseJson(response, `${method} ${path.split("?")[0]}`);
  }

  return {
    authorizationUrl(state: string) {
      const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: "code",
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "true",
        scope: [
          "https://www.googleapis.com/auth/calendar.events",
          "https://www.googleapis.com/auth/calendar.freebusy",
        ].join(" "),
        state,
      });
      return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    },
    exchangeCode: (code: string) => tokenRequest({
      code, redirect_uri: config.redirectUri, grant_type: "authorization_code",
    }),
    refreshToken: (refreshToken: string) => tokenRequest({
      refresh_token: refreshToken, grant_type: "refresh_token",
    }),
    async createEvent(accessToken: string, calendarRef: string, event: GoogleEventInput) {
      const value = await calendarRequest(accessToken, "POST", `/calendars/${encodeURIComponent(calendarRef)}/events`, event);
      return normalizeEvent(value);
    },
    async patchEvent(accessToken: string, calendarRef: string, eventId: string, event: Partial<GoogleEventInput>) {
      const value = await calendarRequest(accessToken, "PATCH", `/calendars/${encodeURIComponent(calendarRef)}/events/${encodeURIComponent(eventId)}`, event);
      return normalizeEvent(value);
    },
    async deleteEvent(accessToken: string, calendarRef: string, eventId: string) {
      await calendarRequest(accessToken, "DELETE", `/calendars/${encodeURIComponent(calendarRef)}/events/${encodeURIComponent(eventId)}`);
    },
    async freeBusy(accessToken: string, timeMin: string, timeMax: string) {
      const value = object(await calendarRequest(accessToken, "POST", "/freeBusy", {
        timeMin, timeMax, items: [{ id: "primary" }],
      }));
      const calendars = object(value.calendars);
      const primary = object(calendars.primary);
      if (!Array.isArray(primary.busy)) throw new Error("Invalid Google freeBusy response");
      return primary.busy.map((item) => {
        const interval = object(item);
        return { start: string(interval.start, "busy.start"), end: string(interval.end, "busy.end") };
      });
    },
    async listEvents(accessToken: string, syncToken?: string) {
      const events: GoogleEvent[] = [];
      let pageToken: string | undefined;
      let nextSyncToken: string | undefined;
      do {
        const params = new URLSearchParams({ showDeleted: "true", singleEvents: "true", maxResults: "2500" });
        if (syncToken) params.set("syncToken", syncToken);
        if (pageToken) params.set("pageToken", pageToken);
        const value = object(await calendarRequest(accessToken, "GET", `/calendars/primary/events?${params}`));
        if (!Array.isArray(value.items)) throw new Error("Invalid Google events response");
        events.push(...value.items.map(normalizeEvent));
        pageToken = typeof value.nextPageToken === "string" ? value.nextPageToken : undefined;
        nextSyncToken = typeof value.nextSyncToken === "string" ? value.nextSyncToken : nextSyncToken;
      } while (pageToken);
      if (!nextSyncToken) throw new Error("Google events response omitted nextSyncToken");
      return { events, nextSyncToken };
    },
  };
}
