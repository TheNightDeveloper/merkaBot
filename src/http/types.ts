import type { ServerResponse } from "node:http";

import type { Telegraf } from "telegraf";

import type { AppServices } from "../app";
import type { BotContext } from "../bot/context";
import type { AppConfig } from "../config";

export type AppAuthenticatedUser = {
  id: number;
  telegramId: number;
  username: string | null;
  displayName: string;
  isAdmin: boolean;
  trialUsed: boolean;
  createdAt: Date;
};

export type AppRequestContext = {
  request: Request;
  requestUrl: URL;
  response: ServerResponse;
  config: AppConfig;
  services: AppServices;
  bot: Telegraf<BotContext>;
  user: AppAuthenticatedUser;
};
