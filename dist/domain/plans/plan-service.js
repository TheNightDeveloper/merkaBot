"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanService = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const selectors_1 = require("../../infra/db/selectors");
const schema_1 = require("../../infra/db/schema");
class PlanService {
    db;
    constructor(db) {
        this.db = db;
    }
    async listPaidPlans() {
        return this.db
            .select(selectors_1.planColumns)
            .from(schema_1.plans)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.plans.enabled, true), (0, drizzle_orm_1.eq)(schema_1.plans.isTrial, false)));
    }
    async getTrialPlan() {
        const rows = await this.db
            .select(selectors_1.planColumns)
            .from(schema_1.plans)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.plans.enabled, true), (0, drizzle_orm_1.eq)(schema_1.plans.isTrial, true)))
            .limit(1);
        return rows[0] ?? null;
    }
    async getByCode(code) {
        const rows = await this.db
            .select(selectors_1.planColumns)
            .from(schema_1.plans)
            .where((0, drizzle_orm_1.eq)(schema_1.plans.code, code))
            .limit(1);
        return rows[0] ?? null;
    }
}
exports.PlanService = PlanService;
