import crypto from "node:crypto";

import { and, desc, eq, gte, isNull, lte } from "drizzle-orm";

import type { AppConfig } from "../../config";
import type { AppDatabase } from "../../infra/db/client";
import { orderColumns, planColumns, serviceColumns, userColumns } from "../../infra/db/selectors";
import { withoutUndefined } from "../../infra/db/sanitize";
import { orders, plans, services, users } from "../../infra/db/schema";
import { ThreeXUiGateway } from "../../infra/3xui/gateway";
import type { ProvisionedClient } from "../../infra/3xui/types";
import { formatBytes, formatDate, formatServiceStatus } from "../../utils/format";
import { addDays } from "../../utils/time";
import type { ServiceStatus, ServiceType } from "../../types";
import { OrderService } from "../orders/order-service";
import { PlanService } from "../plans/plan-service";
import { UserService } from "../users/user-service";

export class ServiceService {
  constructor(
    private readonly db: AppDatabase,
    private readonly config: AppConfig,
    private readonly gateway: ThreeXUiGateway,
    private readonly orderService: OrderService,
    private readonly planService: PlanService,
    private readonly userService: UserService,
    private readonly persist: () => Promise<void>
  ) {}

  async requestTrial(userTelegramId: number) {
    const user = await this.userService.getByTelegramId(userTelegramId);

    if (!user) {
      throw new Error("User not found.");
    }

    if (user.trialUsed) {
      throw new Error("شما قبلا اکانت تست دریافت کرده اید.");
    }

    const paidServiceRows = await this.db
      .select(serviceColumns)
      .from(services)
      .where(and(eq(services.userId, user.id), eq(services.status, "active")))
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

  async fulfillApprovedOrder(orderId: number) {
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
    const serviceType: ServiceType = bundle.order.kind === "trial" ? "trial" : "paid";

    try {
      if (bundle.order.kind === "renew") {
        if (!bundle.service) {
          throw new Error("Renew order target service not found.");
        }

        await this.orderService.markApproved(orderId);

        const nextBase = bundle.service.expiresAt > now ? bundle.service.expiresAt : now;
        const nextExpiry = addDays(nextBase, bundle.plan.days);
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
          .update(services)
          .set(withoutUndefined({
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
          .where(eq(services.id, bundle.service.id))
          .returning();
        await this.persist();

        await this.orderService.markFulfilled(orderId);
        return updatedService;
      }

      await this.orderService.markApproved(orderId);

      const nextExpiry = addDays(now, bundle.plan.days);
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
        .insert(services)
        .values(withoutUndefined({
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
    } catch (error) {
      await this.orderService.revertToReview(orderId, error instanceof Error ? error.message : "Provisioning failed.");
      throw error;
    }
  }

  async listUserServices(telegramId: number) {
    const user = await this.userService.getByTelegramId(telegramId);

    if (!user) {
      return [];
    }

    return this.db
      .select(serviceColumns)
      .from(services)
      .where(eq(services.userId, user.id))
      .orderBy(desc(services.createdAt));
  }

  async listServicesForUserId(userId: number) {
    return this.db
      .select(serviceColumns)
      .from(services)
      .where(eq(services.userId, userId))
      .orderBy(desc(services.createdAt));
  }

  async listServicesWithPlanForUserId(userId: number) {
    return this.db
      .select({
        service: serviceColumns,
        plan: planColumns
      })
      .from(services)
      .innerJoin(plans, eq(services.planCode, plans.code))
      .where(eq(services.userId, userId))
      .orderBy(desc(services.createdAt));
  }

  async listServicesForTelegramUser(telegramId: number) {
    const user = await this.userService.getByTelegramId(telegramId);
    if (!user) {
      return [];
    }

    return this.listServicesForUserId(user.id);
  }

  async getServiceById(serviceId: number) {
    const rows = await this.db
      .select(serviceColumns)
      .from(services)
      .where(eq(services.id, serviceId))
      .limit(1);

    return rows[0] ?? null;
  }

  async getServiceWithPlanForUserId(userId: number, serviceId: number) {
    return this.db
      .select({
        service: serviceColumns,
        plan: planColumns
      })
      .from(services)
      .innerJoin(plans, eq(services.planCode, plans.code))
      .where(and(eq(services.id, serviceId), eq(services.userId, userId)))
      .limit(1)
      .then((rows) => rows[0] ?? null);
  }

  async createRenewOrder(telegramId: number, serviceId: number) {
    const user = await this.userService.getByTelegramId(telegramId);

    if (!user) {
      throw new Error("User not found.");
    }

    const rows = await this.db
      .select(serviceColumns)
      .from(services)
      .where(and(eq(services.id, serviceId), eq(services.userId, user.id)))
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
      .select(serviceColumns)
      .from(services)
      .where(eq(services.status, "active"));

    const now = new Date();

    for (const service of activeServices) {
      try {
        const traffic = await this.gateway.getTraffic(service.email);
        const status: ServiceStatus = service.expiresAt <= now ? "expired" : "active";

        await this.db
          .update(services)
          .set(withoutUndefined({
            lastUsageUp: traffic.up,
            lastUsageDown: traffic.down,
            lastSyncAt: now,
            status,
            updatedAt: now
          }))
          .where(eq(services.id, service.id));
        await this.persist();
      } catch {
        continue;
      }
    }
  }

  async reconcileExpiredServices() {
    const now = new Date();
    await this.db
      .update(services)
      .set(withoutUndefined({
        status: "expired",
        updatedAt: now
      }))
      .where(and(eq(services.status, "active"), lte(services.expiresAt, now)));
    await this.persist();
  }

  async findReminderCandidates(daysBeforeExpiry: 1 | 3) {
    const now = new Date();
    const start = new Date(now.getTime() + daysBeforeExpiry * 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const reminderColumn = daysBeforeExpiry === 3 ? services.reminded3dAt : services.reminded1dAt;

    return this.db
      .select({
        service: serviceColumns,
        user: userColumns
      })
      .from(services)
      .innerJoin(users, eq(services.userId, users.id))
      .where(
        and(
          eq(services.status, "active"),
          gte(services.expiresAt, start),
          lte(services.expiresAt, end),
          isNull(reminderColumn)
        )
      );
  }

  async markReminderSent(serviceId: number, daysBeforeExpiry: 1 | 3) {
    const now = new Date();
    await this.db
      .update(services)
      .set(withoutUndefined({
        ...(daysBeforeExpiry === 3 ? { reminded3dAt: now } : { reminded1dAt: now }),
        updatedAt: now
      }))
      .where(eq(services.id, serviceId));
    await this.persist();
  }

  async buildServiceDeliveryMessage(serviceId: number) {
    const service = await this.getServiceById(serviceId);

    if (!service) {
      throw new Error("Service not found.");
    }

    const links = await this.gateway.getLinks(service.email);
    const subLinks = await this.gateway.getSubLink(service.subId);

    return this.composeServiceText(service, links, subLinks);
  }

  async buildServiceSummary(serviceId: number) {
    const service = await this.getServiceById(serviceId);

    if (!service) {
      throw new Error("Service not found.");
    }

    return this.composeSummaryText(service);
  }

  private buildClientIdentity(telegramId: number, orderId: number): ProvisionedClient {
    const shortId = crypto.createHash("sha256").update(`${telegramId}:${orderId}`).digest("hex").slice(0, 12);
    return {
      email: `tg${telegramId}_o${orderId}_${shortId.slice(0, 4)}`,
      clientUuid: toDeterministicUuid(shortId),
      subId: toDeterministicUuid(shortId.split("").reverse().join(""))
    };
  }

  private composeServiceText(
    service: typeof services.$inferSelect,
    links: string[],
    subLinks: string[]
  ): string {
    const sections = [
      "سرویس شما آماده شد.",
      this.composeSummaryText(service),
      links.length > 0 ? `لینک اتصال:\n${links.join("\n")}` : "لینک اتصال در پاسخ پنل موجود نبود.",
      subLinks.length > 0 ? `ساب لینک:\n${subLinks.join("\n")}` : "ساب لینک در پاسخ پنل موجود نبود."
    ];

    return sections.join("\n\n");
  }

  private composeSummaryText(service: typeof services.$inferSelect): string {
    const used = service.lastUsageDown + service.lastUsageUp;
    return [
      `شناسه سرویس: ${service.id}`,
      `وضعیت: ${formatServiceStatus(service.status)}`,
      `انقضا: ${formatDate(service.expiresAt)}`,
      `سقف ترافیک: ${formatBytes(service.trafficBytes)}`,
      `مصرف ثبت شده: ${formatBytes(used)}`,
      `ایمیل پنل: ${service.email}`
    ].join("\n");
  }
}

function toDeterministicUuid(seed: string): string {
  const expanded = crypto.createHash("sha256").update(seed).digest("hex").slice(0, 32);
  return [
    expanded.slice(0, 8),
    expanded.slice(8, 12),
    "4" + expanded.slice(13, 16),
    "a" + expanded.slice(17, 20),
    expanded.slice(20, 32)
  ].join("-");
}
