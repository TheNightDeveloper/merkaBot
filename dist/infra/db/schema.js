"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ticketMessages = exports.tickets = exports.services = exports.orders = exports.plans = exports.users = void 0;
const sqlite_core_1 = require("drizzle-orm/sqlite-core");
exports.users = (0, sqlite_core_1.sqliteTable)("users", {
    id: (0, sqlite_core_1.integer)("id").primaryKey({ autoIncrement: true }),
    telegramId: (0, sqlite_core_1.integer)("telegram_id").notNull().unique(),
    username: (0, sqlite_core_1.text)("username"),
    displayName: (0, sqlite_core_1.text)("display_name").notNull(),
    isAdmin: (0, sqlite_core_1.integer)("is_admin", { mode: "boolean" }).notNull().default(false),
    trialUsed: (0, sqlite_core_1.integer)("trial_used", { mode: "boolean" }).notNull().default(false),
    createdAt: (0, sqlite_core_1.integer)("created_at", { mode: "timestamp_ms" }).notNull()
});
exports.plans = (0, sqlite_core_1.sqliteTable)("plans", {
    code: (0, sqlite_core_1.text)("code").primaryKey(),
    title: (0, sqlite_core_1.text)("title").notNull(),
    days: (0, sqlite_core_1.integer)("days").notNull(),
    trafficBytes: (0, sqlite_core_1.integer)("traffic_bytes").notNull(),
    deviceLimit: (0, sqlite_core_1.integer)("device_limit").notNull(),
    priceLabel: (0, sqlite_core_1.text)("price_label").notNull(),
    enabled: (0, sqlite_core_1.integer)("enabled", { mode: "boolean" }).notNull().default(true),
    isTrial: (0, sqlite_core_1.integer)("is_trial", { mode: "boolean" }).notNull().default(false)
});
exports.orders = (0, sqlite_core_1.sqliteTable)("orders", {
    id: (0, sqlite_core_1.integer)("id").primaryKey({ autoIncrement: true }),
    userId: (0, sqlite_core_1.integer)("user_id").notNull().references(() => exports.users.id),
    planCode: (0, sqlite_core_1.text)("plan_code").notNull().references(() => exports.plans.code),
    kind: (0, sqlite_core_1.text)("kind").$type().notNull(),
    status: (0, sqlite_core_1.text)("status").$type().notNull(),
    receiptFileId: (0, sqlite_core_1.text)("receipt_file_id"),
    receiptText: (0, sqlite_core_1.text)("receipt_text"),
    adminNote: (0, sqlite_core_1.text)("admin_note"),
    targetServiceId: (0, sqlite_core_1.integer)("target_service_id"),
    createdAt: (0, sqlite_core_1.integer)("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: (0, sqlite_core_1.integer)("updated_at", { mode: "timestamp_ms" }).notNull()
});
exports.services = (0, sqlite_core_1.sqliteTable)("services", {
    id: (0, sqlite_core_1.integer)("id").primaryKey({ autoIncrement: true }),
    userId: (0, sqlite_core_1.integer)("user_id").notNull().references(() => exports.users.id),
    planCode: (0, sqlite_core_1.text)("plan_code").notNull().references(() => exports.plans.code),
    type: (0, sqlite_core_1.text)("type").$type().notNull(),
    status: (0, sqlite_core_1.text)("status").$type().notNull(),
    email: (0, sqlite_core_1.text)("email").notNull().unique(),
    subId: (0, sqlite_core_1.text)("sub_id").notNull().unique(),
    clientUuid: (0, sqlite_core_1.text)("client_uuid").notNull(),
    inboundId: (0, sqlite_core_1.integer)("inbound_id").notNull(),
    expiresAt: (0, sqlite_core_1.integer)("expires_at", { mode: "timestamp_ms" }).notNull(),
    trafficBytes: (0, sqlite_core_1.integer)("traffic_bytes").notNull(),
    lastUsageUp: (0, sqlite_core_1.integer)("last_usage_up").notNull().default(0),
    lastUsageDown: (0, sqlite_core_1.integer)("last_usage_down").notNull().default(0),
    lastSyncAt: (0, sqlite_core_1.integer)("last_sync_at", { mode: "timestamp_ms" }),
    reminded3dAt: (0, sqlite_core_1.integer)("reminded_3d_at", { mode: "timestamp_ms" }),
    reminded1dAt: (0, sqlite_core_1.integer)("reminded_1d_at", { mode: "timestamp_ms" }),
    createdAt: (0, sqlite_core_1.integer)("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: (0, sqlite_core_1.integer)("updated_at", { mode: "timestamp_ms" }).notNull()
});
exports.tickets = (0, sqlite_core_1.sqliteTable)("tickets", {
    id: (0, sqlite_core_1.integer)("id").primaryKey({ autoIncrement: true }),
    userId: (0, sqlite_core_1.integer)("user_id").notNull().references(() => exports.users.id),
    status: (0, sqlite_core_1.text)("status").$type().notNull(),
    createdAt: (0, sqlite_core_1.integer)("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: (0, sqlite_core_1.integer)("updated_at", { mode: "timestamp_ms" }).notNull(),
    closedAt: (0, sqlite_core_1.integer)("closed_at", { mode: "timestamp_ms" })
});
exports.ticketMessages = (0, sqlite_core_1.sqliteTable)("ticket_messages", {
    id: (0, sqlite_core_1.integer)("id").primaryKey({ autoIncrement: true }),
    ticketId: (0, sqlite_core_1.integer)("ticket_id").notNull().references(() => exports.tickets.id),
    senderUserId: (0, sqlite_core_1.integer)("sender_user_id"),
    senderAdminId: (0, sqlite_core_1.integer)("sender_admin_id"),
    body: (0, sqlite_core_1.text)("body").notNull(),
    createdAt: (0, sqlite_core_1.integer)("created_at", { mode: "timestamp_ms" }).notNull()
});
