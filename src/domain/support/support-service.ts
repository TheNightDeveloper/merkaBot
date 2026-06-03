import { and, desc, eq, isNull } from "drizzle-orm";

import type { AppDatabase } from "../../infra/db/client";
import { ticketColumns, ticketMessageColumns, userColumns } from "../../infra/db/selectors";
import { withoutUndefined } from "../../infra/db/sanitize";
import { ticketMessages, tickets, users } from "../../infra/db/schema";
import { UserService } from "../users/user-service";

export type AdminTicketScope = "unclaimed" | "mine" | "all";

export class SupportService {
  constructor(
    private readonly db: AppDatabase,
    private readonly userService: UserService,
    private readonly persist: () => Promise<void>
  ) {}

  async getOrCreateOpenTicket(telegramId: number) {
    const user = await this.userService.getByTelegramId(telegramId);

    if (!user) {
      throw new Error("User not found.");
    }

    return this.getOrCreateOpenTicketForUserId(user.id);
  }

  async getOrCreateOpenTicketForUserId(userId: number) {
    const now = new Date();

    const existingRows = await this.db
      .select(ticketColumns)
      .from(tickets)
      .where(and(eq(tickets.userId, userId), eq(tickets.status, "open")))
      .orderBy(desc(tickets.createdAt))
      .limit(1);

    const existing = existingRows[0] ?? null;

    if (existing) {
      return existing;
    }

    const [created] = await this.db
      .insert(tickets)
      .values(withoutUndefined({
        userId,
        status: "open",
        createdAt: now,
        updatedAt: now
      }))
      .returning();
    await this.persist();

    return created;
  }

  async addUserMessage(ticketId: number, userId: number, body: string) {
    const now = new Date();
    const [created] = await this.db
      .insert(ticketMessages)
      .values(withoutUndefined({
        ticketId,
        senderUserId: userId,
        senderAdminId: null,
        body,
        createdAt: now
      }))
      .returning();

    await this.db
      .update(tickets)
      .set(withoutUndefined({
        updatedAt: now
      }))
      .where(eq(tickets.id, ticketId));
    await this.persist();

    return created;
  }

  async addAdminReply(ticketId: number, adminTelegramId: number, body: string) {
    const now = new Date();
    const [created] = await this.db
      .insert(ticketMessages)
      .values(withoutUndefined({
        ticketId,
        senderUserId: null,
        senderAdminId: adminTelegramId,
        body,
        createdAt: now
      }))
      .returning();

    await this.db
      .update(tickets)
      .set(withoutUndefined({
        updatedAt: now
      }))
      .where(eq(tickets.id, ticketId));
    await this.persist();

    return created;
  }

  async closeTicket(ticketId: number) {
    const now = new Date();
    const [updated] = await this.db
      .update(tickets)
      .set(withoutUndefined({
        status: "closed",
        updatedAt: now,
        closedAt: now
      }))
      .where(eq(tickets.id, ticketId))
      .returning();
    await this.persist();

    return updated;
  }

  async listOpenTickets() {
    return this.listAdminTickets("all", 0);
  }

  async listAdminTickets(scope: AdminTicketScope, adminUserId: number) {
    const filters = [eq(tickets.status, "open")];

    if (scope === "unclaimed") {
      filters.push(isNull(tickets.assignedAdminUserId));
    } else if (scope === "mine") {
      filters.push(eq(tickets.assignedAdminUserId, adminUserId));
    }

    return this.db
      .select({
        ticket: ticketColumns,
        user: userColumns
      })
      .from(tickets)
      .innerJoin(users, eq(tickets.userId, users.id))
      .where(and(...filters))
      .orderBy(desc(tickets.updatedAt));
  }

  async countAdminQueues(adminUserId: number) {
    const all = await this.listAdminTickets("all", adminUserId);

    return {
      total: all.length,
      mine: all.filter((item) => item.ticket.assignedAdminUserId === adminUserId).length,
      unclaimed: all.filter((item) => item.ticket.assignedAdminUserId === null).length
    };
  }

  async getTicketWithUser(ticketId: number) {
    return this.db
      .select({
        ticket: ticketColumns,
        user: userColumns
      })
      .from(tickets)
      .innerJoin(users, eq(tickets.userId, users.id))
      .where(eq(tickets.id, ticketId))
      .limit(1)
      .then((rows) => rows[0] ?? null);
  }

  async getAdminTicket(ticketId: number) {
    const bundle = await this.getTicketWithUser(ticketId);

    if (!bundle) {
      return null;
    }

    const messages = await this.db
      .select(ticketMessageColumns)
      .from(ticketMessages)
      .where(eq(ticketMessages.ticketId, bundle.ticket.id))
      .orderBy(ticketMessages.createdAt);

    return {
      ...bundle,
      messages
    };
  }

  async claimAdminTicket(ticketId: number, adminUserId: number) {
    const now = new Date();
    const [updated] = await this.db
      .update(tickets)
      .set(withoutUndefined({
        assignedAdminUserId: adminUserId,
        claimedAt: now,
        updatedAt: now
      }))
      .where(and(eq(tickets.id, ticketId), eq(tickets.status, "open"), isNull(tickets.assignedAdminUserId)))
      .returning();
    await this.persist();

    return updated ?? null;
  }

  async releaseAdminTicket(ticketId: number, adminUserId: number) {
    const now = new Date();
    const [updated] = await this.db
      .update(tickets)
      .set(withoutUndefined({
        assignedAdminUserId: null,
        claimedAt: null,
        updatedAt: now
      }))
      .where(and(eq(tickets.id, ticketId), eq(tickets.assignedAdminUserId, adminUserId)))
      .returning();
    await this.persist();

    return updated ?? null;
  }

  async isTicketAssignedToAdmin(ticketId: number, adminUserId: number) {
    const rows = await this.db
      .select({ id: tickets.id })
      .from(tickets)
      .where(and(eq(tickets.id, ticketId), eq(tickets.assignedAdminUserId, adminUserId)))
      .limit(1);

    return rows.length > 0;
  }

  async listTicketsForUser(userId: number) {
    return this.db
      .select(ticketColumns)
      .from(tickets)
      .where(eq(tickets.userId, userId))
      .orderBy(desc(tickets.updatedAt));
  }

  async getTicketForUser(ticketId: number, userId: number) {
    const ticketRows = await this.db
      .select(ticketColumns)
      .from(tickets)
      .where(and(eq(tickets.id, ticketId), eq(tickets.userId, userId)))
      .limit(1);

    const ticket = ticketRows[0] ?? null;

    if (!ticket) {
      return null;
    }

    const messages = await this.db
      .select(ticketMessageColumns)
      .from(ticketMessages)
      .where(eq(ticketMessages.ticketId, ticket.id))
      .orderBy(ticketMessages.createdAt);

    return {
      ticket,
      messages
    };
  }
}
