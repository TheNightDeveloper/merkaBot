import { and, desc, eq } from "drizzle-orm";

import type { AppDatabase } from "../../infra/db/client";
import { ticketColumns, ticketMessageColumns, userColumns } from "../../infra/db/selectors";
import { withoutUndefined } from "../../infra/db/sanitize";
import { ticketMessages, tickets, users } from "../../infra/db/schema";
import { UserService } from "../users/user-service";

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

    const existingRows = await this.db
      .select(ticketColumns)
      .from(tickets)
      .where(and(eq(tickets.userId, user.id), eq(tickets.status, "open")))
      .orderBy(desc(tickets.createdAt))
      .limit(1);

    const existing = existingRows[0] ?? null;

    if (existing) {
      return existing;
    }

    const now = new Date();
    const [created] = await this.db
      .insert(tickets)
      .values(withoutUndefined({
        userId: user.id,
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
    return this.db
      .select({
        ticket: ticketColumns,
        user: userColumns
      })
      .from(tickets)
      .innerJoin(users, eq(tickets.userId, users.id))
      .where(eq(tickets.status, "open"))
      .orderBy(desc(tickets.updatedAt));
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
}
