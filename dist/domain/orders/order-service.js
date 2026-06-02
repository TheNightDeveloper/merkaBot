"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderService = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const selectors_1 = require("../../infra/db/selectors");
const sanitize_1 = require("../../infra/db/sanitize");
const schema_1 = require("../../infra/db/schema");
class OrderService {
    db;
    persist;
    constructor(db, persist) {
        this.db = db;
        this.persist = persist;
    }
    async createOrder(input) {
        const now = new Date();
        const [created] = await this.db
            .insert(schema_1.orders)
            .values((0, sanitize_1.withoutUndefined)({
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
    async submitReceipt(orderId, receipt) {
        const now = new Date();
        const [updated] = await this.db
            .update(schema_1.orders)
            .set((0, sanitize_1.withoutUndefined)({
            receiptFileId: receipt.fileId ?? null,
            receiptText: receipt.text ?? null,
            status: "under_review",
            updatedAt: now
        }))
            .where((0, drizzle_orm_1.eq)(schema_1.orders.id, orderId))
            .returning();
        await this.persist();
        return updated;
    }
    async markApproved(orderId) {
        return this.transition(orderId, "approved");
    }
    async markRejected(orderId, adminNote) {
        return this.transition(orderId, "rejected", adminNote);
    }
    async markNeedsClarification(orderId, adminNote) {
        return this.transition(orderId, "pending_receipt", adminNote);
    }
    async markFulfilled(orderId) {
        return this.transition(orderId, "fulfilled");
    }
    async markFailed(orderId, adminNote) {
        return this.transition(orderId, "failed", adminNote);
    }
    async revertToReview(orderId, adminNote) {
        return this.transition(orderId, "under_review", adminNote);
    }
    async getOrderById(orderId) {
        const rows = await this.db
            .select(selectors_1.orderColumns)
            .from(schema_1.orders)
            .where((0, drizzle_orm_1.eq)(schema_1.orders.id, orderId))
            .limit(1);
        return rows[0] ?? null;
    }
    async getOrderWithRelations(orderId) {
        return this.db
            .select({
            order: selectors_1.orderColumns,
            plan: selectors_1.planColumns,
            user: selectors_1.userColumns,
            service: selectors_1.serviceColumns
        })
            .from(schema_1.orders)
            .innerJoin(schema_1.plans, (0, drizzle_orm_1.eq)(schema_1.orders.planCode, schema_1.plans.code))
            .innerJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.orders.userId, schema_1.users.id))
            .leftJoin(schema_1.services, (0, drizzle_orm_1.eq)(schema_1.orders.targetServiceId, schema_1.services.id))
            .where((0, drizzle_orm_1.eq)(schema_1.orders.id, orderId))
            .limit(1)
            .then((rows) => rows[0] ?? null);
    }
    async getOrderForUser(orderId, userId) {
        return this.db
            .select({
            order: selectors_1.orderColumns,
            plan: selectors_1.planColumns,
            user: selectors_1.userColumns,
            service: selectors_1.serviceColumns
        })
            .from(schema_1.orders)
            .innerJoin(schema_1.plans, (0, drizzle_orm_1.eq)(schema_1.orders.planCode, schema_1.plans.code))
            .innerJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.orders.userId, schema_1.users.id))
            .leftJoin(schema_1.services, (0, drizzle_orm_1.eq)(schema_1.orders.targetServiceId, schema_1.services.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.orders.id, orderId), (0, drizzle_orm_1.eq)(schema_1.orders.userId, userId)))
            .limit(1)
            .then((rows) => rows[0] ?? null);
    }
    async listOrdersForUser(userId) {
        return this.db
            .select({
            order: selectors_1.orderColumns,
            plan: selectors_1.planColumns,
            service: selectors_1.serviceColumns
        })
            .from(schema_1.orders)
            .innerJoin(schema_1.plans, (0, drizzle_orm_1.eq)(schema_1.orders.planCode, schema_1.plans.code))
            .leftJoin(schema_1.services, (0, drizzle_orm_1.eq)(schema_1.orders.targetServiceId, schema_1.services.id))
            .where((0, drizzle_orm_1.eq)(schema_1.orders.userId, userId))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.orders.createdAt));
    }
    async listPendingOrders() {
        return this.db
            .select({
            order: selectors_1.orderColumns,
            plan: selectors_1.planColumns,
            user: selectors_1.userColumns
        })
            .from(schema_1.orders)
            .innerJoin(schema_1.plans, (0, drizzle_orm_1.eq)(schema_1.orders.planCode, schema_1.plans.code))
            .innerJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.orders.userId, schema_1.users.id))
            .where((0, drizzle_orm_1.inArray)(schema_1.orders.status, ["under_review", "pending_receipt"]))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.orders.createdAt));
    }
    async transition(orderId, status, adminNote) {
        const now = new Date();
        const [updated] = await this.db
            .update(schema_1.orders)
            .set((0, sanitize_1.withoutUndefined)({
            status,
            adminNote: adminNote ?? null,
            updatedAt: now
        }))
            .where((0, drizzle_orm_1.eq)(schema_1.orders.id, orderId))
            .returning();
        await this.persist();
        return updated;
    }
}
exports.OrderService = OrderService;
