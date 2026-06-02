import { createApp } from "./app";
import { loadConfig } from "./config";
import { bootstrapDatabase } from "./infra/db/bootstrap";
import { createDb } from "./infra/db/client";
import { logger } from "./infra/logger";
import { startScheduler } from "./infra/scheduler";
import { verifyPanelAccess } from "./infra/3xui/verify-access";

async function main() {
  logger.info("Loading config");
  const config = loadConfig();
  logger.info("Opening database");
  const { db, sqlite, persist, close } = await createDb(config);
  bootstrapDatabase(sqlite);
  await persist();

  const { bot, services, server } = await createApp(config, db, persist);

  logger.info("Checking 3x-ui access");
  try {
    await verifyPanelAccess(services.gateway);
  } catch (error) {
    if (!isLocalWebAppUrl(config.webAppBaseUrl)) {
      throw error;
    }

    logger.warn("3x-ui access check failed during local startup; continuing with web app preview", {
      error: error instanceof Error ? error.message : String(error),
      webAppBaseUrl: config.webAppBaseUrl
    });
  }
  await new Promise<void>((resolve) => {
    server.listen(config.port, () => {
      logger.info("HTTP server started", {
        port: config.port,
        webAppBaseUrl: config.webAppBaseUrl
      });
      resolve();
    });
  });
  logger.info("Launching Telegram bot");
  let botStarted = false;

  try {
    await bot.launch();
    botStarted = true;
    startScheduler(bot, services);
    if (config.webAppBaseUrl.startsWith("https://")) {
      await bot.telegram
        .setChatMenuButton({
          menuButton: {
            type: "web_app",
            text: "پنل MerkaBot",
            web_app: {
              url: config.webAppBaseUrl
            }
          }
        })
        .catch((error) => {
          logger.warn("Failed to set bot menu button", {
            error: error instanceof Error ? error.message : String(error)
          });
        });
    } else {
      logger.warn("Skipping Telegram web_app menu button because WEBAPP_BASE_URL is not HTTPS", {
        webAppBaseUrl: config.webAppBaseUrl
      });
    }
    logger.info("MerkaBot started");
  } catch (error) {
    logger.warn("Telegram bot launch failed; HTTP server will stay online", {
      error: error instanceof Error ? error.message : String(error)
    });
    logger.info("MerkaBot web app started in degraded mode");
  }

  const shutdown = async (signal: string) => {
    logger.info("Shutting down", { signal });
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    }).catch((error) => {
      logger.warn("HTTP server shutdown failed", {
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
  logger.error("Application startup failed", {
    error: error instanceof Error ? error.message : String(error)
  });
  process.exit(1);
});

function isLocalWebAppUrl(value: string) {
  return value.startsWith("http://localhost:") || value.startsWith("http://127.0.0.1:");
}
