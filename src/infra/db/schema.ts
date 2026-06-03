import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import type { OrderKind, OrderStatus, ServiceStatus, ServiceType, TicketStatus } from "../../types";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  telegramId: integer("telegram_id").notNull().unique(),
  username: text("username"),
  displayName: text("display_name").notNull(),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  trialUsed: integer("trial_used", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull()
});

export const plans = sqliteTable("plans", {
  code: text("code").primaryKey(),
  title: text("title").notNull(),
  days: integer("days").notNull(),
  trafficBytes: integer("traffic_bytes").notNull(),
  deviceLimit: integer("device_limit").notNull(),
  priceLabel: text("price_label").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  isTrial: integer("is_trial", { mode: "boolean" }).notNull().default(false)
});

export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id),
  planCode: text("plan_code").notNull().references(() => plans.code),
  kind: text("kind").$type<OrderKind>().notNull(),
  status: text("status").$type<OrderStatus>().notNull(),
  receiptFileId: text("receipt_file_id"),
  receiptText: text("receipt_text"),
  adminNote: text("admin_note"),
  targetServiceId: integer("target_service_id"),
  assignedAdminUserId: integer("assigned_admin_user_id").references(() => users.id),
  claimedAt: integer("claimed_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull()
});

export const services = sqliteTable("services", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id),
  planCode: text("plan_code").notNull().references(() => plans.code),
  type: text("type").$type<ServiceType>().notNull(),
  status: text("status").$type<ServiceStatus>().notNull(),
  email: text("email").notNull().unique(),
  subId: text("sub_id").notNull().unique(),
  clientUuid: text("client_uuid").notNull(),
  inboundId: integer("inbound_id").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  trafficBytes: integer("traffic_bytes").notNull(),
  lastUsageUp: integer("last_usage_up").notNull().default(0),
  lastUsageDown: integer("last_usage_down").notNull().default(0),
  lastSyncAt: integer("last_sync_at", { mode: "timestamp_ms" }),
  reminded3dAt: integer("reminded_3d_at", { mode: "timestamp_ms" }),
  reminded1dAt: integer("reminded_1d_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull()
});

export const tickets = sqliteTable("tickets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id),
  status: text("status").$type<TicketStatus>().notNull(),
  assignedAdminUserId: integer("assigned_admin_user_id").references(() => users.id),
  claimedAt: integer("claimed_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  closedAt: integer("closed_at", { mode: "timestamp_ms" })
});

export const ticketMessages = sqliteTable("ticket_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticketId: integer("ticket_id").notNull().references(() => tickets.id),
  senderUserId: integer("sender_user_id"),
  senderAdminId: integer("sender_admin_id"),
  body: text("body").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull()
});
