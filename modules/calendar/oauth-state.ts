import { createHmac, timingSafeEqual } from "node:crypto";

interface OAuthStatePayload {
  userId: string;
  expiresAt: number;
}

function signature(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payload).digest();
}

export function createOAuthState(userId: string, secret: string, now = Date.now()): string {
  if (!userId || !secret) throw new Error("OAuth state requires userId and secret");
  const payload = Buffer.from(JSON.stringify({
    userId,
    expiresAt: now + 10 * 60 * 1000,
  } satisfies OAuthStatePayload)).toString("base64url");
  return `${payload}.${signature(payload, secret).toString("base64url")}`;
}

export function verifyOAuthState(state: string, secret: string, now = Date.now()): OAuthStatePayload {
  const [payload, encodedSignature, extra] = state.split(".");
  if (!payload || !encodedSignature || extra) throw new Error("Invalid OAuth state");
  const actual = Buffer.from(encodedSignature, "base64url");
  const expected = signature(payload, secret);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error("Invalid OAuth state signature");
  }
  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<OAuthStatePayload>;
  if (typeof parsed.userId !== "string" || typeof parsed.expiresAt !== "number" || parsed.expiresAt <= now) {
    throw new Error("Expired or malformed OAuth state");
  }
  return { userId: parsed.userId, expiresAt: parsed.expiresAt };
}
