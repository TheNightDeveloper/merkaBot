import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const envSchema = z.object({
  BOT_TOKEN: z.string().min(1),
  ADMIN_IDS: z.string().min(1),
  PANEL_BASE_URL: z.string().url(),
  PANEL_API_TOKEN: z.string().min(1),
  PANEL_INBOUND_ID: z.coerce.number().int().positive(),
  PAYMENT_CARD_TITLE: z.string().min(1),
  PAYMENT_CARD_NUMBER: z.string().min(1),
  PAYMENT_NOTES: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  WEBAPP_BASE_URL: z.string().url().optional(),
  SESSION_SECRET: z.string().min(32),
  UPLOAD_DIR: z.string().min(1).default("runtime/uploads"),
  APP_TZ: z.string().min(1).default("Asia/Tehran"),
  SQLITE_PATH: z.string().min(1).default("runtime/data/merkabot.db")
});

export type AppConfig = {
  botToken: string;
  adminIds: number[];
  panelBaseUrl: string;
  panelApiToken: string;
  panelInboundId: number;
  paymentCardTitle: string;
  paymentCardNumber: string;
  paymentNotes: string;
  port: number;
  webAppBaseUrl: string;
  sessionSecret: string;
  uploadDir: string;
  appTz: string;
  sqlitePath: string;
};

export function loadConfig(): AppConfig {
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
    sessionSecret: parsed.SESSION_SECRET,
    uploadDir: parsed.UPLOAD_DIR,
    appTz: parsed.APP_TZ,
    sqlitePath: parsed.SQLITE_PATH
  };
}
