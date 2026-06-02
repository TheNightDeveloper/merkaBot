import { eq } from "drizzle-orm";

import type { AppDatabase } from "../../infra/db/client";
import { withoutUndefined } from "../../infra/db/sanitize";
import { userColumns } from "../../infra/db/selectors";
import { users } from "../../infra/db/schema";

export type TelegramProfile = {
  telegramId: number;
  username?: string;
  displayName: string;
};

export class UserService {
  constructor(
    private readonly db: AppDatabase,
    private readonly adminIds: number[],
    private readonly persist: () => Promise<void>
  ) {}

  async ensureUser(profile: TelegramProfile) {
    const existing = await this.getByTelegramId(profile.telegramId);
    const now = new Date();
    const isAdmin = this.adminIds.includes(profile.telegramId);

    if (existing) {
      await this.db
        .update(users)
        .set(withoutUndefined({
          username: profile.username ?? null,
          displayName: profile.displayName,
          isAdmin
        }))
        .where(eq(users.id, existing.id));
      await this.persist();

      return {
        ...existing,
        username: profile.username ?? null,
        displayName: profile.displayName,
        isAdmin
      };
    }

    const [created] = await this.db
      .insert(users)
      .values(withoutUndefined({
        telegramId: profile.telegramId,
        username: profile.username ?? null,
        displayName: profile.displayName,
        isAdmin,
        createdAt: now
      }))
      .returning();
    await this.persist();

    return created;
  }

  async getByTelegramId(telegramId: number) {
    const rows = await this.db
      .select(userColumns)
      .from(users)
      .where(eq(users.telegramId, telegramId))
      .limit(1);

    return rows[0] ?? null;
  }

  async getById(userId: number) {
    const rows = await this.db
      .select(userColumns)
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return rows[0] ?? null;
  }

  async markTrialUsed(userId: number): Promise<void> {
    await this.db
      .update(users)
      .set({ trialUsed: true })
      .where(eq(users.id, userId));
    await this.persist();
  }

  async isAdminTelegramId(telegramId: number): Promise<boolean> {
    const user = await this.getByTelegramId(telegramId);
    return Boolean(user?.isAdmin || this.adminIds.includes(telegramId));
  }
}
