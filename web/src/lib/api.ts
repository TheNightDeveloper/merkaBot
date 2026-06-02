import type { OrderDto, PaymentInfo, PlanDto, ServiceDto, TicketDto, TicketMessageDto, UserDto } from "./types";

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
    credentials: "same-origin"
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
    })
};
