import { integrationSettingRepo } from "../../src/db/repository.js";
import { secretManager } from "../../src/config/secrets.js";
import { makeGoogleCalendarClient, type GoogleCalendarConfig } from "./google-client.js";

export const GOOGLE_CALENDAR_SERVICE = "google_calendar";

export function getGoogleCalendarConfig(): GoogleCalendarConfig {
  return {
    clientId: secretManager.getRequired("GOOGLE_CLIENT_ID"),
    clientSecret: secretManager.getRequired("GOOGLE_CLIENT_SECRET"),
    redirectUri: secretManager.getRequired("GOOGLE_CALENDAR_REDIRECT_URI"),
  };
}

export async function getGoogleCalendarAccess(userId: string) {
  const setting = await integrationSettingRepo.findByUserAndService(userId, GOOGLE_CALENDAR_SERVICE);
  if (!setting?.isActive || !setting.refreshToken) return null;
  if (setting.accessToken && setting.tokenExpiresAt && setting.tokenExpiresAt > Date.now() + 60000) {
    return { token: setting.accessToken, setting };
  }
  const refreshed = await makeGoogleCalendarClient(getGoogleCalendarConfig()).refreshToken(setting.refreshToken);
  await integrationSettingRepo.update(setting.id, {
    accessToken: refreshed.accessToken,
    tokenExpiresAt: Date.now() + refreshed.expiresIn * 1000,
  });
  return { token: refreshed.accessToken, setting: { ...setting, accessToken: refreshed.accessToken } };
}
