"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupportService = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const selectors_1 = require("../../infra/db/selectors");
const sanitize_1 = require("../../infra/db/sanitize");
const schema_1 = require("../../infra/db/schema");
class SupportService {
    db;
    userService;
    persist;
    constructor(db, userService, persist) {
        this.db = db;
        this.userService = userService;
        this.persist = persist;
    }
    async getOrCreateOpenTicket(telegramId) {
        const user = await this.userService.getByTelegramId(telegramId);
        if (!user) {
            throw new Error("User not found.");
        }
        return this.getOrCreateOpenTicketForUserId(user.id);
    }
    async getOrCreateOpenTicketForUserId(userId) {
        const now = new Date();
        const existingRows = await this.db
            .select(selectors_1.ticketColumns)
            .from(schema_1.tickets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.tickets.userId, userId), (0, drizzle_orm_1.eq)(schema_1.tickets.status, "open")))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.tickets.createdAt))
            .limit(1);
        const existing = existingRows[0] ?? null;
        if (existing) {
            return existing;
        }
        const [created] = await this.db
            .insert(schema_1.tickets)
            .values((0, sanitize_1.withoutUndefined)({
            userId,
            status: "open",
            createdAt: now,
            updatedAt: now
        }))
            .returning();
        await this.persist();
        return created;
    }
    async addUserMessage(ticketId, userId, body) {
        const now = new Date();
        const [created] = await this.db
            .insert(schema_1.ticketMessages)
            .values((0, sanitize_1.withoutUndefined)({
            ticketId,
            senderUserId: userId,
            senderAdminId: null,
            body,
            createdAt: now
        }))
            .returning();
        await this.db
            .update(schema_1.tickets)
            .set((0, sanitize_1.withoutUndefined)({
            updatedAt: now
        }))
            .where((0, drizzle_orm_1.eq)(schema_1.tickets.id, ticketId));
        await this.persist();
        return created;
    }
    async addAdminReply(ticketId, adminTelegramId, body) {
        const now = new Date();
        const [created] = await this.db
            .insert(schema_1.ticketMessages)
            .values((0, sanitize_1.withoutUndefined)({
            ticketId,
            senderUserId: null,
            senderAdminId: adminTelegramId,
            body,
            createdAt: now
        }))
            .returning();
        await this.db
            .update(schema_1.tickets)
            .set((0, sanitize_1.withoutUndefined)({
            updatedAt: now
        }))
            .where((0, drizzle_orm_1.eq)(schema_1.tickets.id, ticketId));
        await this.persist();
        return created;
    }
    async closeTicket(ticketId) {
        const now = new Date();
        const [updated] = await this.db
            .update(schema_1.tickets)
            .set((0, sanitize_1.withoutUndefined)({
            status: "closed",
            updatedAt: now,
            closedAt: now
        }))
            .where((0, drizzle_orm_1.eq)(schema_1.tickets.id, ticketId))
            .returning();
        await this.persist();
        return updated;
    }
    async listOpenTickets() {
        return this.listAdminTickets("all", 0);
    }
    async listAdminTickets(scope, adminUserId) {
        const filters = [(0, drizzle_orm_1.eq)(schema_1.tickets.status, "open")];
        if (scope === "unclaimed") {
            filters.push((0, drizzle_orm_1.isNull)(schema_1.tickets.assignedAdminUserId));
        }
        else if (scope === "mine") {
            filters.push((0, drizzle_orm_1.eq)(schema_1.tickets.assignedAdminUserId, adminUserId));
        }
        return this.db
            .select({
            ticket: selectors_1.ticketColumns,
            user: selectors_1.userColumns
        })
            .from(schema_1.tickets)
            .innerJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.tickets.userId, schema_1.users.id))
            .where((0, drizzle_orm_1.and)(...filters))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.tickets.updatedAt));
    }
    async countAdminQueues(adminUserId) {
        const all = await this.listAdminTickets("all", adminUserId);
        return {
            total: all.length,
            mine: all.filter((item) => item.ticket.assignedAdminUserId === adminUserId).length,
            unclaimed: all.filter((item) => item.ticket.assignedAdminUserId === null).length
        };
    }
    async getTicketWithUser(ticketId) {
        return this.db
            .select({
            ticket: selectors_1.ticketColumns,
            user: selectors_1.userColumns
        })
            .from(schema_1.tickets)
            .innerJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.tickets.userId, schema_1.users.id))
            .where((0, drizzle_orm_1.eq)(schema_1.tickets.id, ticketId))
            .limit(1)
            .then((rows) => rows[0] ?? null);
    }
    async getAdminTicket(ticketId) {
        const bundle = await this.getTicketWithUser(ticketId);
        if (!bundle) {
            return null;
        }
        const messages = await this.db
            .select(selectors_1.ticketMessageColumns)
            .from(schema_1.ticketMessages)
            .where((0, drizzle_orm_1.eq)(schema_1.ticketMessages.ticketId, bundle.ticket.id))
            .orderBy(schema_1.ticketMessages.createdAt);
        return {
            ...bundle,
            messages
        };
    }
    async claimAdminTicket(ticketId, adminUserId) {
        const now = new Date();
        const [updated] = await this.db
            .update(schema_1.tickets)
            .set((0, sanitize_1.withoutUndefined)({
            assignedAdminUserId: adminUserId,
            claimedAt: now,
            updatedAt: now
        }))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.tickets.id, ticketId), (0, drizzle_orm_1.eq)(schema_1.tickets.status, "open"), (0, drizzle_orm_1.isNull)(schema_1.tickets.assignedAdminUserId)))
            .returning();
        await this.persist();
        return updated ?? null;
    }
    async releaseAdminTicket(ticketId, adminUserId) {
        const now = new Date();
        const [updated] = await this.db
            .update(schema_1.tickets)
            .set((0, sanitize_1.withoutUndefined)({
            assignedAdminUserId: null,
            claimedAt: null,
            updatedAt: now
        }))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.tickets.id, ticketId), (0, drizzle_orm_1.eq)(schema_1.tickets.assignedAdminUserId, adminUserId)))
            .returning();
        await this.persist();
        return updated ?? null;
    }
    async isTicketAssignedToAdmin(ticketId, adminUserId) {
        const rows = await this.db
            .select({ id: schema_1.tickets.id })
            .from(schema_1.tickets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.tickets.id, ticketId), (0, drizzle_orm_1.eq)(schema_1.tickets.assignedAdminUserId, adminUserId)))
            .limit(1);
        return rows.length > 0;
    }
    async listTicketsForUser(userId) {
        return this.db
            .select(selectors_1.ticketColumns)
            .from(schema_1.tickets)
            .where((0, drizzle_orm_1.eq)(schema_1.tickets.userId, userId))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.tickets.updatedAt));
    }
    async getTicketForUser(ticketId, userId) {
        const ticketRows = await this.db
            .select(selectors_1.ticketColumns)
            .from(schema_1.tickets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.tickets.id, ticketId), (0, drizzle_orm_1.eq)(schema_1.tickets.userId, userId)))
            .limit(1);
        const ticket = ticketRows[0] ?? null;
        if (!ticket) {
            return null;
        }
        const messages = await this.db
            .select(selectors_1.ticketMessageColumns)
            .from(schema_1.ticketMessages)
            .where((0, drizzle_orm_1.eq)(schema_1.ticketMessages.ticketId, ticket.id))
            .orderBy(schema_1.ticketMessages.createdAt);
        return {
            ticket,
            messages
        };
    }
}
exports.SupportService = SupportService;
