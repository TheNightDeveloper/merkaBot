import type { Context } from "telegraf";

type PendingReceiptAction = {
  kind: "receipt";
  orderId: number;
};

type PendingSupportMessageAction = {
  kind: "support_message";
  ticketId: number;
};

type PendingAdminOrderNoteAction = {
  kind: "admin_order_note";
  orderId: number;
  mode: "reject" | "clarify";
};

type PendingAdminTicketReplyAction = {
  kind: "admin_ticket_reply";
  ticketId: number;
  userTelegramId: number;
};

export type BotSession = {
  pendingAction?:
    | PendingReceiptAction
    | PendingSupportMessageAction
    | PendingAdminOrderNoteAction
    | PendingAdminTicketReplyAction;
};

export type BotContext = Context & {
  session: BotSession;
};
