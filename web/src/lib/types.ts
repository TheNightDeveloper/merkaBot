export type PaymentInfo = {
  cardTitle: string;
  cardNumber: string;
  notes: string;
};

export type UserDto = {
  id: number;
  telegramId: number;
  username: string | null;
  displayName: string;
  isAdmin: boolean;
  trialUsed: boolean;
  createdAt: string;
};

export type PlanDto = {
  code: string;
  title: string;
  days: number;
  trafficBytes: number;
  deviceLimit: number;
  priceLabel: string;
  enabled: boolean;
  isTrial: boolean;
};

export type ServiceDto = {
  id: number;
  planCode: string;
  type: "trial" | "paid";
  status: "active" | "expired" | "disabled";
  email: string;
  subId: string;
  inboundId: number;
  expiresAt: string;
  trafficBytes: number;
  lastUsageUp: number;
  lastUsageDown: number;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
  plan?: PlanDto;
  deliveryMessage?: string;
};

export type OrderDto = {
  id: number;
  kind: "new" | "renew" | "trial";
  status: "pending_receipt" | "under_review" | "approved" | "rejected" | "fulfilled" | "failed";
  receiptText: string | null;
  adminNote: string | null;
  targetServiceId: number | null;
  hasReceiptImage: boolean;
  requiresReceipt: boolean;
  createdAt: string;
  updatedAt: string;
  plan: PlanDto;
  service: {
    id: number;
    status: string;
    expiresAt: string;
  } | null;
};

export type TicketMessageDto = {
  id: number;
  ticketId: number;
  body: string;
  senderRole: "user" | "admin";
  createdAt: string;
};

export type TicketDto = {
  id: number;
  status: "open" | "closed";
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  messages?: TicketMessageDto[];
};

export type AppSnapshot = {
  user: UserDto;
  payment: PaymentInfo;
  plans: PlanDto[];
  services: ServiceDto[];
  orders: OrderDto[];
  tickets: TicketDto[];
  preview: boolean;
};
