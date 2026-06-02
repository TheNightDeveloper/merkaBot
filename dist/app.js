"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const telegraf_1 = require("telegraf");
const order_service_1 = require("./domain/orders/order-service");
const plan_service_1 = require("./domain/plans/plan-service");
const service_service_1 = require("./domain/services/service-service");
const support_service_1 = require("./domain/support/support-service");
const user_service_1 = require("./domain/users/user-service");
const logger_1 = require("./infra/logger");
const gateway_1 = require("./infra/3xui/gateway");
const setup_1 = require("./bot/setup");
const server_1 = require("./http/server");
async function createApp(config, db, persist) {
    const gateway = new gateway_1.ThreeXUiGateway(config);
    const userService = new user_service_1.UserService(db, config.adminIds, persist);
    const planService = new plan_service_1.PlanService(db);
    const orderService = new order_service_1.OrderService(db, persist);
    const serviceService = new service_service_1.ServiceService(db, config, gateway, orderService, planService, userService, persist);
    const supportService = new support_service_1.SupportService(db, userService, persist);
    const services = {
        config,
        db,
        userService,
        planService,
        orderService,
        serviceService,
        supportService,
        gateway
    };
    const bot = new telegraf_1.Telegraf(config.botToken, {
        telegram: config.telegramProxyUrl
            ? {
                agent: await createTelegramProxyAgent(config.telegramProxyUrl)
            }
            : undefined
    });
    bot.use((0, telegraf_1.session)({ defaultSession: () => ({}) }));
    (0, setup_1.buildBot)(bot, services);
    const server = (0, server_1.createHttpServer)(config, services, bot);
    bot.catch((error) => {
        logger_1.logger.error("Unhandled bot error", {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        });
    });
    return { bot, services, server };
}
async function createTelegramProxyAgent(proxyUrl) {
    const { SocksProxyAgent } = await import("socks-proxy-agent");
    return new SocksProxyAgent(proxyUrl);
}
