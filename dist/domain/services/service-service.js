"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServiceService = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const drizzle_orm_1 = require("drizzle-orm");
const selectors_1 = require("../../infra/db/selectors");
const sanitize_1 = require("../../infra/db/sanitize");
const schema_1 = require("../../infra/db/schema");
const format_1 = require("../../utils/format");
const time_1 = require("../../utils/time");
class ServiceService {
    db;
    config;
    gateway;
    orderService;
    planService;
    userService;
    persist;
    constructor(db, config, gateway, orderService, planService, userService, persist) {
        this.db = db;
        this.config = config;
        this.gateway = gateway;
        this.orderService = orderService;
        this.planService = planService;
        this.userService = userService;
        this.persist = persist;
    }
    async requestTrial(userTelegramId) {
        const user = await this.userService.getByTelegramId(userTelegramId);
        if (!user) {
            throw new Error("User not found.");
        }
        if (user.trialUsed) {
            throw new Error("شما قبلا اکانت تست دریافت کرده اید.");
        }
        const paidServiceRows = await this.db
            .select(selectors_1.serviceColumns)
            .from(schema_1.services)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.services.userId, user.id), (0, drizzle_orm_1.eq)(schema_1.services.status, "active")))
            .limit(1);
        const paidService = paidServiceRows[0] ?? null;
        if (paidService) {
            throw new Error("برای کاربر دارای سرویس فعال، اکانت تست صادر نمی شود.");
        }
        const trialPlan = await this.planService.getTrialPlan();
        if (!trialPlan) {
            throw new Error("پلن تست فعال نشده است.");
        }
        const order = await this.orderService.createOrder({
            userId: user.id,
            planCode: trialPlan.code,
            kind: "trial",
            initialStatus: "approved"
        });
        const service = await this.fulfillApprovedOrder(order.id);
        await this.userService.markTrialUsed(user.id);
        return service;
    }
    async fulfillApprovedOrder(orderId) {
        const bundle = await this.orderService.getOrderWithRelations(orderId);
        if (!bundle) {
            throw new Error("Order not found.");
        }
        if (bundle.order.status === "fulfilled" && bundle.service) {
            return bundle.service;
        }
        if (!["approved", "under_review"].includes(bundle.order.status)) {
            throw new Error("Order is not ready for fulfillment.");
        }
        const now = new Date();
        const serviceType = bundle.order.kind === "trial" ? "trial" : "paid";
        try {
            if (bundle.order.kind === "renew") {
                if (!bundle.service) {
                    throw new Error("Renew order target service not found.");
                }
                await this.orderService.markApproved(orderId);
                const nextBase = bundle.service.expiresAt > now ? bundle.service.expiresAt : now;
                const nextExpiry = (0, time_1.addDays)(nextBase, bundle.plan.days);
                const payload = {
                    id: bundle.service.clientUuid,
                    email: bundle.service.email,
                    subId: bundle.service.subId,
                    limitIp: bundle.plan.deviceLimit,
                    totalGB: bundle.plan.trafficBytes,
                    expiryTime: nextExpiry.getTime(),
                    enable: true,
                    flow: "",
                    tgId: String(bundle.user.telegramId),
                    comment: bundle.plan.title
                };
                await this.gateway.updateClient(bundle.service.email, payload, this.config.panelInboundId);
                await this.gateway.resetTraffic(bundle.service.email);
                const [updatedService] = await this.db
                    .update(schema_1.services)
                    .set((0, sanitize_1.withoutUndefined)({
                    planCode: bundle.plan.code,
                    status: "active",
                    expiresAt: nextExpiry,
                    trafficBytes: bundle.plan.trafficBytes,
                    lastUsageUp: 0,
                    lastUsageDown: 0,
                    lastSyncAt: now,
                    reminded3dAt: null,
                    reminded1dAt: null,
                    updatedAt: now
                }))
                    .where((0, drizzle_orm_1.eq)(schema_1.services.id, bundle.service.id))
                    .returning();
                await this.persist();
                await this.orderService.markFulfilled(orderId);
                return updatedService;
            }
            await this.orderService.markApproved(orderId);
            const nextExpiry = (0, time_1.addDays)(now, bundle.plan.days);
            const identity = this.buildClientIdentity(bundle.user.telegramId, bundle.order.id);
            const payload = {
                id: identity.clientUuid,
                email: identity.email,
                subId: identity.subId,
                limitIp: bundle.plan.deviceLimit,
                totalGB: bundle.plan.trafficBytes,
                expiryTime: nextExpiry.getTime(),
                enable: true,
                flow: "",
                tgId: String(bundle.user.telegramId),
                comment: bundle.plan.title
            };
            const existingClient = await this.gateway.getClient(identity.email);
            const provisioned = existingClient
                ? identity
                : await this.gateway.createClient(payload, this.config.panelInboundId);
            const [createdService] = await this.db
                .insert(schema_1.services)
                .values((0, sanitize_1.withoutUndefined)({
                userId: bundle.user.id,
                planCode: bundle.plan.code,
                type: serviceType,
                status: "active",
                email: provisioned.email,
                subId: provisioned.subId,
                clientUuid: provisioned.clientUuid,
                inboundId: this.config.panelInboundId,
                expiresAt: nextExpiry,
                trafficBytes: bundle.plan.trafficBytes,
                lastUsageUp: 0,
                lastUsageDown: 0,
                createdAt: now,
                updatedAt: now,
                lastSyncAt: now,
                reminded3dAt: null,
                reminded1dAt: null
            }))
                .returning();
            await this.persist();
            await this.orderService.markFulfilled(orderId);
            return createdService;
        }
        catch (error) {
            await this.orderService.revertToReview(orderId, error instanceof Error ? error.message : "Provisioning failed.");
            throw error;
        }
    }
    async listUserServices(telegramId) {
        const user = await this.userService.getByTelegramId(telegramId);
        if (!user) {
            return [];
        }
        return this.db
            .select(selectors_1.serviceColumns)
            .from(schema_1.services)
            .where((0, drizzle_orm_1.eq)(schema_1.services.userId, user.id))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.services.createdAt));
    }
    async listServicesForUserId(userId) {
        return this.db
            .select(selectors_1.serviceColumns)
            .from(schema_1.services)
            .where((0, drizzle_orm_1.eq)(schema_1.services.userId, userId))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.services.createdAt));
    }
    async listServicesForTelegramUser(telegramId) {
        const user = await this.userService.getByTelegramId(telegramId);
        if (!user) {
            return [];
        }
        return this.listServicesForUserId(user.id);
    }
    async getServiceById(serviceId) {
        const rows = await this.db
            .select(selectors_1.serviceColumns)
            .from(schema_1.services)
            .where((0, drizzle_orm_1.eq)(schema_1.services.id, serviceId))
            .limit(1);
        return rows[0] ?? null;
    }
    async createRenewOrder(telegramId, serviceId) {
        const user = await this.userService.getByTelegramId(telegramId);
        if (!user) {
            throw new Error("User not found.");
        }
        const rows = await this.db
            .select(selectors_1.serviceColumns)
            .from(schema_1.services)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.services.id, serviceId), (0, drizzle_orm_1.eq)(schema_1.services.userId, user.id)))
            .limit(1);
        const service = rows[0] ?? null;
        if (!service) {
            throw new Error("سرویس مورد نظر پیدا نشد.");
        }
        return this.orderService.createOrder({
            userId: user.id,
            planCode: service.planCode,
            kind: "renew",
            targetServiceId: service.id
        });
    }
    async syncActiveServices() {
        const activeServices = await this.db
            .select(selectors_1.serviceColumns)
            .from(schema_1.services)
            .where((0, drizzle_orm_1.eq)(schema_1.services.status, "active"));
        const now = new Date();
        for (const service of activeServices) {
            try {
                const traffic = await this.gateway.getTraffic(service.email);
                const status = service.expiresAt <= now ? "expired" : "active";
                await this.db
                    .update(schema_1.services)
                    .set((0, sanitize_1.withoutUndefined)({
                    lastUsageUp: traffic.up,
                    lastUsageDown: traffic.down,
                    lastSyncAt: now,
                    status,
                    updatedAt: now
                }))
                    .where((0, drizzle_orm_1.eq)(schema_1.services.id, service.id));
                await this.persist();
            }
            catch {
                continue;
            }
        }
    }
    async reconcileExpiredServices() {
        const now = new Date();
        await this.db
            .update(schema_1.services)
            .set((0, sanitize_1.withoutUndefined)({
            status: "expired",
            updatedAt: now
        }))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.services.status, "active"), (0, drizzle_orm_1.lte)(schema_1.services.expiresAt, now)));
        await this.persist();
    }
    async findReminderCandidates(daysBeforeExpiry) {
        const now = new Date();
        const start = new Date(now.getTime() + daysBeforeExpiry * 24 * 60 * 60 * 1000);
        const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
        const reminderColumn = daysBeforeExpiry === 3 ? schema_1.services.reminded3dAt : schema_1.services.reminded1dAt;
        return this.db
            .select({
            service: selectors_1.serviceColumns,
            user: selectors_1.userColumns
        })
            .from(schema_1.services)
            .innerJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.services.userId, schema_1.users.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.services.status, "active"), (0, drizzle_orm_1.gte)(schema_1.services.expiresAt, start), (0, drizzle_orm_1.lte)(schema_1.services.expiresAt, end), (0, drizzle_orm_1.isNull)(reminderColumn)));
    }
    async markReminderSent(serviceId, daysBeforeExpiry) {
        const now = new Date();
        await this.db
            .update(schema_1.services)
            .set((0, sanitize_1.withoutUndefined)({
            ...(daysBeforeExpiry === 3 ? { reminded3dAt: now } : { reminded1dAt: now }),
            updatedAt: now
        }))
            .where((0, drizzle_orm_1.eq)(schema_1.services.id, serviceId));
        await this.persist();
    }
    async buildServiceDeliveryMessage(serviceId) {
        const service = await this.getServiceById(serviceId);
        if (!service) {
            throw new Error("Service not found.");
        }
        const links = await this.gateway.getLinks(service.email);
        const subLinks = await this.gateway.getSubLink(service.subId);
        return this.composeServiceText(service, links, subLinks);
    }
    async buildServiceSummary(serviceId) {
        const service = await this.getServiceById(serviceId);
        if (!service) {
            throw new Error("Service not found.");
        }
        return this.composeSummaryText(service);
    }
    buildClientIdentity(telegramId, orderId) {
        const shortId = node_crypto_1.default.createHash("sha256").update(`${telegramId}:${orderId}`).digest("hex").slice(0, 12);
        return {
            email: `tg${telegramId}_o${orderId}_${shortId.slice(0, 4)}`,
            clientUuid: toDeterministicUuid(shortId),
            subId: toDeterministicUuid(shortId.split("").reverse().join(""))
        };
    }
    composeServiceText(service, links, subLinks) {
        const sections = [
            "سرویس شما آماده شد.",
            this.composeSummaryText(service),
            links.length > 0 ? `لینک اتصال:\n${links.join("\n")}` : "لینک اتصال در پاسخ پنل موجود نبود.",
            subLinks.length > 0 ? `ساب لینک:\n${subLinks.join("\n")}` : "ساب لینک در پاسخ پنل موجود نبود."
        ];
        return sections.join("\n\n");
    }
    composeSummaryText(service) {
        const used = service.lastUsageDown + service.lastUsageUp;
        return [
            `شناسه سرویس: ${service.id}`,
            `وضعیت: ${(0, format_1.formatServiceStatus)(service.status)}`,
            `انقضا: ${(0, format_1.formatDate)(service.expiresAt)}`,
            `سقف ترافیک: ${(0, format_1.formatBytes)(service.trafficBytes)}`,
            `مصرف ثبت شده: ${(0, format_1.formatBytes)(used)}`,
            `ایمیل پنل: ${service.email}`
        ].join("\n");
    }
}
exports.ServiceService = ServiceService;
function toDeterministicUuid(seed) {
    const expanded = node_crypto_1.default.createHash("sha256").update(seed).digest("hex").slice(0, 32);
    return [
        expanded.slice(0, 8),
        expanded.slice(8, 12),
        "4" + expanded.slice(13, 16),
        "a" + expanded.slice(17, 20),
        expanded.slice(20, 32)
    ].join("-");
}
