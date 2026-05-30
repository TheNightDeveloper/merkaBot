import { orders, plans, services, ticketMessages, tickets, users } from "./schema";

export const userColumns = {
  id: users.id,
  telegramId: users.telegramId,
  username: users.username,
  displayName: users.displayName,
  isAdmin: users.isAdmin,
  trialUsed: users.trialUsed,
  createdAt: users.createdAt
};

export const planColumns = {
  code: plans.code,
  title: plans.title,
  days: plans.days,
  trafficBytes: plans.trafficBytes,
  deviceLimit: plans.deviceLimit,
  priceLabel: plans.priceLabel,
  enabled: plans.enabled,
  isTrial: plans.isTrial
};

export const orderColumns = {
  id: orders.id,
  userId: orders.userId,
  planCode: orders.planCode,
  kind: orders.kind,
  status: orders.status,
  receiptFileId: orders.receiptFileId,
  receiptText: orders.receiptText,
  adminNote: orders.adminNote,
  targetServiceId: orders.targetServiceId,
  createdAt: orders.createdAt,
  updatedAt: orders.updatedAt
};

export const serviceColumns = {
  id: services.id,
  userId: services.userId,
  planCode: services.planCode,
  type: services.type,
  status: services.status,
  email: services.email,
  subId: services.subId,
  clientUuid: services.clientUuid,
  inboundId: services.inboundId,
  expiresAt: services.expiresAt,
  trafficBytes: services.trafficBytes,
  lastUsageUp: services.lastUsageUp,
  lastUsageDown: services.lastUsageDown,
  lastSyncAt: services.lastSyncAt,
  reminded3dAt: services.reminded3dAt,
  reminded1dAt: services.reminded1dAt,
  createdAt: services.createdAt,
  updatedAt: services.updatedAt
};

export const ticketColumns = {
  id: tickets.id,
  userId: tickets.userId,
  status: tickets.status,
  createdAt: tickets.createdAt,
  updatedAt: tickets.updatedAt,
  closedAt: tickets.closedAt
};

export const ticketMessageColumns = {
  id: ticketMessages.id,
  ticketId: ticketMessages.ticketId,
  senderUserId: ticketMessages.senderUserId,
  senderAdminId: ticketMessages.senderAdminId,
  body: ticketMessages.body,
  createdAt: ticketMessages.createdAt
};
