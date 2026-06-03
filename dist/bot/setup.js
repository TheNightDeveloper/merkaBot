"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildBot = buildBot;
const keyboards_1 = require("./keyboards");
const format_1 = require("../utils/format");
const notifications_1 = require("./notifications");
function buildBot(bot, services) {
    bot.start(async (ctx) => {
        const user = await services.userService.ensureUser(toTelegramProfile(ctx));
        const canUseWebApp = isHttpsWebAppUrl(services.config.webAppBaseUrl);
        const mainKeyboard = (0, keyboards_1.buildMainKeyboard)();
        if (canUseWebApp) {
            await ctx.reply(`سلام ${user.displayName}\nبرای مدیریت سرویس‌ها، خرید و پشتیبانی وارد پنل MerkaBot شوید.`, (0, keyboards_1.buildWebAppKeyboard)(services.config.webAppBaseUrl));
            await ctx.reply("منوی قدیمی بات هم برای مواقع ضروری همچنان در دسترس است.", {
                reply_markup: mainKeyboard.reply_markup
            });
            return;
        }
        await ctx.reply([
            `سلام ${user.displayName}`,
            "mini app در تلگرام فقط با آدرس HTTPS باز می‌شود.",
            `برای تست لوکال، این آدرس را در مرورگر سیستم باز کنید: ${services.config.webAppBaseUrl}`
        ].join("\n"), {
            reply_markup: mainKeyboard.reply_markup
        });
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
        await ctx.reply(`پنل ادمین\nسفارش های باز: ${pendingOrders.length}\nتیکت های باز: ${openTickets.length}`, (0, keyboards_1.buildAdminMenuKeyboard)(services.config.webAppBaseUrl));
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
        await ctx.editMessageText([
            `پلن انتخابی: ${plan.title}`,
            `مبلغ: ${plan.priceLabel}`,
            `نام کارت: ${services.config.paymentCardTitle}`,
            `شماره کارت: ${services.config.paymentCardNumber}`,
            services.config.paymentNotes,
            "پس از پرداخت، رسید عکس یا متن تراکنش را همینجا ارسال کنید."
        ].join("\n"));
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
        await ctx.reply([
            `تمدید سرویس: ${orderBundle.plan.title}`,
            `مبلغ: ${orderBundle.plan.priceLabel}`,
            `نام کارت: ${services.config.paymentCardTitle}`,
            `شماره کارت: ${services.config.paymentCardNumber}`,
            services.config.paymentNotes,
            "پس از پرداخت، رسید را ارسال کنید."
        ].join("\n"));
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
        await sendAdminPanelRedirect(ctx, services, "orders", Number(ctx.match[1]));
    });
    bot.action(/^ord:(reject|clarify):(\d+)$/, async (ctx) => {
        if (!(await services.userService.isAdminTelegramId(ctx.from.id))) {
            await ctx.answerCbQuery("دسترسی ندارید.");
            return;
        }
        await sendAdminPanelRedirect(ctx, services, "orders", Number(ctx.match[2]));
    });
    bot.action(/^ticket:reply:(\d+)$/, async (ctx) => {
        if (!(await services.userService.isAdminTelegramId(ctx.from.id))) {
            await ctx.answerCbQuery("دسترسی ندارید.");
            return;
        }
        await sendAdminPanelRedirect(ctx, services, "tickets", Number(ctx.match[1]));
    });
    bot.action(/^ticket:close:(\d+)$/, async (ctx) => {
        if (!(await services.userService.isAdminTelegramId(ctx.from.id))) {
            await ctx.answerCbQuery("دسترسی ندارید.");
            return;
        }
        await sendAdminPanelRedirect(ctx, services, "tickets", Number(ctx.match[1]));
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
            await ctx.reply((0, notifications_1.describeOrder)(item.order.id, item.user.displayName, item.user.telegramId, item.plan.title, item.order.receiptText), (0, keyboards_1.buildAdminOrderKeyboard)(item.order.id, item.user.telegramId, services.config.webAppBaseUrl));
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
            await ctx.reply(`تیکت #${item.ticket.id}\nکاربر: ${item.user.displayName}\nتلگرام: ${item.user.telegramId}\nآخرین بروزرسانی: ${(0, format_1.formatDate)(item.ticket.updatedAt)}`, (0, keyboards_1.buildAdminTicketKeyboard)(item.ticket.id, item.user.telegramId, services.config.webAppBaseUrl));
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
            await ctx.reply([
                `سرویس #${item.id}`,
                `انقضا: ${(0, format_1.formatDate)(item.expiresAt)}`,
                `سقف ترافیک: ${(0, format_1.formatBytes)(item.trafficBytes)}`,
                `مصرف: ${(0, format_1.formatBytes)(item.lastUsageUp + item.lastUsageDown)}`
            ].join("\n"), (0, keyboards_1.buildServiceKeyboard)(item.id));
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
            await (0, notifications_1.notifyAdminsOfOrder)(bot, services, order.id);
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
            await (0, notifications_1.notifyAdminsOfTicket)(bot, services, pendingAction.ticketId, ctx.message.text.trim());
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
        await ctx.reply("یکی از پلن های زیر را انتخاب کنید:", (0, keyboards_1.buildPlansKeyboard)(plans));
    });
    bot.hears("اکانت تست", async (ctx) => {
        await ensureKnownUser(ctx, services);
        try {
            const service = await services.serviceService.requestTrial(ctx.from.id);
            const deliveryMessage = await services.serviceService.buildServiceDeliveryMessage(service.id);
            await ctx.reply(deliveryMessage);
        }
        catch (error) {
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
            await ctx.reply([
                `سرویس #${item.id}`,
                `وضعیت: ${(0, format_1.formatServiceStatus)(item.status)}`,
                `انقضا: ${(0, format_1.formatDate)(item.expiresAt)}`,
                `مصرف: ${(0, format_1.formatBytes)(item.lastUsageUp + item.lastUsageDown)} از ${(0, format_1.formatBytes)(item.trafficBytes)}`
            ].join("\n"), (0, keyboards_1.buildServiceKeyboard)(item.id));
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
        await (0, notifications_1.notifyAdminsOfTicket)(bot, services, ticket.id, `تیکت توسط ${user.displayName} باز شد.`);
    });
}
async function sendAdminPanelRedirect(ctx, services, tab, itemId) {
    if (isHttpsWebAppUrl(services.config.webAppBaseUrl)) {
        await ctx.reply("عملیات ادمین از پنل مدیریت انجام می‌شود. این مورد را از پنل باز کنید.", tab === "orders"
            ? (0, keyboards_1.buildAdminOrderKeyboard)(itemId, 0, services.config.webAppBaseUrl)
            : (0, keyboards_1.buildAdminTicketKeyboard)(itemId, 0, services.config.webAppBaseUrl));
    }
    else {
        await ctx.reply([
            "عملیات ادمین از پنل مدیریت انجام می‌شود.",
            "در محیط لوکال، پنل را با این آدرس باز کنید:",
            `${services.config.webAppBaseUrl}/?mode=admin&tab=${tab}&id=${itemId}`
        ].join("\n"));
    }
    await ctx.answerCbQuery("از پنل مدیریت استفاده کنید.");
}
async function ensureKnownUser(ctx, services) {
    if (!ctx.from) {
        throw new Error("Telegram update did not include a sender.");
    }
    return services.userService.ensureUser(toTelegramProfile(ctx));
}
function toTelegramProfile(ctx) {
    if (!ctx.from) {
        throw new Error("Telegram update did not include a sender.");
    }
    const firstName = ctx.from?.first_name?.trim() ?? "کاربر";
    const lastName = ctx.from?.last_name?.trim();
    const displayName = [firstName, lastName].filter(Boolean).join(" ");
    return {
        telegramId: ctx.from.id,
        username: ctx.from?.username,
        displayName
    };
}
function isMainMenuText(text) {
    return ["خرید سرویس", "اکانت تست", "سرویس های من", "پشتیبانی"].includes(text);
}
function isHttpsWebAppUrl(value) {
    return value.startsWith("https://");
}
