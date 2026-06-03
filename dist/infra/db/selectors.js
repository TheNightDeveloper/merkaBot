"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ticketMessageColumns = exports.ticketColumns = exports.serviceColumns = exports.orderColumns = exports.planColumns = exports.userColumns = void 0;
const schema_1 = require("./schema");
exports.userColumns = {
    id: schema_1.users.id,
    telegramId: schema_1.users.telegramId,
    username: schema_1.users.username,
    displayName: schema_1.users.displayName,
    isAdmin: schema_1.users.isAdmin,
    trialUsed: schema_1.users.trialUsed,
    createdAt: schema_1.users.createdAt
};
exports.planColumns = {
    code: schema_1.plans.code,
    title: schema_1.plans.title,
    days: schema_1.plans.days,
    trafficBytes: schema_1.plans.trafficBytes,
    deviceLimit: schema_1.plans.deviceLimit,
    priceLabel: schema_1.plans.priceLabel,
    enabled: schema_1.plans.enabled,
    isTrial: schema_1.plans.isTrial
};
exports.orderColumns = {
    id: schema_1.orders.id,
    userId: schema_1.orders.userId,
    planCode: schema_1.orders.planCode,
    kind: schema_1.orders.kind,
    status: schema_1.orders.status,
    receiptFileId: schema_1.orders.receiptFileId,
    receiptText: schema_1.orders.receiptText,
    adminNote: schema_1.orders.adminNote,
    targetServiceId: schema_1.orders.targetServiceId,
    assignedAdminUserId: schema_1.orders.assignedAdminUserId,
    claimedAt: schema_1.orders.claimedAt,
    createdAt: schema_1.orders.createdAt,
    updatedAt: schema_1.orders.updatedAt
};
exports.serviceColumns = {
    id: schema_1.services.id,
    userId: schema_1.services.userId,
    planCode: schema_1.services.planCode,
    type: schema_1.services.type,
    status: schema_1.services.status,
    email: schema_1.services.email,
    subId: schema_1.services.subId,
    clientUuid: schema_1.services.clientUuid,
    inboundId: schema_1.services.inboundId,
    expiresAt: schema_1.services.expiresAt,
    trafficBytes: schema_1.services.trafficBytes,
    lastUsageUp: schema_1.services.lastUsageUp,
    lastUsageDown: schema_1.services.lastUsageDown,
    lastSyncAt: schema_1.services.lastSyncAt,
    reminded3dAt: schema_1.services.reminded3dAt,
    reminded1dAt: schema_1.services.reminded1dAt,
    createdAt: schema_1.services.createdAt,
    updatedAt: schema_1.services.updatedAt
};
exports.ticketColumns = {
    id: schema_1.tickets.id,
    userId: schema_1.tickets.userId,
    status: schema_1.tickets.status,
    assignedAdminUserId: schema_1.tickets.assignedAdminUserId,
    claimedAt: schema_1.tickets.claimedAt,
    createdAt: schema_1.tickets.createdAt,
    updatedAt: schema_1.tickets.updatedAt,
    closedAt: schema_1.tickets.closedAt
};
exports.ticketMessageColumns = {
    id: schema_1.ticketMessages.id,
    ticketId: schema_1.ticketMessages.ticketId,
    senderUserId: schema_1.ticketMessages.senderUserId,
    senderAdminId: schema_1.ticketMessages.senderAdminId,
    body: schema_1.ticketMessages.body,
    createdAt: schema_1.ticketMessages.createdAt
};
