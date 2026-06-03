import { Input, Telegraf } from "telegraf";

import type { AppServices } from "../app";
import type { BotContext } from "./context";
import { buildAdminOrderKeyboard, buildAdminTicketKeyboard } from "./keyboards";

export async function notifyAdminsOfOrder(
  bot: Telegraf<BotContext>,
  services: AppServices,
  orderId: number,
  options?: {
    localPhotoPath?: string;
  }
): Promise<string | undefined> {
  const bundle = await services.orderService.getOrderWithRelations(orderId);

  if (!bundle) {
    return undefined;
  }

  const message = describeOrder(orderId, bundle.user.displayName, bundle.user.telegramId, bundle.plan.title, bundle.order.receiptText);
  const keyboard = buildAdminOrderKeyboard(orderId, bundle.user.telegramId, services.config.webAppBaseUrl);

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
      const sent = await bot.telegram.sendPhoto(adminId, Input.fromLocalFile(options.localPhotoPath), {
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

export async function notifyAdminsOfTicket(
  bot: Telegraf<BotContext>,
  services: AppServices,
  ticketId: number,
  summary: string
) {
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
    await bot.telegram.sendMessage(adminId, message, buildAdminTicketKeyboard(ticketId, bundle.user.telegramId, services.config.webAppBaseUrl));
  }
}

export function describeOrder(
  orderId: number,
  displayName: string,
  telegramId: number,
  planTitle: string,
  receiptText?: string | null
) {
  return [
    `سفارش #${orderId}`,
    `کاربر: ${displayName}`,
    `تلگرام: ${telegramId}`,
    `پلن: ${planTitle}`,
    receiptText ? `توضیح/کد تراکنش: ${receiptText}` : "رسید تصویری ارسال شده است."
  ].join("\n");
}
