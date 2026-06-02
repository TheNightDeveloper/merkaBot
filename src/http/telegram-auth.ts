import crypto from "node:crypto";

const INIT_DATA_MAX_AGE_MS = 60 * 60 * 1000;

type TelegramInitUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
};

export type TelegramMiniAppProfile = {
  telegramId: number;
  username?: string;
  displayName: string;
};

export function verifyTelegramInitData(initData: string, botToken: string): TelegramMiniAppProfile {
  const searchParams = new URLSearchParams(initData);
  const hash = searchParams.get("hash");

  if (!hash) {
    throw new Error("Telegram init data is missing its hash.");
  }

  const authDateRaw = searchParams.get("auth_date");
  const userRaw = searchParams.get("user");

  if (!authDateRaw || !userRaw) {
    throw new Error("Telegram init data is incomplete.");
  }

  const dataCheckString = [...searchParams.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const expectedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (!timingSafeEquals(hash, expectedHash)) {
    throw new Error("Telegram init data signature is invalid.");
  }

  const authDate = Number(authDateRaw) * 1000;

  if (!Number.isFinite(authDate)) {
    throw new Error("Telegram init data auth_date is invalid.");
  }

  const ageMs = Math.abs(Date.now() - authDate);

  if (ageMs > INIT_DATA_MAX_AGE_MS) {
    throw new Error("Telegram init data has expired.");
  }

  const user = JSON.parse(userRaw) as TelegramInitUser;

  if (!Number.isInteger(user.id) || user.id <= 0) {
    throw new Error("Telegram init data user payload is invalid.");
  }

  const displayName = [user.first_name?.trim(), user.last_name?.trim()]
    .filter(Boolean)
    .join(" ")
    || user.username?.trim()
    || "کاربر";

  return {
    telegramId: user.id,
    username: user.username?.trim() || undefined,
    displayName
  };
}

function timingSafeEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}
