import { Markup } from "telegraf";

export function buildMainKeyboard() {
  return Markup.keyboard([
    ["خرید سرویس", "اکانت تست"],
    ["سرویس های من", "پشتیبانی"]
  ]).resize();
}

export function buildPlansKeyboard(plans: Array<{ code: string; title: string; priceLabel: string }>) {
  return Markup.inlineKeyboard(
    plans.map((plan) => [
      Markup.button.callback(`${plan.title} | ${plan.priceLabel}`, `buy:${plan.code}`)
    ])
  );
}

export function buildServiceKeyboard(serviceId: number) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("نمایش کانفیگ", `svc:show:${serviceId}`),
      Markup.button.callback("ارسال مجدد", `svc:resend:${serviceId}`)
    ],
    [Markup.button.callback("تمدید", `svc:renew:${serviceId}`)]
  ]);
}

export function buildAdminOrderKeyboard(orderId: number, telegramUserId: number) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("تایید", `ord:approve:${orderId}`),
      Markup.button.callback("رد", `ord:reject:${orderId}`)
    ],
    [
      Markup.button.callback("نیاز به توضیح", `ord:clarify:${orderId}`),
      Markup.button.callback("سرویس های کاربر", `adm:user:${telegramUserId}`)
    ]
  ]);
}

export function buildAdminTicketKeyboard(ticketId: number, telegramUserId: number) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("پاسخ", `ticket:reply:${ticketId}`),
      Markup.button.callback("بستن", `ticket:close:${ticketId}`)
    ],
    [Markup.button.callback("سرویس های کاربر", `adm:user:${telegramUserId}`)]
  ]);
}

export function buildAdminMenuKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("سفارش های باز", "adm:orders"),
      Markup.button.callback("تیکت های باز", "adm:tickets")
    ]
  ]);
}
