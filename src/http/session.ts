import crypto from "node:crypto";

import type { AppConfig } from "../config";

const SESSION_COOKIE_NAME = "merkabot_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

type SessionPayload = {
  userId: number;
  telegramId: number;
  issuedAt: number;
  expiresAt: number;
};

export function createSessionCookie(config: AppConfig, userId: number, telegramId: number, secure: boolean) {
  const issuedAt = Date.now();
  const expiresAt = issuedAt + SESSION_TTL_MS;
  const token = signSessionToken(config, {
    userId,
    telegramId,
    issuedAt,
    expiresAt
  });

  return serializeCookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    maxAge: SESSION_TTL_MS,
    sameSite: "Lax",
    secure,
    path: "/"
  });
}

export function clearSessionCookie(config: AppConfig, secure: boolean) {
  void config;

  return serializeCookie(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    maxAge: 0,
    sameSite: "Lax",
    secure,
    path: "/"
  });
}

export function readSessionFromCookie(cookieHeader: string | undefined, config: AppConfig): SessionPayload | null {
  if (!cookieHeader) {
    return null;
  }

  const cookies = parseCookies(cookieHeader);
  const token = cookies[SESSION_COOKIE_NAME];

  if (!token) {
    return null;
  }

  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = createSignature(encodedPayload, config.sessionSecret);

  if (!timingSafeEquals(signature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as SessionPayload;

    if (payload.expiresAt <= Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function signSessionToken(config: AppConfig, payload: SessionPayload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createSignature(encodedPayload, config.sessionSecret);
  return `${encodedPayload}.${signature}`;
}

function createSignature(encodedPayload: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function parseCookies(cookieHeader: string) {
  return cookieHeader
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((cookies, entry) => {
      const separatorIndex = entry.indexOf("=");

      if (separatorIndex === -1) {
        return cookies;
      }

      const key = entry.slice(0, separatorIndex).trim();
      const value = entry.slice(separatorIndex + 1).trim();
      cookies[key] = value;
      return cookies;
    }, {});
}

function serializeCookie(
  name: string,
  value: string,
  options: {
    httpOnly: boolean;
    maxAge: number;
    sameSite: "Lax";
    secure: boolean;
    path: string;
  }
) {
  const parts = [
    `${name}=${value}`,
    `Path=${options.path}`,
    `Max-Age=${Math.floor(options.maxAge / 1000)}`,
    `SameSite=${options.sameSite}`
  ];

  if (options.httpOnly) {
    parts.push("HttpOnly");
  }

  if (options.secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function timingSafeEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}
