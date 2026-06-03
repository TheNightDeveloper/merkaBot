import fs from "node:fs";
import path from "node:path";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Readable } from "node:stream";

import type { Telegraf } from "telegraf";

import type { AppServices } from "../app";
import { notifyAdminsOfOrder, notifyAdminsOfTicket } from "../bot/notifications";
import type { BotContext } from "../bot/context";
import type { AppConfig } from "../config";
import { logger } from "../infra/logger";
import type { AppAuthenticatedUser, AppRequestContext } from "./types";
import { clearSessionCookie, createSessionCookie, readSessionFromCookie } from "./session";
import { verifyTelegramInitData } from "./telegram-auth";

const STATIC_ROOT = path.resolve(process.cwd(), "dist/web");
const MAX_RECEIPT_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export function createHttpServer(
  config: AppConfig,
  services: AppServices,
  bot: Telegraf<BotContext>
) {
  return createServer(async (req, res) => {
    try {
      await handleRequest(req, res, config, services, bot);
    } catch (error) {
      if (error instanceof HttpError) {
        sendJson(res, error.statusCode, { error: error.message });
        return;
      }

      logger.error("Unhandled HTTP error", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      sendJson(res, 500, { error: "خطای داخلی سرور رخ داد." });
    }
  });
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  config: AppConfig,
  services: AppServices,
  bot: Telegraf<BotContext>
) {
  const method = req.method ?? "GET";
  const requestUrl = new URL(req.url ?? "/", config.webAppBaseUrl);

  if (requestUrl.pathname === "/api/auth/telegram" && method === "POST") {
    const request = toWebRequest(req, requestUrl);
    const body = await parseJsonBody<{ initData?: string }>(request);

    if (!body.initData?.trim()) {
      throw new HttpError(400, "initData ارسالی معتبر نیست.");
    }

    const profile = verifyTelegramInitData(body.initData, config.botToken);
    const user = await services.userService.ensureUser({
      telegramId: profile.telegramId,
      username: profile.username,
      displayName: profile.displayName
    });

    sendJson(
      res,
      200,
      {
        user: serializeUser(user)
      },
      {
        cookies: [createSessionCookie(config, user.id, user.telegramId, isSecureCookie(config))]
      }
    );
    return;
  }

  if (requestUrl.pathname === "/api/auth/logout" && method === "POST") {
    sendJson(
      res,
      200,
      {
        ok: true
      },
      {
        cookies: [clearSessionCookie(config, isSecureCookie(config))]
      }
    );
    return;
  }

  if (requestUrl.pathname.startsWith("/api/")) {
    const user = await authenticateUser(req, config, services);

    if (!user) {
      throw new HttpError(401, "نشست شما منقضی شده است.");
    }

    const request = toWebRequest(req, requestUrl);
    const context: AppRequestContext = {
      request,
      requestUrl,
      response: res,
      config,
      services,
      bot,
      user
    };

    await handleApiRequest(method, context);
    return;
  }

  if (method !== "GET" && method !== "HEAD") {
    throw new HttpError(405, "متد درخواستی پشتیبانی نمی‌شود.");
  }

  await serveStaticAsset(requestUrl.pathname, res);
}

async function handleApiRequest(method: string, context: AppRequestContext) {
  const { requestUrl, response, request, services, user, bot, config } = context;

  if (requestUrl.pathname === "/api/me" && method === "GET") {
    sendJson(response, 200, {
      user: serializeUser(user)
    });
    return;
  }

  if (requestUrl.pathname.startsWith("/api/admin/")) {
    await handleAdminApiRequest(method, context);
    return;
  }

  if (requestUrl.pathname === "/api/plans" && method === "GET") {
    const plans = await services.planService.listPaidPlans();
    sendJson(response, 200, {
      payment: {
        cardTitle: config.paymentCardTitle,
        cardNumber: config.paymentCardNumber,
        notes: config.paymentNotes
      },
      plans: plans.map((plan) => ({
        code: plan.code,
        title: plan.title,
        days: plan.days,
        trafficBytes: plan.trafficBytes,
        deviceLimit: plan.deviceLimit,
        priceLabel: plan.priceLabel,
        enabled: plan.enabled,
        isTrial: plan.isTrial
      }))
    });
    return;
  }

  if (requestUrl.pathname === "/api/trial" && method === "POST") {
    const service = await services.serviceService.requestTrial(user.telegramId);
    const detail = await services.serviceService.getServiceWithPlanForUserId(user.id, service.id);
    const deliveryMessage = await services.serviceService.buildServiceDeliveryMessage(service.id);

    sendJson(response, 200, {
      service: detail ? serializeServiceDetail(detail) : serializeService(service),
      deliveryMessage
    });
    return;
  }

  if (requestUrl.pathname === "/api/orders" && method === "POST") {
    const body = await parseJsonBody<{ planCode?: string }>(request);
    const planCode = body.planCode?.trim();

    if (!planCode) {
      throw new HttpError(400, "planCode اجباری است.");
    }

    const plan = await services.planService.getByCode(planCode);

    if (!plan || plan.isTrial || !plan.enabled) {
      throw new HttpError(400, "پلن انتخابی معتبر نیست.");
    }

    const order = await services.orderService.createOrder({
      userId: user.id,
      planCode: plan.code,
      kind: "new"
    });
    const bundle = await services.orderService.getOrderForUser(order.id, user.id);

    if (!bundle) {
      throw new HttpError(500, "سفارش ساخته شد اما قابل بازیابی نبود.");
    }

    sendJson(response, 201, {
      payment: {
        cardTitle: config.paymentCardTitle,
        cardNumber: config.paymentCardNumber,
        notes: config.paymentNotes
      },
      order: serializeOrderDetail(bundle)
    });
    return;
  }

  if (requestUrl.pathname === "/api/orders" && method === "GET") {
    const orders = await services.orderService.listOrdersForUser(user.id);
    sendJson(response, 200, {
      orders: orders.map((item) => serializeOrderSummary(item))
    });
    return;
  }

  if (requestUrl.pathname === "/api/services" && method === "GET") {
    const servicesWithPlans = await services.serviceService.listServicesWithPlanForUserId(user.id);
    sendJson(response, 200, {
      services: servicesWithPlans.map((item) => serializeServiceDetail(item))
    });
    return;
  }

  if (requestUrl.pathname === "/api/tickets" && method === "GET") {
    const tickets = await services.supportService.listTicketsForUser(user.id);
    sendJson(response, 200, {
      tickets: tickets.map((ticket) => serializeTicket(ticket))
    });
    return;
  }

  if (requestUrl.pathname === "/api/tickets" && method === "POST") {
    const ticket = await services.supportService.getOrCreateOpenTicketForUserId(user.id);
    sendJson(response, 201, {
      ticket: serializeTicket(ticket)
    });
    return;
  }

  const serviceDetailMatch = requestUrl.pathname.match(/^\/api\/services\/(\d+)$/);

  if (serviceDetailMatch && method === "GET") {
    const serviceId = Number(serviceDetailMatch[1]);
    const detail = await services.serviceService.getServiceWithPlanForUserId(user.id, serviceId);

    if (!detail) {
      throw new HttpError(404, "سرویس پیدا نشد.");
    }

    const deliveryMessage = await services.serviceService.buildServiceDeliveryMessage(serviceId);
    sendJson(response, 200, {
      service: {
        ...serializeServiceDetail(detail),
        deliveryMessage
      }
    });
    return;
  }

  const serviceRenewMatch = requestUrl.pathname.match(/^\/api\/services\/(\d+)\/renew$/);

  if (serviceRenewMatch && method === "POST") {
    const serviceId = Number(serviceRenewMatch[1]);
    const detail = await services.serviceService.getServiceWithPlanForUserId(user.id, serviceId);

    if (!detail) {
      throw new HttpError(404, "سرویس پیدا نشد.");
    }

    const order = await services.serviceService.createRenewOrder(user.telegramId, serviceId);
    const bundle = await services.orderService.getOrderForUser(order.id, user.id);

    if (!bundle) {
      throw new HttpError(500, "سفارش تمدید ساخته شد اما قابل بازیابی نبود.");
    }

    sendJson(response, 201, {
      payment: {
        cardTitle: config.paymentCardTitle,
        cardNumber: config.paymentCardNumber,
        notes: config.paymentNotes
      },
      order: serializeOrderDetail(bundle)
    });
    return;
  }

  const orderDetailMatch = requestUrl.pathname.match(/^\/api\/orders\/(\d+)$/);

  if (orderDetailMatch && method === "GET") {
    const orderId = Number(orderDetailMatch[1]);
    const bundle = await services.orderService.getOrderForUser(orderId, user.id);

    if (!bundle) {
      throw new HttpError(404, "سفارش پیدا نشد.");
    }

    sendJson(response, 200, {
      payment: {
        cardTitle: config.paymentCardTitle,
        cardNumber: config.paymentCardNumber,
        notes: config.paymentNotes
      },
      order: serializeOrderDetail(bundle)
    });
    return;
  }

  const orderReceiptMatch = requestUrl.pathname.match(/^\/api\/orders\/(\d+)\/receipt$/);

  if (orderReceiptMatch && method === "POST") {
    const orderId = Number(orderReceiptMatch[1]);
    const bundle = await services.orderService.getOrderForUser(orderId, user.id);

    if (!bundle) {
      throw new HttpError(404, "سفارش پیدا نشد.");
    }

    if (!["pending_receipt", "under_review"].includes(bundle.order.status)) {
      throw new HttpError(400, "این سفارش دیگر در وضعیت دریافت رسید نیست.");
    }

    const formData = await request.formData();
    const receiptText = String(formData.get("receiptText") ?? "").trim() || undefined;
    const receiptFile = formData.get("receiptFile");

    if (!receiptText && !(receiptFile instanceof File && receiptFile.size > 0)) {
      throw new HttpError(400, "حداقل متن تراکنش یا تصویر رسید لازم است.");
    }

    let updatedOrder = await services.orderService.submitReceipt(orderId, {
      text: receiptText
    });

    if (receiptFile instanceof File && receiptFile.size > 0) {
      const savedFilePath = await saveReceiptFile(receiptFile, config.uploadDir, orderId);
      const uploadedFileId = await notifyAdminsOfOrder(bot, services, orderId, {
        localPhotoPath: savedFilePath
      });

      if (uploadedFileId) {
        updatedOrder = await services.orderService.submitReceipt(orderId, {
          fileId: uploadedFileId,
          text: receiptText
        });
      }
    } else {
      await notifyAdminsOfOrder(bot, services, orderId);
    }

    const updatedBundle = await services.orderService.getOrderForUser(updatedOrder.id, user.id);

    if (!updatedBundle) {
      throw new HttpError(500, "سفارش به‌روزرسانی شد اما قابل بازیابی نبود.");
    }

    sendJson(response, 200, {
      order: serializeOrderDetail(updatedBundle)
    });
    return;
  }

  const ticketDetailMatch = requestUrl.pathname.match(/^\/api\/tickets\/(\d+)$/);

  if (ticketDetailMatch && method === "GET") {
    const ticketId = Number(ticketDetailMatch[1]);
    const ticketBundle = await services.supportService.getTicketForUser(ticketId, user.id);

    if (!ticketBundle) {
      throw new HttpError(404, "تیکت پیدا نشد.");
    }

    sendJson(response, 200, {
      ticket: {
        ...serializeTicket(ticketBundle.ticket),
        messages: ticketBundle.messages.map((message) => serializeTicketMessage(message))
      }
    });
    return;
  }

  const ticketMessageMatch = requestUrl.pathname.match(/^\/api\/tickets\/(\d+)\/messages$/);

  if (ticketMessageMatch && method === "POST") {
    const ticketId = Number(ticketMessageMatch[1]);
    const existingTicket = await services.supportService.getTicketForUser(ticketId, user.id);

    if (!existingTicket) {
      throw new HttpError(404, "تیکت پیدا نشد.");
    }

    if (existingTicket.ticket.status !== "open") {
      throw new HttpError(400, "امکان ارسال پیام به تیکت بسته وجود ندارد.");
    }

    const body = await parseJsonBody<{ body?: string }>(request);
    const messageBody = body.body?.trim();

    if (!messageBody) {
      throw new HttpError(400, "متن پیام الزامی است.");
    }

    const message = await services.supportService.addUserMessage(ticketId, user.id, messageBody);
    await notifyAdminsOfTicket(bot, services, ticketId, messageBody);

    sendJson(response, 201, {
      message: serializeTicketMessage(message)
    });
    return;
  }

  throw new HttpError(404, "مسیر درخواستی پیدا نشد.");
}

async function handleAdminApiRequest(method: string, context: AppRequestContext) {
  const { requestUrl, response, request, services, user, bot } = context;

  if (!user.isAdmin) {
    throw new HttpError(403, "دسترسی ادمین ندارید.");
  }

  if (requestUrl.pathname === "/api/admin/summary" && method === "GET") {
    const [orderCounts, ticketCounts] = await Promise.all([
      services.orderService.countAdminQueues(user.id),
      services.supportService.countAdminQueues(user.id)
    ]);

    sendJson(response, 200, {
      summary: {
        orders: orderCounts,
        tickets: ticketCounts
      }
    });
    return;
  }

  if (requestUrl.pathname === "/api/admin/orders" && method === "GET") {
    const scope = readAdminScope(requestUrl);
    const orders = await services.orderService.listAdminOrders(scope, user.id);

    sendJson(response, 200, {
      orders: await Promise.all(orders.map((item) => serializeAdminOrderItem(services, item)))
    });
    return;
  }

  const adminOrderMatch = requestUrl.pathname.match(/^\/api\/admin\/orders\/(\d+)(?:\/([a-z]+))?$/);

  if (adminOrderMatch) {
    const orderId = Number(adminOrderMatch[1]);
    const action = adminOrderMatch[2] ?? "detail";

    if (action === "detail" && method === "GET") {
      const bundle = await services.orderService.getAdminOrder(orderId);

      if (!bundle) {
        throw new HttpError(404, "سفارش پیدا نشد.");
      }

      sendJson(response, 200, {
        order: await serializeAdminOrderDetail(services, bundle)
      });
      return;
    }

    if (action === "claim" && method === "POST") {
      const claimed = await services.orderService.claimAdminOrder(orderId, user.id);

      if (!claimed) {
        await throwAdminOrderClaimError(services, orderId);
      }

      const bundle = await services.orderService.getAdminOrder(orderId);

      if (!bundle) {
        throw new HttpError(500, "سفارش claim شد اما قابل بازیابی نبود.");
      }

      sendJson(response, 200, {
        order: await serializeAdminOrderDetail(services, bundle)
      });
      return;
    }

    if (action === "release" && method === "POST") {
      const released = await services.orderService.releaseAdminOrder(orderId, user.id);

      if (!released) {
        await throwAdminOrderReleaseError(services, orderId, user.id);
      }

      const bundle = await services.orderService.getAdminOrder(orderId);

      if (!bundle) {
        throw new HttpError(500, "سفارش release شد اما قابل بازیابی نبود.");
      }

      sendJson(response, 200, {
        order: await serializeAdminOrderDetail(services, bundle)
      });
      return;
    }

    if (["approve", "reject", "clarify"].includes(action) && method === "POST") {
      const bundle = await requireAssignedAdminOrder(services, orderId, user.id);

      if (action === "approve") {
        const service = await services.serviceService.fulfillApprovedOrder(orderId);
        const deliveryMessage = await services.serviceService.buildServiceDeliveryMessage(service.id);
        await bot.telegram.sendMessage(bundle.user.telegramId, deliveryMessage);
      } else {
        const body = await parseJsonBody<{ note?: string }>(request);
        const note = body.note?.trim();

        if (!note) {
          throw new HttpError(400, "یادداشت برای این عملیات الزامی است.");
        }

        if (action === "reject") {
          await services.orderService.markRejected(orderId, note);
          await bot.telegram.sendMessage(bundle.user.telegramId, `سفارش شما رد شد.\nدلیل: ${note}`);
        } else {
          await services.orderService.markNeedsClarification(orderId, note);
          await bot.telegram.sendMessage(bundle.user.telegramId, `برای سفارش شما توضیح بیشتری لازم است:\n${note}`);
        }
      }

      const updatedBundle = await services.orderService.getAdminOrder(orderId);

      if (!updatedBundle) {
        throw new HttpError(500, "سفارش به‌روزرسانی شد اما قابل بازیابی نبود.");
      }

      sendJson(response, 200, {
        order: await serializeAdminOrderDetail(services, updatedBundle)
      });
      return;
    }
  }

  if (requestUrl.pathname === "/api/admin/tickets" && method === "GET") {
    const scope = readAdminScope(requestUrl);
    const tickets = await services.supportService.listAdminTickets(scope, user.id);

    sendJson(response, 200, {
      tickets: await Promise.all(tickets.map((item) => serializeAdminTicketItem(services, item)))
    });
    return;
  }

  const adminTicketMatch = requestUrl.pathname.match(/^\/api\/admin\/tickets\/(\d+)(?:\/([a-z]+))?$/);

  if (adminTicketMatch) {
    const ticketId = Number(adminTicketMatch[1]);
    const action = adminTicketMatch[2] ?? "detail";

    if (action === "detail" && method === "GET") {
      const bundle = await services.supportService.getAdminTicket(ticketId);

      if (!bundle) {
        throw new HttpError(404, "تیکت پیدا نشد.");
      }

      sendJson(response, 200, {
        ticket: await serializeAdminTicketDetail(services, bundle)
      });
      return;
    }

    if (action === "claim" && method === "POST") {
      const claimed = await services.supportService.claimAdminTicket(ticketId, user.id);

      if (!claimed) {
        await throwAdminTicketClaimError(services, ticketId);
      }

      const bundle = await services.supportService.getAdminTicket(ticketId);

      if (!bundle) {
        throw new HttpError(500, "تیکت claim شد اما قابل بازیابی نبود.");
      }

      sendJson(response, 200, {
        ticket: await serializeAdminTicketDetail(services, bundle)
      });
      return;
    }

    if (action === "release" && method === "POST") {
      const released = await services.supportService.releaseAdminTicket(ticketId, user.id);

      if (!released) {
        await throwAdminTicketReleaseError(services, ticketId, user.id);
      }

      const bundle = await services.supportService.getAdminTicket(ticketId);

      if (!bundle) {
        throw new HttpError(500, "تیکت release شد اما قابل بازیابی نبود.");
      }

      sendJson(response, 200, {
        ticket: await serializeAdminTicketDetail(services, bundle)
      });
      return;
    }

    if (action === "reply" && method === "POST") {
      const bundle = await requireAssignedAdminTicket(services, ticketId, user.id);
      const body = await parseJsonBody<{ body?: string }>(request);
      const messageBody = body.body?.trim();

      if (!messageBody) {
        throw new HttpError(400, "متن پاسخ الزامی است.");
      }

      await services.supportService.addAdminReply(ticketId, user.telegramId, messageBody);
      await bot.telegram.sendMessage(
        bundle.user.telegramId,
        `پاسخ پشتیبانی:\n${messageBody}`
      );

      const updatedBundle = await services.supportService.getAdminTicket(ticketId);

      if (!updatedBundle) {
        throw new HttpError(500, "تیکت به‌روزرسانی شد اما قابل بازیابی نبود.");
      }

      sendJson(response, 201, {
        ticket: await serializeAdminTicketDetail(services, updatedBundle)
      });
      return;
    }

    if (action === "close" && method === "POST") {
      const bundle = await requireAssignedAdminTicket(services, ticketId, user.id);
      await services.supportService.closeTicket(ticketId);
      await bot.telegram.sendMessage(bundle.user.telegramId, "تیکت پشتیبانی شما بسته شد.");

      const updatedBundle = await services.supportService.getAdminTicket(ticketId);

      if (!updatedBundle) {
        throw new HttpError(500, "تیکت بسته شد اما قابل بازیابی نبود.");
      }

      sendJson(response, 200, {
        ticket: await serializeAdminTicketDetail(services, updatedBundle)
      });
      return;
    }
  }

  throw new HttpError(404, "مسیر مدیریت پیدا نشد.");
}

type AdminScope = "unclaimed" | "mine" | "all";
type AdminOrderListItem = Awaited<ReturnType<AppServices["orderService"]["listAdminOrders"]>>[number];
type AdminOrderDetail = NonNullable<Awaited<ReturnType<AppServices["orderService"]["getAdminOrder"]>>>;
type AdminTicketListItem = Awaited<ReturnType<AppServices["supportService"]["listAdminTickets"]>>[number];
type AdminTicketDetail = NonNullable<Awaited<ReturnType<AppServices["supportService"]["getAdminTicket"]>>>;

function readAdminScope(requestUrl: URL): AdminScope {
  const scope = requestUrl.searchParams.get("scope");

  if (scope === "mine" || scope === "all" || scope === "unclaimed") {
    return scope;
  }

  return "unclaimed";
}

async function requireAssignedAdminOrder(
  services: AppServices,
  orderId: number,
  adminUserId: number
): Promise<AdminOrderDetail> {
  const bundle = await services.orderService.getAdminOrder(orderId);

  if (!bundle) {
    throw new HttpError(404, "سفارش پیدا نشد.");
  }

  if (bundle.order.assignedAdminUserId === null) {
    throw new HttpError(403, "ابتدا این سفارش را claim کنید.");
  }

  if (bundle.order.assignedAdminUserId !== adminUserId) {
    throw new HttpError(403, "این سفارش به ادمین دیگری اختصاص دارد.");
  }

  if (bundle.order.status !== "under_review") {
    throw new HttpError(400, "این سفارش دیگر در صف بررسی نیست.");
  }

  return bundle;
}

async function requireAssignedAdminTicket(
  services: AppServices,
  ticketId: number,
  adminUserId: number
): Promise<AdminTicketDetail> {
  const bundle = await services.supportService.getAdminTicket(ticketId);

  if (!bundle) {
    throw new HttpError(404, "تیکت پیدا نشد.");
  }

  if (bundle.ticket.assignedAdminUserId === null) {
    throw new HttpError(403, "ابتدا این تیکت را claim کنید.");
  }

  if (bundle.ticket.assignedAdminUserId !== adminUserId) {
    throw new HttpError(403, "این تیکت به ادمین دیگری اختصاص دارد.");
  }

  if (bundle.ticket.status !== "open") {
    throw new HttpError(400, "این تیکت دیگر باز نیست.");
  }

  return bundle;
}

async function throwAdminOrderClaimError(
  services: AppServices,
  orderId: number
): Promise<never> {
  const bundle = await services.orderService.getAdminOrder(orderId);

  if (!bundle) {
    throw new HttpError(404, "سفارش پیدا نشد.");
  }

  if (bundle.order.assignedAdminUserId !== null) {
    throw new HttpError(409, "این سفارش قبلاً توسط ادمین دیگری claim شده است.");
  }

  throw new HttpError(400, "این سفارش در صف بررسی نیست.");
}

async function throwAdminOrderReleaseError(
  services: AppServices,
  orderId: number,
  adminUserId: number
): Promise<never> {
  const bundle = await services.orderService.getAdminOrder(orderId);

  if (!bundle) {
    throw new HttpError(404, "سفارش پیدا نشد.");
  }

  if (bundle.order.assignedAdminUserId !== adminUserId) {
    throw new HttpError(403, "فقط ادمین assignee می‌تواند این سفارش را release کند.");
  }

  throw new HttpError(400, "این سفارش قابل release نیست.");
}

async function throwAdminTicketClaimError(
  services: AppServices,
  ticketId: number
): Promise<never> {
  const bundle = await services.supportService.getAdminTicket(ticketId);

  if (!bundle) {
    throw new HttpError(404, "تیکت پیدا نشد.");
  }

  if (bundle.ticket.assignedAdminUserId !== null) {
    throw new HttpError(409, "این تیکت قبلاً توسط ادمین دیگری claim شده است.");
  }

  throw new HttpError(400, "این تیکت باز نیست.");
}

async function throwAdminTicketReleaseError(
  services: AppServices,
  ticketId: number,
  adminUserId: number
): Promise<never> {
  const bundle = await services.supportService.getAdminTicket(ticketId);

  if (!bundle) {
    throw new HttpError(404, "تیکت پیدا نشد.");
  }

  if (bundle.ticket.assignedAdminUserId !== adminUserId) {
    throw new HttpError(403, "فقط ادمین assignee می‌تواند این تیکت را release کند.");
  }

  throw new HttpError(400, "این تیکت قابل release نیست.");
}

async function serializeAdminOrderItem(services: AppServices, item: AdminOrderListItem) {
  return {
    ...serializeOrderDetail(item),
    user: serializeAdminUserSummary(item.user),
    assignedAdminUserId: item.order.assignedAdminUserId,
    assignedAdminDisplayName: await resolveAdminDisplayName(services, item.order.assignedAdminUserId),
    claimedAt: item.order.claimedAt?.toISOString() ?? null,
    preview: item.order.receiptText ?? (item.order.receiptFileId ? "رسید تصویری ثبت شده است." : "رسیدی ثبت نشده است.")
  };
}

async function serializeAdminOrderDetail(services: AppServices, item: AdminOrderDetail) {
  return {
    ...serializeOrderDetail(item),
    user: serializeAdminUserSummary(item.user),
    assignedAdminUserId: item.order.assignedAdminUserId,
    assignedAdminDisplayName: await resolveAdminDisplayName(services, item.order.assignedAdminUserId),
    claimedAt: item.order.claimedAt?.toISOString() ?? null,
    preview: item.order.receiptText ?? (item.order.receiptFileId ? "رسید تصویری ثبت شده است." : "رسیدی ثبت نشده است.")
  };
}

async function serializeAdminTicketItem(services: AppServices, item: AdminTicketListItem) {
  return {
    ...serializeTicket(item.ticket),
    user: serializeAdminUserSummary(item.user),
    assignedAdminUserId: item.ticket.assignedAdminUserId,
    assignedAdminDisplayName: await resolveAdminDisplayName(services, item.ticket.assignedAdminUserId),
    claimedAt: item.ticket.claimedAt?.toISOString() ?? null,
    preview: "برای مشاهده thread، تیکت را باز کنید."
  };
}

async function serializeAdminTicketDetail(services: AppServices, item: AdminTicketDetail) {
  const latestMessage = item.messages[item.messages.length - 1] ?? null;

  return {
    ...serializeTicket(item.ticket),
    user: serializeAdminUserSummary(item.user),
    assignedAdminUserId: item.ticket.assignedAdminUserId,
    assignedAdminDisplayName: await resolveAdminDisplayName(services, item.ticket.assignedAdminUserId),
    claimedAt: item.ticket.claimedAt?.toISOString() ?? null,
    preview: latestMessage?.body ?? "پیامی ثبت نشده است.",
    messages: item.messages.map((message) => serializeTicketMessage(message))
  };
}

function serializeAdminUserSummary(user: {
  id: number;
  telegramId: number;
  username: string | null;
  displayName: string;
}) {
  return {
    id: user.id,
    telegramId: user.telegramId,
    username: user.username,
    displayName: user.displayName
  };
}

async function resolveAdminDisplayName(services: AppServices, adminUserId: number | null) {
  if (adminUserId === null) {
    return null;
  }

  const admin = await services.userService.getById(adminUserId);
  return admin?.displayName ?? `Admin #${adminUserId}`;
}

async function authenticateUser(
  req: IncomingMessage,
  config: AppConfig,
  services: AppServices
): Promise<AppAuthenticatedUser | null> {
  const session = readSessionFromCookie(req.headers.cookie, config);

  if (!session) {
    return null;
  }

  const user = await services.userService.getById(session.userId);

  if (!user || user.telegramId !== session.telegramId) {
    return null;
  }

  return user;
}

function toWebRequest(req: IncomingMessage, requestUrl: URL) {
  const method = req.method ?? "GET";
  const hasBody = !["GET", "HEAD"].includes(method);

  return new Request(requestUrl, {
    method,
    headers: req.headers as HeadersInit,
    body: hasBody ? Readable.toWeb(req) as BodyInit : undefined,
    duplex: hasBody ? "half" : undefined
  } as RequestInit);
}

async function parseJsonBody<T>(request: Request): Promise<T> {
  try {
    return await request.json() as T;
  } catch {
    throw new HttpError(400, "بدنه درخواست JSON معتبر نیست.");
  }
}

function sendJson(
  res: ServerResponse,
  statusCode: number,
  payload: unknown,
  options?: {
    cookies?: string[];
  }
) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  if (options?.cookies?.length) {
    res.setHeader("Set-Cookie", options.cookies);
  }

  res.end(JSON.stringify(payload));
}

async function serveStaticAsset(pathname: string, res: ServerResponse) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const assetPath = path.resolve(STATIC_ROOT, `.${requestedPath}`);
  const relativePath = path.relative(STATIC_ROOT, assetPath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new HttpError(403, "دسترسی غیرمجاز.");
  }

  if (await fileExists(assetPath)) {
    res.statusCode = 200;
    res.setHeader("Content-Type", getContentType(assetPath));
    fs.createReadStream(assetPath).pipe(res);
    return;
  }

  const fallbackPath = path.join(STATIC_ROOT, "index.html");

  if (await fileExists(fallbackPath)) {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    fs.createReadStream(fallbackPath).pipe(res);
    return;
  }

  throw new HttpError(404, "فایل درخواستی پیدا نشد.");
}

async function fileExists(filePath: string) {
  try {
    const stat = await fs.promises.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

function serializeUser(user: AppAuthenticatedUser) {
  return {
    id: user.id,
    telegramId: user.telegramId,
    username: user.username,
    displayName: user.displayName,
    isAdmin: user.isAdmin,
    trialUsed: user.trialUsed,
    createdAt: user.createdAt.toISOString()
  };
}

function serializeService(service: {
  id: number;
  planCode: string;
  type: string;
  status: string;
  email: string;
  subId: string;
  inboundId: number;
  expiresAt: Date;
  trafficBytes: number;
  lastUsageUp: number;
  lastUsageDown: number;
  lastSyncAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: service.id,
    planCode: service.planCode,
    type: service.type,
    status: service.status,
    email: service.email,
    subId: service.subId,
    inboundId: service.inboundId,
    expiresAt: service.expiresAt.toISOString(),
    trafficBytes: service.trafficBytes,
    lastUsageUp: service.lastUsageUp,
    lastUsageDown: service.lastUsageDown,
    lastSyncAt: service.lastSyncAt?.toISOString() ?? null,
    createdAt: service.createdAt.toISOString(),
    updatedAt: service.updatedAt.toISOString()
  };
}

function serializeServiceDetail(detail: {
  service: {
    id: number;
    planCode: string;
    type: string;
    status: string;
    email: string;
    subId: string;
    inboundId: number;
    expiresAt: Date;
    trafficBytes: number;
    lastUsageUp: number;
    lastUsageDown: number;
    lastSyncAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  };
  plan: {
    code: string;
    title: string;
    days: number;
    trafficBytes: number;
    deviceLimit: number;
    priceLabel: string;
    enabled: boolean;
    isTrial: boolean;
  };
}) {
  return {
    ...serializeService(detail.service),
    plan: {
      code: detail.plan.code,
      title: detail.plan.title,
      days: detail.plan.days,
      trafficBytes: detail.plan.trafficBytes,
      deviceLimit: detail.plan.deviceLimit,
      priceLabel: detail.plan.priceLabel,
      enabled: detail.plan.enabled,
      isTrial: detail.plan.isTrial
    }
  };
}

function serializeOrderSummary(item: {
  order: {
    id: number;
    planCode: string;
    kind: string;
    status: string;
    receiptFileId: string | null;
    receiptText: string | null;
    adminNote: string | null;
    targetServiceId: number | null;
    createdAt: Date;
    updatedAt: Date;
  };
  plan: {
    code: string;
    title: string;
    days: number;
    trafficBytes: number;
    deviceLimit: number;
    priceLabel: string;
    enabled: boolean;
    isTrial: boolean;
  };
  service: {
    id: number;
    status: string;
    expiresAt: Date;
  } | null;
}) {
  return serializeOrderDetail(item);
}

function serializeOrderDetail(item: {
  order: {
    id: number;
    planCode: string;
    kind: string;
    status: string;
    receiptFileId: string | null;
    receiptText: string | null;
    adminNote: string | null;
    targetServiceId: number | null;
    createdAt: Date;
    updatedAt: Date;
  };
  plan: {
    code: string;
    title: string;
    days: number;
    trafficBytes: number;
    deviceLimit: number;
    priceLabel: string;
    enabled: boolean;
    isTrial: boolean;
  };
  service?: {
    id: number;
    status: string;
    expiresAt: Date;
  } | null;
}) {
  return {
    id: item.order.id,
    kind: item.order.kind,
    status: item.order.status,
    receiptText: item.order.receiptText,
    adminNote: item.order.adminNote,
    targetServiceId: item.order.targetServiceId,
    hasReceiptImage: Boolean(item.order.receiptFileId),
    requiresReceipt: ["pending_receipt", "under_review"].includes(item.order.status),
    createdAt: item.order.createdAt.toISOString(),
    updatedAt: item.order.updatedAt.toISOString(),
    plan: {
      code: item.plan.code,
      title: item.plan.title,
      days: item.plan.days,
      trafficBytes: item.plan.trafficBytes,
      deviceLimit: item.plan.deviceLimit,
      priceLabel: item.plan.priceLabel,
      enabled: item.plan.enabled,
      isTrial: item.plan.isTrial
    },
    service: item.service
      ? {
          id: item.service.id,
          status: item.service.status,
          expiresAt: item.service.expiresAt.toISOString()
        }
      : null
  };
}

function serializeTicket(ticket: {
  id: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
}) {
  return {
    id: ticket.id,
    status: ticket.status,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    closedAt: ticket.closedAt?.toISOString() ?? null
  };
}

function serializeTicketMessage(message: {
  id: number;
  ticketId: number;
  senderUserId: number | null;
  senderAdminId: number | null;
  body: string;
  createdAt: Date;
}) {
  return {
    id: message.id,
    ticketId: message.ticketId,
    body: message.body,
    senderRole: message.senderAdminId ? "admin" : "user",
    createdAt: message.createdAt.toISOString()
  };
}

async function saveReceiptFile(file: File, uploadDir: string, orderId: number) {
  if (file.size > MAX_RECEIPT_FILE_SIZE_BYTES) {
    throw new HttpError(400, "حجم تصویر رسید نباید بیشتر از ۱۰ مگابایت باشد.");
  }

  if (!file.type.startsWith("image/")) {
    throw new HttpError(400, "فایل رسید باید تصویری باشد.");
  }

  await fs.promises.mkdir(uploadDir, { recursive: true });

  const safeExtension = normalizeExtension(file.name, file.type);
  const filename = `order-${orderId}-${Date.now()}${safeExtension}`;
  const targetPath = path.join(uploadDir, filename);
  const fileBytes = Buffer.from(await file.arrayBuffer());

  await fs.promises.writeFile(targetPath, fileBytes);

  return targetPath;
}

function normalizeExtension(filename: string, contentType: string) {
  const extension = path.extname(filename).toLowerCase();

  if ([".jpg", ".jpeg", ".png", ".webp"].includes(extension)) {
    return extension;
  }

  if (contentType === "image/png") {
    return ".png";
  }

  if (contentType === "image/webp") {
    return ".webp";
  }

  return ".jpg";
}

function isSecureCookie(config: AppConfig) {
  return config.webAppBaseUrl.startsWith("https://");
}

function getContentType(filePath: string) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".woff2":
      return "font/woff2";
    default:
      return "text/html; charset=utf-8";
  }
}

class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string
  ) {
    super(message);
  }
}
