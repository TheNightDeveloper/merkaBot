import type { Telegraf } from "telegraf";

import type { AppServices } from "../app";
import type { BotContext } from "../bot/context";
import { logger } from "./logger";

export function startScheduler(bot: Telegraf<BotContext>, services: AppServices) {
  const runSafely = async (label: string, task: () => Promise<void>) => {
    try {
      await task();
    } catch (error) {
      logger.error(`Scheduled task failed: ${label}`, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };

  setInterval(() => {
    void runSafely("syncActiveServices", () => services.serviceService.syncActiveServices());
  }, 15 * 60 * 1000);

  setInterval(() => {
    void runSafely("reconcileExpiredServices", () => services.serviceService.reconcileExpiredServices());
  }, 60 * 60 * 1000);

  setInterval(() => {
    void runSafely("reminders", async () => {
      await sendExpiryReminders(bot, services, 3);
      await sendExpiryReminders(bot, services, 1);
    });
  }, 6 * 60 * 60 * 1000);
}

async function sendExpiryReminders(bot: Telegraf<BotContext>, services: AppServices, daysBeforeExpiry: 1 | 3) {
  const candidates = await services.serviceService.findReminderCandidates(daysBeforeExpiry);

  for (const item of candidates) {
    await bot.telegram.sendMessage(
      item.user.telegramId,
      `سرویس #${item.service.id} شما ${daysBeforeExpiry} روز دیگر منقضی می شود. برای تمدید وارد بخش "سرویس های من" شوید.`
    );
    await services.serviceService.markReminderSent(item.service.id, daysBeforeExpiry);
  }
}
