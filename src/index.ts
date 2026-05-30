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

  const { bot, services } = createApp(config, db, persist);

  logger.info("Checking 3x-ui access");
  await verifyPanelAccess(services.gateway);
  logger.info("Launching Telegram bot");
  await bot.launch(() => {
    startScheduler(bot, services);
    logger.info("MerkaBot started");
  });

  const shutdown = async (signal: string) => {
    logger.info("Shutting down", { signal });
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
  logger.error("Application startup failed", {
    error: error instanceof Error ? error.message : String(error)
  });
  process.exit(1);
});
