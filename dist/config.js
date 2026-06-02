"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = loadConfig;
const dotenv_1 = require("dotenv");
const zod_1 = require("zod");
(0, dotenv_1.config)();
const envSchema = zod_1.z.object({
    BOT_TOKEN: zod_1.z.string().min(1),
    ADMIN_IDS: zod_1.z.string().min(1),
    PANEL_BASE_URL: zod_1.z.string().url(),
    PANEL_API_TOKEN: zod_1.z.string().min(1),
    PANEL_INBOUND_ID: zod_1.z.coerce.number().int().positive(),
    PAYMENT_CARD_TITLE: zod_1.z.string().min(1),
    PAYMENT_CARD_NUMBER: zod_1.z.string().min(1),
    PAYMENT_NOTES: zod_1.z.string().min(1),
    PORT: zod_1.z.coerce.number().int().positive().default(3000),
    WEBAPP_BASE_URL: zod_1.z.string().url().optional(),
    TELEGRAM_PROXY_URL: zod_1.z.string().url().optional(),
    SESSION_SECRET: zod_1.z.string().min(32),
    UPLOAD_DIR: zod_1.z.string().min(1).default("runtime/uploads"),
    APP_TZ: zod_1.z.string().min(1).default("Asia/Tehran"),
    SQLITE_PATH: zod_1.z.string().min(1).default("runtime/data/merkabot.db")
});
function loadConfig() {
    const parsed = envSchema.parse(process.env);
    const adminIds = parsed.ADMIN_IDS.split(",")
        .map((item) => Number(item.trim()))
        .filter((item) => Number.isInteger(item) && item > 0);
    if (adminIds.length === 0) {
        throw new Error("ADMIN_IDS must include at least one Telegram user id.");
    }
    return {
        botToken: parsed.BOT_TOKEN,
        adminIds,
        panelBaseUrl: parsed.PANEL_BASE_URL.replace(/\/+$/, ""),
        panelApiToken: parsed.PANEL_API_TOKEN,
        panelInboundId: parsed.PANEL_INBOUND_ID,
        paymentCardTitle: parsed.PAYMENT_CARD_TITLE,
        paymentCardNumber: parsed.PAYMENT_CARD_NUMBER,
        paymentNotes: parsed.PAYMENT_NOTES,
        port: parsed.PORT,
        webAppBaseUrl: (parsed.WEBAPP_BASE_URL ?? `http://localhost:${parsed.PORT}`).replace(/\/+$/, ""),
        telegramProxyUrl: parsed.TELEGRAM_PROXY_URL,
        sessionSecret: parsed.SESSION_SECRET,
        uploadDir: parsed.UPLOAD_DIR,
        appTz: parsed.APP_TZ,
        sqlitePath: parsed.SQLITE_PATH
    };
}
