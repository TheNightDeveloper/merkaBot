import type { AdminOrderDto, AdminQueueSummaryDto, AdminScope, AdminTicketDto, OrderDto, PaymentInfo, PlanDto, ServiceDto, TicketDto, TicketMessageDto, UserDto } from "./types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    cache: "no-store"
  });
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : null;

  if (!response.ok) {
    throw new ApiError(response.status, payload?.error ?? "درخواست با خطا روبه‌رو شد.");
  }

  return payload as T;
}

export const api = {
  authTelegram: (initData: string) =>
    request<{ user: UserDto }>("/api/auth/telegram", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ initData })
    }),
  logout: () =>
    request<{ ok: boolean }>("/api/auth/logout", {
      method: "POST"
    }),
  getMe: () => request<{ user: UserDto }>("/api/me"),
  getPlans: () => request<{ payment: PaymentInfo; plans: PlanDto[] }>("/api/plans"),
  requestTrial: () => request<{ service: ServiceDto; deliveryMessage: string }>("/api/trial", { method: "POST" }),
  createOrder: (planCode: string) =>
    request<{ payment: PaymentInfo; order: OrderDto }>("/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ planCode })
    }),
  getOrders: () => request<{ orders: OrderDto[] }>("/api/orders"),
  getOrder: (orderId: number) => request<{ payment: PaymentInfo; order: OrderDto }>(`/api/orders/${orderId}`),
  submitReceipt: (orderId: number, formData: FormData) =>
    request<{ order: OrderDto }>(`/api/orders/${orderId}/receipt`, {
      method: "POST",
      body: formData
    }),
  getServices: () => request<{ services: ServiceDto[] }>("/api/services"),
  getService: (serviceId: number) => request<{ service: ServiceDto }>(`/api/services/${serviceId}`),
  renewService: (serviceId: number) =>
    request<{ payment: PaymentInfo; order: OrderDto }>(`/api/services/${serviceId}/renew`, {
      method: "POST"
    }),
  getTickets: () => request<{ tickets: TicketDto[] }>("/api/tickets"),
  ensureTicket: () =>
    request<{ ticket: TicketDto }>("/api/tickets", {
      method: "POST"
    }),
  getTicket: (ticketId: number) => request<{ ticket: TicketDto }>(`/api/tickets/${ticketId}`),
  sendTicketMessage: (ticketId: number, body: string) =>
    request<{ message: TicketMessageDto }>(`/api/tickets/${ticketId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ body })
    }),
  admin: {
    getSummary: () => request<{ summary: AdminQueueSummaryDto }>("/api/admin/summary"),
    getOrders: (scope: AdminScope) => request<{ orders: AdminOrderDto[] }>(`/api/admin/orders?scope=${scope}`),
    getOrder: (orderId: number) => request<{ order: AdminOrderDto }>(`/api/admin/orders/${orderId}`),
    claimOrder: (orderId: number) =>
      request<{ order: AdminOrderDto }>(`/api/admin/orders/${orderId}/claim`, { method: "POST" }),
    releaseOrder: (orderId: number) =>
      request<{ order: AdminOrderDto }>(`/api/admin/orders/${orderId}/release`, { method: "POST" }),
    approveOrder: (orderId: number) =>
      request<{ order: AdminOrderDto }>(`/api/admin/orders/${orderId}/approve`, { method: "POST" }),
    rejectOrder: (orderId: number, note: string) =>
      request<{ order: AdminOrderDto }>(`/api/admin/orders/${orderId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note })
      }),
    clarifyOrder: (orderId: number, note: string) =>
      request<{ order: AdminOrderDto }>(`/api/admin/orders/${orderId}/clarify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note })
      }),
    getTickets: (scope: AdminScope) => request<{ tickets: AdminTicketDto[] }>(`/api/admin/tickets?scope=${scope}`),
    getTicket: (ticketId: number) => request<{ ticket: AdminTicketDto }>(`/api/admin/tickets/${ticketId}`),
    claimTicket: (ticketId: number) =>
      request<{ ticket: AdminTicketDto }>(`/api/admin/tickets/${ticketId}/claim`, { method: "POST" }),
    releaseTicket: (ticketId: number) =>
      request<{ ticket: AdminTicketDto }>(`/api/admin/tickets/${ticketId}/release`, { method: "POST" }),
    replyTicket: (ticketId: number, body: string) =>
      request<{ ticket: AdminTicketDto }>(`/api/admin/tickets/${ticketId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body })
      }),
    closeTicket: (ticketId: number) =>
      request<{ ticket: AdminTicketDto }>(`/api/admin/tickets/${ticketId}/close`, { method: "POST" })
  }
};
