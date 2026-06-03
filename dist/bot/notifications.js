"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyAdminsOfOrder = notifyAdminsOfOrder;
exports.notifyAdminsOfTicket = notifyAdminsOfTicket;
exports.describeOrder = describeOrder;
const telegraf_1 = require("telegraf");
const keyboards_1 = require("./keyboards");
async function notifyAdminsOfOrder(bot, services, orderId, options) {
    const bundle = await services.orderService.getOrderWithRelations(orderId);
    if (!bundle) {
        return undefined;
    }
    const message = describeOrder(orderId, bundle.user.displayName, bundle.user.telegramId, bundle.plan.title, bundle.order.receiptText);
    const keyboard = (0, keyboards_1.buildAdminOrderKeyboard)(orderId, bundle.user.telegramId, services.config.webAppBaseUrl);
    let uploadedFileId = bundle.order.receiptFileId ?? undefined;
    for (const adminId of services.config.adminIds) {
        if (uploadedFileId) {
            await bot.telegram.sendPhoto(adminId, uploadedFileId, {
                caption: message,
                ...keyboard
            });
            continue;
        }
        if (options?.localPhotoPath) {
            const sent = await bot.telegram.sendPhoto(adminId, telegraf_1.Input.fromLocalFile(options.localPhotoPath), {
                caption: message,
                ...keyboard
            });
            uploadedFileId = "photo" in sent ? sent.photo.at(-1)?.file_id : undefined;
            continue;
        }
        await bot.telegram.sendMessage(adminId, message, keyboard);
    }
    return uploadedFileId;
}
async function notifyAdminsOfTicket(bot, services, ticketId, summary) {
    const bundle = await services.supportService.getTicketWithUser(ticketId);
    if (!bundle) {
        return;
    }
    const message = [
        `تیکت #${ticketId}`,
        `کاربر: ${bundle.user.displayName}`,
        `تلگرام: ${bundle.user.telegramId}`,
        summary
    ].join("\n");
    for (const adminId of services.config.adminIds) {
        await bot.telegram.sendMessage(adminId, message, (0, keyboards_1.buildAdminTicketKeyboard)(ticketId, bundle.user.telegramId, services.config.webAppBaseUrl));
    }
}
function describeOrder(orderId, displayName, telegramId, planTitle, receiptText) {
    return [
        `سفارش #${orderId}`,
        `کاربر: ${displayName}`,
        `تلگرام: ${telegramId}`,
        `پلن: ${planTitle}`,
        receiptText ? `توضیح/کد تراکنش: ${receiptText}` : "رسید تصویری ارسال شده است."
    ].join("\n");
}
