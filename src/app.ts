import type { Server } from "node:http";

import { session, Telegraf } from "telegraf";

import type { AppConfig } from "./config";
import type { AppDatabase } from "./infra/db/client";
import { OrderService } from "./domain/orders/order-service";
import { PlanService } from "./domain/plans/plan-service";
import { ServiceService } from "./domain/services/service-service";
import { SupportService } from "./domain/support/support-service";
import { UserService } from "./domain/users/user-service";
import { logger } from "./infra/logger";
import { ThreeXUiGateway } from "./infra/3xui/gateway";
import { buildBot } from "./bot/setup";
import type { BotContext, BotSession } from "./bot/context";
import { createHttpServer } from "./http/server";

export type AppServices = {
  config: AppConfig;
  db: AppDatabase;
  userService: UserService;
  planService: PlanService;
  orderService: OrderService;
  serviceService: ServiceService;
  supportService: SupportService;
  gateway: ThreeXUiGateway;
};

export async function createApp(
  config: AppConfig,
  db: AppDatabase,
  persist: () => Promise<void>
): Promise<{ bot: Telegraf<BotContext>; services: AppServices; server: Server }> {
  const gateway = new ThreeXUiGateway(config);
  const userService = new UserService(db, config.adminIds, persist);
  const planService = new PlanService(db);
  const orderService = new OrderService(db, persist);
  const serviceService = new ServiceService(db, config, gateway, orderService, planService, userService, persist);
  const supportService = new SupportService(db, userService, persist);

  const services: AppServices = {
    config,
    db,
    userService,
    planService,
    orderService,
    serviceService,
    supportService,
    gateway
  };

  const bot = new Telegraf<BotContext>(config.botToken, {
    telegram: config.telegramProxyUrl
      ? {
          agent: await createTelegramProxyAgent(config.telegramProxyUrl)
        }
      : undefined
  });
  bot.use(session({ defaultSession: (): BotSession => ({}) }));

  buildBot(bot, services);
  const server = createHttpServer(config, services, bot);

  bot.catch((error) => {
    logger.error("Unhandled bot error", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
  });

  return { bot, services, server };
}

async function createTelegramProxyAgent(proxyUrl: string) {
  const { SocksProxyAgent } = await import("socks-proxy-agent");
  return new SocksProxyAgent(proxyUrl);
}
