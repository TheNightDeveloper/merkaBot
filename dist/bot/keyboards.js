"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildMainKeyboard = buildMainKeyboard;
exports.buildWebAppKeyboard = buildWebAppKeyboard;
exports.buildPlansKeyboard = buildPlansKeyboard;
exports.buildServiceKeyboard = buildServiceKeyboard;
exports.buildAdminOrderKeyboard = buildAdminOrderKeyboard;
exports.buildAdminTicketKeyboard = buildAdminTicketKeyboard;
exports.buildAdminMenuKeyboard = buildAdminMenuKeyboard;
const telegraf_1 = require("telegraf");
function buildMainKeyboard() {
    return telegraf_1.Markup.keyboard([
        ["خرید سرویس", "اکانت تست"],
        ["سرویس های من", "پشتیبانی"]
    ]).resize();
}
function buildWebAppKeyboard(url) {
    return telegraf_1.Markup.inlineKeyboard([
        [telegraf_1.Markup.button.webApp("ورود به پنل MerkaBot", url)]
    ]);
}
function buildPlansKeyboard(plans) {
    return telegraf_1.Markup.inlineKeyboard(plans.map((plan) => [
        telegraf_1.Markup.button.callback(`${plan.title} | ${plan.priceLabel}`, `buy:${plan.code}`)
    ]));
}
function buildServiceKeyboard(serviceId) {
    return telegraf_1.Markup.inlineKeyboard([
        [
            telegraf_1.Markup.button.callback("نمایش کانفیگ", `svc:show:${serviceId}`),
            telegraf_1.Markup.button.callback("ارسال مجدد", `svc:resend:${serviceId}`)
        ],
        [telegraf_1.Markup.button.callback("تمدید", `svc:renew:${serviceId}`)]
    ]);
}
function buildAdminOrderKeyboard(orderId, telegramUserId) {
    return telegraf_1.Markup.inlineKeyboard([
        [
            telegraf_1.Markup.button.callback("تایید", `ord:approve:${orderId}`),
            telegraf_1.Markup.button.callback("رد", `ord:reject:${orderId}`)
        ],
        [
            telegraf_1.Markup.button.callback("نیاز به توضیح", `ord:clarify:${orderId}`),
            telegraf_1.Markup.button.callback("سرویس های کاربر", `adm:user:${telegramUserId}`)
        ]
    ]);
}
function buildAdminTicketKeyboard(ticketId, telegramUserId) {
    return telegraf_1.Markup.inlineKeyboard([
        [
            telegraf_1.Markup.button.callback("پاسخ", `ticket:reply:${ticketId}`),
            telegraf_1.Markup.button.callback("بستن", `ticket:close:${ticketId}`)
        ],
        [telegraf_1.Markup.button.callback("سرویس های کاربر", `adm:user:${telegramUserId}`)]
    ]);
}
function buildAdminMenuKeyboard() {
    return telegraf_1.Markup.inlineKeyboard([
        [
            telegraf_1.Markup.button.callback("سفارش های باز", "adm:orders"),
            telegraf_1.Markup.button.callback("تیکت های باز", "adm:tickets")
        ]
    ]);
}
