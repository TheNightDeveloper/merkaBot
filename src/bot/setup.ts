import { Telegraf } from "telegraf";

import type { AppServices } from "../app";
import type { BotContext } from "./context";
import { buildAdminMenuKeyboard, buildAdminOrderKeyboard, buildAdminTicketKeyboard, buildMainKeyboard, buildPlansKeyboard, buildServiceKeyboard, buildWebAppKeyboard } from "./keyboards";
import { logger } from "../infra/logger";
import { formatBytes, formatDate, formatServiceStatus } from "../utils/format";
import { describeOrder, notifyAdminsOfOrder, notifyAdminsOfTicket } from "./notifications";

export function buildBot(bot: Telegraf<BotContext>, services: AppServices) {
  bot.start(async (ctx) => {
    const user = await services.userService.ensureUser(toTelegramProfile(ctx));
    const canUseWebApp = isHttpsWebAppUrl(services.config.webAppBaseUrl);
    const mainKeyboard = buildMainKeyboard();

    if (canUseWebApp) {
      await ctx.reply(
        `سلام ${user.displayName}\nبرای مدیریت سرویس‌ها، خرید و پشتیبانی وارد پنل MerkaBot شوید.`,
        buildWebAppKeyboard(services.config.webAppBaseUrl)
      );
      await ctx.reply("منوی قدیمی بات هم برای مواقع ضروری همچنان در دسترس است.", {
        reply_markup: mainKeyboard.reply_markup
      });
      return;
    }

    await ctx.reply(
      [
        `سلام ${user.displayName}`,
        "mini app در تلگرام فقط با آدرس HTTPS باز می‌شود.",
        `برای تست لوکال، این آدرس را در مرورگر سیستم باز کنید: ${services.config.webAppBaseUrl}`
      ].join("\n"),
      {
        reply_markup: mainKeyboard.reply_markup
      }
    );
  });

  bot.command("cancel", async (ctx) => {
    ctx.session.pendingAction = undefined;
    await ctx.reply("عملیات جاری لغو شد.");
  });

  bot.command("admin", async (ctx) => {
    await ensureKnownUser(ctx, services);
    if (!(await services.userService.isAdminTelegramId(ctx.from.id))) {
      await ctx.reply("دسترسی ادمین ندارید.");
      return;
    }

    const pendingOrders = await services.orderService.listPendingOrders();
    const openTickets = await services.supportService.listOpenTickets();

    await ctx.reply(
      `پنل ادمین\nسفارش های باز: ${pendingOrders.length}\nتیکت های باز: ${openTickets.length}`,
      buildAdminMenuKeyboard()
    );
  });

  bot.on("callback_query", async (ctx, next) => {
    if (!("data" in ctx.callbackQuery)) {
      return next();
    }

    await ensureKnownUser(ctx, services);
    return next();
  });

  bot.action(/^buy:(.+)$/, async (ctx) => {
    const user = await ensureKnownUser(ctx, services);
    const planCode = ctx.match[1];
    const plan = await services.planService.getByCode(planCode);

    if (!plan || plan.isTrial || !plan.enabled) {
      await ctx.answerCbQuery("پلن معتبر نیست.");
      return;
    }

    const order = await services.orderService.createOrder({
      userId: user.id,
      planCode: plan.code,
      kind: "new"
    });

    ctx.session.pendingAction = {
      kind: "receipt",
      orderId: order.id
    };

    await ctx.editMessageText(
      [
        `پلن انتخابی: ${plan.title}`,
        `مبلغ: ${plan.priceLabel}`,
        `نام کارت: ${services.config.paymentCardTitle}`,
        `شماره کارت: ${services.config.paymentCardNumber}`,
        services.config.paymentNotes,
        "پس از پرداخت، رسید عکس یا متن تراکنش را همینجا ارسال کنید."
      ].join("\n")
    );

    await ctx.answerCbQuery();
  });

  bot.action(/^svc:renew:(\d+)$/, async (ctx) => {
    await ensureKnownUser(ctx, services);
    const serviceId = Number(ctx.match[1]);
    const order = await services.serviceService.createRenewOrder(ctx.from.id, serviceId);
    const orderBundle = await services.orderService.getOrderWithRelations(order.id);

    if (!orderBundle) {
      await ctx.answerCbQuery("سفارش تمدید ساخته نشد.");
      return;
    }

    ctx.session.pendingAction = {
      kind: "receipt",
      orderId: order.id
    };

    await ctx.reply(
      [
        `تمدید سرویس: ${orderBundle.plan.title}`,
        `مبلغ: ${orderBundle.plan.priceLabel}`,
        `نام کارت: ${services.config.paymentCardTitle}`,
        `شماره کارت: ${services.config.paymentCardNumber}`,
        services.config.paymentNotes,
        "پس از پرداخت، رسید را ارسال کنید."
      ].join("\n")
    );
    await ctx.answerCbQuery();
  });

  bot.action(/^svc:(show|resend):(\d+)$/, async (ctx) => {
    await ensureKnownUser(ctx, services);
    const serviceId = Number(ctx.match[2]);
    const service = await services.serviceService.getServiceById(serviceId);

    if (!service) {
      await ctx.answerCbQuery("سرویس پیدا نشد.");
      return;
    }

    const ownedServices = await services.serviceService.listUserServices(ctx.from.id);

    if (!ownedServices.some((item) => item.id === serviceId) && !(await services.userService.isAdminTelegramId(ctx.from.id))) {
      await ctx.answerCbQuery("به این سرویس دسترسی ندارید.");
      return;
    }

    const message = await services.serviceService.buildServiceDeliveryMessage(serviceId);
    await ctx.reply(message);
    await ctx.answerCbQuery("ارسال شد.");
  });

  bot.action(/^ord:approve:(\d+)$/, async (ctx) => {
    if (!(await services.userService.isAdminTelegramId(ctx.from.id))) {
      await ctx.answerCbQuery("دسترسی ندارید.");
      return;
    }

    const orderId = Number(ctx.match[1]);
    try {
      const service = await services.serviceService.fulfillApprovedOrder(orderId);
      const message = await services.serviceService.buildServiceDeliveryMessage(service.id);
      const bundle = await services.orderService.getOrderWithRelations(orderId);

      if (bundle) {
        await bot.telegram.sendMessage(bundle.user.telegramId, message);
      }

      await ctx.reply("سفارش تایید و سرویس صادر شد.");
      await ctx.answerCbQuery("انجام شد.");
    } catch (error) {
      logger.error("Order fulfillment failed", {
        orderId,
        error: error instanceof Error ? error.message : String(error)
      });
      await ctx.reply(`صدور سرویس ناموفق بود: ${error instanceof Error ? error.message : "unknown error"}`);
      await ctx.answerCbQuery("خطا");
    }
  });

  bot.action(/^ord:(reject|clarify):(\d+)$/, async (ctx) => {
    if (!(await services.userService.isAdminTelegramId(ctx.from.id))) {
      await ctx.answerCbQuery("دسترسی ندارید.");
      return;
    }

    ctx.session.pendingAction = {
      kind: "admin_order_note",
      orderId: Number(ctx.match[2]),
      mode: ctx.match[1] as "reject" | "clarify"
    };

    await ctx.reply(ctx.match[1] === "reject" ? "دلیل رد سفارش را ارسال کنید." : "متن درخواست توضیح را ارسال کنید.");
    await ctx.answerCbQuery();
  });

  bot.action(/^ticket:reply:(\d+)$/, async (ctx) => {
    if (!(await services.userService.isAdminTelegramId(ctx.from.id))) {
      await ctx.answerCbQuery("دسترسی ندارید.");
      return;
    }

    const bundle = await services.supportService.getTicketWithUser(Number(ctx.match[1]));

    if (!bundle) {
      await ctx.answerCbQuery("تیکت پیدا نشد.");
      return;
    }

    ctx.session.pendingAction = {
      kind: "admin_ticket_reply",
      ticketId: bundle.ticket.id,
      userTelegramId: bundle.user.telegramId
    };
    await ctx.reply("پاسخ ادمین را ارسال کنید.");
    await ctx.answerCbQuery();
  });

  bot.action(/^ticket:close:(\d+)$/, async (ctx) => {
    if (!(await services.userService.isAdminTelegramId(ctx.from.id))) {
      await ctx.answerCbQuery("دسترسی ندارید.");
      return;
    }

    const bundle = await services.supportService.getTicketWithUser(Number(ctx.match[1]));

    if (!bundle) {
      await ctx.answerCbQuery("تیکت پیدا نشد.");
      return;
    }

    await services.supportService.closeTicket(bundle.ticket.id);
    await bot.telegram.sendMessage(bundle.user.telegramId, "تیکت پشتیبانی شما بسته شد.");
    await ctx.reply("تیکت بسته شد.");
    await ctx.answerCbQuery();
  });

  bot.action(/^adm:orders$/, async (ctx) => {
    if (!(await services.userService.isAdminTelegramId(ctx.from.id))) {
      await ctx.answerCbQuery("دسترسی ندارید.");
      return;
    }

    const pendingOrders = await services.orderService.listPendingOrders();

    if (pendingOrders.length === 0) {
      await ctx.reply("سفارش بازی وجود ندارد.");
      await ctx.answerCbQuery();
      return;
    }

    for (const item of pendingOrders) {
      await ctx.reply(describeOrder(item.order.id, item.user.displayName, item.user.telegramId, item.plan.title, item.order.receiptText), buildAdminOrderKeyboard(item.order.id, item.user.telegramId));
    }

    await ctx.answerCbQuery();
  });

  bot.action(/^adm:tickets$/, async (ctx) => {
    if (!(await services.userService.isAdminTelegramId(ctx.from.id))) {
      await ctx.answerCbQuery("دسترسی ندارید.");
      return;
    }

    const openTickets = await services.supportService.listOpenTickets();

    if (openTickets.length === 0) {
      await ctx.reply("تیکت بازی وجود ندارد.");
      await ctx.answerCbQuery();
      return;
    }

    for (const item of openTickets) {
      await ctx.reply(
        `تیکت #${item.ticket.id}\nکاربر: ${item.user.displayName}\nتلگرام: ${item.user.telegramId}\nآخرین بروزرسانی: ${formatDate(item.ticket.updatedAt)}`,
        buildAdminTicketKeyboard(item.ticket.id, item.user.telegramId)
      );
    }

    await ctx.answerCbQuery();
  });

  bot.action(/^adm:user:(\d+)$/, async (ctx) => {
    if (!(await services.userService.isAdminTelegramId(ctx.from.id))) {
      await ctx.answerCbQuery("دسترسی ندارید.");
      return;
    }

    const telegramId = Number(ctx.match[1]);
    const serviceList = await services.serviceService.listServicesForTelegramUser(telegramId);

    if (serviceList.length === 0) {
      await ctx.reply("برای این کاربر سرویسی ثبت نشده است.");
      await ctx.answerCbQuery();
      return;
    }

    for (const item of serviceList) {
      await ctx.reply(
        [
          `سرویس #${item.id}`,
          `انقضا: ${formatDate(item.expiresAt)}`,
          `سقف ترافیک: ${formatBytes(item.trafficBytes)}`,
          `مصرف: ${formatBytes(item.lastUsageUp + item.lastUsageDown)}`
        ].join("\n"),
        buildServiceKeyboard(item.id)
      );
    }

    await ctx.answerCbQuery();
  });

  bot.on(["text", "photo"], async (ctx, next) => {
    const user = await ensureKnownUser(ctx, services);
    const pendingAction = ctx.session.pendingAction;

    if (!pendingAction) {
      return next();
    }

    if (pendingAction.kind === "receipt") {
      const photo = "photo" in ctx.message ? ctx.message.photo.at(-1) : undefined;
      const text = "text" in ctx.message ? ctx.message.text.trim() : undefined;

      if (text && isMainMenuText(text)) {
        await ctx.reply("ابتدا رسید را ارسال کنید یا /cancel بزنید.");
        return;
      }

      if (!photo && !text) {
        await ctx.reply("برای ثبت رسید، عکس یا متن تراکنش را ارسال کنید.");
        return;
      }

      const order = await services.orderService.submitReceipt(pendingAction.orderId, {
        fileId: photo?.file_id,
        text
      });

      ctx.session.pendingAction = undefined;
      await ctx.reply("رسید شما ثبت شد و برای بررسی ادمین ارسال می شود.");
      await notifyAdminsOfOrder(bot, services, order.id);
      return;
    }

    if (pendingAction.kind === "support_message") {
      if (!("text" in ctx.message) || !ctx.message.text.trim()) {
        await ctx.reply("پیام پشتیبانی باید متنی باشد.");
        return;
      }

      if (isMainMenuText(ctx.message.text.trim())) {
        await ctx.reply("ابتدا پیام پشتیبانی را ارسال کنید یا /cancel بزنید.");
        return;
      }

      await services.supportService.addUserMessage(pendingAction.ticketId, user.id, ctx.message.text.trim());
      ctx.session.pendingAction = undefined;
      await ctx.reply("پیام شما برای پشتیبانی ارسال شد.");
      await notifyAdminsOfTicket(bot, services, pendingAction.ticketId, ctx.message.text.trim());
      return;
    }

    if (pendingAction.kind === "admin_order_note") {
      if (!(await services.userService.isAdminTelegramId(ctx.from.id))) {
        ctx.session.pendingAction = undefined;
        await ctx.reply("دسترسی ادمین ندارید.");
        return;
      }

      if (!("text" in ctx.message) || !ctx.message.text.trim()) {
        await ctx.reply("متن توضیح را ارسال کنید.");
        return;
      }

      if (isMainMenuText(ctx.message.text.trim())) {
        await ctx.reply("متن دلیل را ارسال کنید یا /cancel بزنید.");
        return;
      }

      const bundle = await services.orderService.getOrderWithRelations(pendingAction.orderId);

      if (!bundle) {
        ctx.session.pendingAction = undefined;
        await ctx.reply("سفارش پیدا نشد.");
        return;
      }

      if (pendingAction.mode === "reject") {
        await services.orderService.markRejected(bundle.order.id, ctx.message.text.trim());
        await bot.telegram.sendMessage(bundle.user.telegramId, `سفارش شما رد شد.\nدلیل: ${ctx.message.text.trim()}`);
        await ctx.reply("سفارش رد شد.");
      } else {
        await services.orderService.markNeedsClarification(bundle.order.id, ctx.message.text.trim());
        await bot.telegram.sendMessage(bundle.user.telegramId, `برای سفارش شما توضیح بیشتری لازم است:\n${ctx.message.text.trim()}`);
        await ctx.reply("درخواست توضیح برای کاربر ارسال شد.");
      }

      ctx.session.pendingAction = undefined;
      return;
    }

    if (pendingAction.kind === "admin_ticket_reply") {
      if (!(await services.userService.isAdminTelegramId(ctx.from.id))) {
        ctx.session.pendingAction = undefined;
        await ctx.reply("دسترسی ادمین ندارید.");
        return;
      }

      if (!("text" in ctx.message) || !ctx.message.text.trim()) {
        await ctx.reply("پاسخ ادمین باید متنی باشد.");
        return;
      }

      if (isMainMenuText(ctx.message.text.trim())) {
        await ctx.reply("پاسخ را ارسال کنید یا /cancel بزنید.");
        return;
      }

      await services.supportService.addAdminReply(pendingAction.ticketId, ctx.from.id, ctx.message.text.trim());
      ctx.session.pendingAction = undefined;
      await bot.telegram.sendMessage(
        pendingAction.userTelegramId,
        `پاسخ پشتیبانی:\n${ctx.message.text.trim()}`
      );
      await ctx.reply("پاسخ برای کاربر ارسال شد.");
      return;
    }
  });

  bot.hears("خرید سرویس", async (ctx) => {
    await ensureKnownUser(ctx, services);
    const plans = await services.planService.listPaidPlans();

    if (plans.length === 0) {
      await ctx.reply("در حال حاضر پلن فعالی برای فروش وجود ندارد.");
      return;
    }

    await ctx.reply("یکی از پلن های زیر را انتخاب کنید:", buildPlansKeyboard(plans));
  });

  bot.hears("اکانت تست", async (ctx) => {
    await ensureKnownUser(ctx, services);

    try {
      const service = await services.serviceService.requestTrial(ctx.from.id);
      const deliveryMessage = await services.serviceService.buildServiceDeliveryMessage(service.id);
      await ctx.reply(deliveryMessage);
    } catch (error) {
      await ctx.reply(error instanceof Error ? error.message : "صدور اکانت تست ناموفق بود.");
    }
  });

  bot.hears("سرویس های من", async (ctx) => {
    await ensureKnownUser(ctx, services);
    const serviceList = await services.serviceService.listUserServices(ctx.from.id);

    if (serviceList.length === 0) {
      await ctx.reply("سرویسی برای شما ثبت نشده است.");
      return;
    }

    for (const item of serviceList) {
      await ctx.reply(
        [
          `سرویس #${item.id}`,
          `وضعیت: ${formatServiceStatus(item.status)}`,
          `انقضا: ${formatDate(item.expiresAt)}`,
          `مصرف: ${formatBytes(item.lastUsageUp + item.lastUsageDown)} از ${formatBytes(item.trafficBytes)}`
        ].join("\n"),
        buildServiceKeyboard(item.id)
      );
    }
  });

  bot.hears("پشتیبانی", async (ctx) => {
    const user = await ensureKnownUser(ctx, services);
    const ticket = await services.supportService.getOrCreateOpenTicket(ctx.from.id);
    ctx.session.pendingAction = {
      kind: "support_message",
      ticketId: ticket.id
    };

    await ctx.reply(`تیکت #${ticket.id} آماده است. پیام خود را ارسال کنید.`);
    await notifyAdminsOfTicket(bot, services, ticket.id, `تیکت توسط ${user.displayName} باز شد.`);
  });
}

async function ensureKnownUser(ctx: BotContext, services: AppServices) {
  if (!ctx.from) {
    throw new Error("Telegram update did not include a sender.");
  }

  return services.userService.ensureUser(toTelegramProfile(ctx));
}

function toTelegramProfile(ctx: BotContext) {
  if (!ctx.from) {
    throw new Error("Telegram update did not include a sender.");
  }

  const firstName = ctx.from?.first_name?.trim() ?? "کاربر";
  const lastName = ctx.from?.last_name?.trim();
  const displayName = [firstName, lastName].filter(Boolean).join(" ");

  return {
    telegramId: ctx.from!.id,
    username: ctx.from?.username,
    displayName
  };
}

function isMainMenuText(text: string) {
  return ["خرید سرویس", "اکانت تست", "سرویس های من", "پشتیبانی"].includes(text);
}

function isHttpsWebAppUrl(value: string) {
  return value.startsWith("https://");
}
