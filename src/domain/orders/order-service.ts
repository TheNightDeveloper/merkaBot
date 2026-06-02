import { and, desc, eq, inArray } from "drizzle-orm";

import type { AppDatabase } from "../../infra/db/client";
import { orderColumns, planColumns, serviceColumns, userColumns } from "../../infra/db/selectors";
import { withoutUndefined } from "../../infra/db/sanitize";
import { orders, plans, services, users } from "../../infra/db/schema";
import type { OrderKind, OrderStatus } from "../../types";

export class OrderService {
  constructor(
    private readonly db: AppDatabase,
    private readonly persist: () => Promise<void>
  ) {}

  async createOrder(input: {
    userId: number;
    planCode: string;
    kind: OrderKind;
    targetServiceId?: number;
    initialStatus?: OrderStatus;
  }) {
    const now = new Date();
    const [created] = await this.db
      .insert(orders)
      .values(withoutUndefined({
        userId: input.userId,
        planCode: input.planCode,
        kind: input.kind,
        status: input.initialStatus ?? "pending_receipt",
        targetServiceId: input.targetServiceId ?? null,
        createdAt: now,
        updatedAt: now
      }))
      .returning();
    await this.persist();

    return created;
  }

  async submitReceipt(orderId: number, receipt: { fileId?: string; text?: string }) {
    const now = new Date();
    const [updated] = await this.db
      .update(orders)
      .set(withoutUndefined({
        receiptFileId: receipt.fileId ?? null,
        receiptText: receipt.text ?? null,
        status: "under_review",
        updatedAt: now
      }))
      .where(eq(orders.id, orderId))
      .returning();
    await this.persist();

    return updated;
  }

  async markApproved(orderId: number) {
    return this.transition(orderId, "approved");
  }

  async markRejected(orderId: number, adminNote: string) {
    return this.transition(orderId, "rejected", adminNote);
  }

  async markNeedsClarification(orderId: number, adminNote: string) {
    return this.transition(orderId, "pending_receipt", adminNote);
  }

  async markFulfilled(orderId: number) {
    return this.transition(orderId, "fulfilled");
  }

  async markFailed(orderId: number, adminNote: string) {
    return this.transition(orderId, "failed", adminNote);
  }

  async revertToReview(orderId: number, adminNote: string) {
    return this.transition(orderId, "under_review", adminNote);
  }

  async getOrderById(orderId: number) {
    const rows = await this.db
      .select(orderColumns)
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    return rows[0] ?? null;
  }

  async getOrderWithRelations(orderId: number) {
    return this.db
      .select({
        order: orderColumns,
        plan: planColumns,
        user: userColumns,
        service: serviceColumns
      })
      .from(orders)
      .innerJoin(plans, eq(orders.planCode, plans.code))
      .innerJoin(users, eq(orders.userId, users.id))
      .leftJoin(services, eq(orders.targetServiceId, services.id))
      .where(eq(orders.id, orderId))
      .limit(1)
      .then((rows) => rows[0] ?? null);
  }

  async getOrderForUser(orderId: number, userId: number) {
    return this.db
      .select({
        order: orderColumns,
        plan: planColumns,
        user: userColumns,
        service: serviceColumns
      })
      .from(orders)
      .innerJoin(plans, eq(orders.planCode, plans.code))
      .innerJoin(users, eq(orders.userId, users.id))
      .leftJoin(services, eq(orders.targetServiceId, services.id))
      .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
      .limit(1)
      .then((rows) => rows[0] ?? null);
  }

  async listOrdersForUser(userId: number) {
    return this.db
      .select({
        order: orderColumns,
        plan: planColumns,
        service: serviceColumns
      })
      .from(orders)
      .innerJoin(plans, eq(orders.planCode, plans.code))
      .leftJoin(services, eq(orders.targetServiceId, services.id))
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.createdAt));
  }

  async listPendingOrders() {
    return this.db
      .select({
        order: orderColumns,
        plan: planColumns,
        user: userColumns
      })
      .from(orders)
      .innerJoin(plans, eq(orders.planCode, plans.code))
      .innerJoin(users, eq(orders.userId, users.id))
      .where(inArray(orders.status, ["under_review", "pending_receipt"]))
      .orderBy(desc(orders.createdAt));
  }

  private async transition(orderId: number, status: OrderStatus, adminNote?: string) {
    const now = new Date();
    const [updated] = await this.db
      .update(orders)
      .set(withoutUndefined({
        status,
        adminNote: adminNote ?? null,
        updatedAt: now
      }))
      .where(eq(orders.id, orderId))
      .returning();
    await this.persist();

    return updated;
  }
}
