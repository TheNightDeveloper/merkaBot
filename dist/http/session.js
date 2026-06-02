"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSessionCookie = createSessionCookie;
exports.clearSessionCookie = clearSessionCookie;
exports.readSessionFromCookie = readSessionFromCookie;
const node_crypto_1 = __importDefault(require("node:crypto"));
const SESSION_COOKIE_NAME = "merkabot_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
function createSessionCookie(config, userId, telegramId, secure) {
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
function clearSessionCookie(config, secure) {
    void config;
    return serializeCookie(SESSION_COOKIE_NAME, "", {
        httpOnly: true,
        maxAge: 0,
        sameSite: "Lax",
        secure,
        path: "/"
    });
}
function readSessionFromCookie(cookieHeader, config) {
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
        const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
        if (payload.expiresAt <= Date.now()) {
            return null;
        }
        return payload;
    }
    catch {
        return null;
    }
}
function signSessionToken(config, payload) {
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createSignature(encodedPayload, config.sessionSecret);
    return `${encodedPayload}.${signature}`;
}
function createSignature(encodedPayload, secret) {
    return node_crypto_1.default.createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}
function parseCookies(cookieHeader) {
    return cookieHeader
        .split(";")
        .map((item) => item.trim())
        .filter(Boolean)
        .reduce((cookies, entry) => {
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
function serializeCookie(name, value, options) {
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
function timingSafeEquals(left, right) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    if (leftBuffer.length !== rightBuffer.length) {
        return false;
    }
    return node_crypto_1.default.timingSafeEqual(leftBuffer, rightBuffer);
}
