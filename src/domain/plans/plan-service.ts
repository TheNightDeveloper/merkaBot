import { and, eq } from "drizzle-orm";

import type { AppDatabase } from "../../infra/db/client";
import { planColumns } from "../../infra/db/selectors";
import { plans } from "../../infra/db/schema";

export class PlanService {
  constructor(private readonly db: AppDatabase) {}

  async listPaidPlans() {
    return this.db
      .select(planColumns)
      .from(plans)
      .where(and(eq(plans.enabled, true), eq(plans.isTrial, false)));
  }

  async getTrialPlan() {
    const rows = await this.db
      .select(planColumns)
      .from(plans)
      .where(and(eq(plans.enabled, true), eq(plans.isTrial, true)))
      .limit(1);

    return rows[0] ?? null;
  }

  async getByCode(code: string) {
    const rows = await this.db
      .select(planColumns)
      .from(plans)
      .where(eq(plans.code, code))
      .limit(1);

    return rows[0] ?? null;
  }
}
