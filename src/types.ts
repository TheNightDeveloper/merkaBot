export type OrderKind = "new" | "renew" | "trial";

export type OrderStatus =
  | "pending_receipt"
  | "under_review"
  | "approved"
  | "rejected"
  | "fulfilled"
  | "failed";

export type ServiceType = "trial" | "paid";

export type ServiceStatus = "active" | "expired" | "disabled";

export type TicketStatus = "open" | "closed";
