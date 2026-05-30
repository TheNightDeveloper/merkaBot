"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startScheduler = startScheduler;
const logger_1 = require("./logger");
function startScheduler(bot, services) {
    const runSafely = async (label, task) => {
        try {
            await task();
        }
        catch (error) {
            logger_1.logger.error(`Scheduled task failed: ${label}`, {
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
async function sendExpiryReminders(bot, services, daysBeforeExpiry) {
    const candidates = await services.serviceService.findReminderCandidates(daysBeforeExpiry);
    for (const item of candidates) {
        await bot.telegram.sendMessage(item.user.telegramId, `سرویس #${item.service.id} شما ${daysBeforeExpiry} روز دیگر منقضی می شود. برای تمدید وارد بخش "سرویس های من" شوید.`);
        await services.serviceService.markReminderSent(item.service.id, daysBeforeExpiry);
    }
}
