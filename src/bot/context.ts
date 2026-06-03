import type { Context } from "telegraf";

type PendingReceiptAction = {
  kind: "receipt";
  orderId: number;
};

type PendingSupportMessageAction = {
  kind: "support_message";
  ticketId: number;
};

export type BotSession = {
  pendingAction?:
    | PendingReceiptAction
    | PendingSupportMessageAction;
};

export type BotContext = Context & {
  session: BotSession;
};
