"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const config_1 = require("./config");
const bootstrap_1 = require("./infra/db/bootstrap");
const client_1 = require("./infra/db/client");
const logger_1 = require("./infra/logger");
const scheduler_1 = require("./infra/scheduler");
const verify_access_1 = require("./infra/3xui/verify-access");
async function main() {
    logger_1.logger.info("Loading config");
    const config = (0, config_1.loadConfig)();
    logger_1.logger.info("Opening database");
    const { db, sqlite, persist, close } = await (0, client_1.createDb)(config);
    (0, bootstrap_1.bootstrapDatabase)(sqlite);
    await persist();
    const { bot, services } = (0, app_1.createApp)(config, db, persist);
    logger_1.logger.info("Checking 3x-ui access");
    await (0, verify_access_1.verifyPanelAccess)(services.gateway);
    logger_1.logger.info("Launching Telegram bot");
    await bot.launch(() => {
        (0, scheduler_1.startScheduler)(bot, services);
        logger_1.logger.info("MerkaBot started");
    });
    const shutdown = async (signal) => {
        logger_1.logger.info("Shutting down", { signal });
        bot.stop(signal);
        await close();
        process.exit(0);
    };
    process.once("SIGINT", () => {
        void shutdown("SIGINT");
    });
    process.once("SIGTERM", () => {
        void shutdown("SIGTERM");
    });
}
main().catch((error) => {
    logger_1.logger.error("Application startup failed", {
        error: error instanceof Error ? error.message : String(error)
    });
    process.exit(1);
});
