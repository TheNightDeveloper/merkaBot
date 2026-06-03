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
    const { bot, services, server } = await (0, app_1.createApp)(config, db, persist);
    logger_1.logger.info("Checking 3x-ui access");
    try {
        await (0, verify_access_1.verifyPanelAccess)(services.gateway);
    }
    catch (error) {
        if (!isLocalWebAppUrl(config.webAppBaseUrl)) {
            throw error;
        }
        logger_1.logger.warn("3x-ui access check failed during local startup; continuing with web app preview", {
            error: error instanceof Error ? error.message : String(error),
            webAppBaseUrl: config.webAppBaseUrl
        });
    }
    await new Promise((resolve) => {
        server.listen(config.port, () => {
            logger_1.logger.info("HTTP server started", {
                port: config.port,
                webAppBaseUrl: config.webAppBaseUrl
            });
            resolve();
        });
    });
    logger_1.logger.info("Launching Telegram bot");
    let botStarted = false;
    try {
        await bot.launch();
        botStarted = true;
        (0, scheduler_1.startScheduler)(bot, services);
        if (config.webAppBaseUrl.startsWith("https://")) {
            await bot.telegram
                .setChatMenuButton({
                menuButton: {
                    type: "web_app",
                    text: "باز کردن",
                    web_app: {
                        url: config.webAppBaseUrl
                    }
                }
            })
                .catch((error) => {
                logger_1.logger.warn("Failed to set bot menu button", {
                    error: error instanceof Error ? error.message : String(error)
                });
            });
        }
        else {
            logger_1.logger.warn("Skipping Telegram web_app menu button because WEBAPP_BASE_URL is not HTTPS", {
                webAppBaseUrl: config.webAppBaseUrl
            });
        }
        logger_1.logger.info("MerkaBot started");
    }
    catch (error) {
        logger_1.logger.warn("Telegram bot launch failed; HTTP server will stay online", {
            error: error instanceof Error ? error.message : String(error)
        });
        logger_1.logger.info("MerkaBot web app started in degraded mode");
    }
    const shutdown = async (signal) => {
        logger_1.logger.info("Shutting down", { signal });
        await new Promise((resolve, reject) => {
            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            });
        }).catch((error) => {
            logger_1.logger.warn("HTTP server shutdown failed", {
                error: error instanceof Error ? error.message : String(error)
            });
        });
        if (botStarted) {
            bot.stop(signal);
        }
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
function isLocalWebAppUrl(value) {
    return value.startsWith("http://localhost:") || value.startsWith("http://127.0.0.1:");
}
