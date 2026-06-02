"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserService = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const sanitize_1 = require("../../infra/db/sanitize");
const selectors_1 = require("../../infra/db/selectors");
const schema_1 = require("../../infra/db/schema");
class UserService {
    db;
    adminIds;
    persist;
    constructor(db, adminIds, persist) {
        this.db = db;
        this.adminIds = adminIds;
        this.persist = persist;
    }
    async ensureUser(profile) {
        const existing = await this.getByTelegramId(profile.telegramId);
        const now = new Date();
        const isAdmin = this.adminIds.includes(profile.telegramId);
        if (existing) {
            await this.db
                .update(schema_1.users)
                .set((0, sanitize_1.withoutUndefined)({
                username: profile.username ?? null,
                displayName: profile.displayName,
                isAdmin
            }))
                .where((0, drizzle_orm_1.eq)(schema_1.users.id, existing.id));
            await this.persist();
            return {
                ...existing,
                username: profile.username ?? null,
                displayName: profile.displayName,
                isAdmin
            };
        }
        const [created] = await this.db
            .insert(schema_1.users)
            .values((0, sanitize_1.withoutUndefined)({
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
    async getByTelegramId(telegramId) {
        const rows = await this.db
            .select(selectors_1.userColumns)
            .from(schema_1.users)
            .where((0, drizzle_orm_1.eq)(schema_1.users.telegramId, telegramId))
            .limit(1);
        return rows[0] ?? null;
    }
    async getById(userId) {
        const rows = await this.db
            .select(selectors_1.userColumns)
            .from(schema_1.users)
            .where((0, drizzle_orm_1.eq)(schema_1.users.id, userId))
            .limit(1);
        return rows[0] ?? null;
    }
    async markTrialUsed(userId) {
        await this.db
            .update(schema_1.users)
            .set({ trialUsed: true })
            .where((0, drizzle_orm_1.eq)(schema_1.users.id, userId));
        await this.persist();
    }
    async isAdminTelegramId(telegramId) {
        const user = await this.getByTelegramId(telegramId);
        return Boolean(user?.isAdmin || this.adminIds.includes(telegramId));
    }
}
exports.UserService = UserService;
