const db = require('../db');

const PLAN_IDS = ['low_risk', 'medium_risk', 'high_risk', 'bundle'];

function normalizePlanId(planId) {
  return planId ? planId.toString().replace('-', '_') : planId;
}

async function getAll() {
  const rows = await db.query("SELECT planId, maintenance FROM plan_maintenance");
  const maintenanceByPlan = new Map(rows.map(row => [row.planId, Number(row.maintenance) === 1]));

  return PLAN_IDS.map(planId => ({
    planId,
    maintenance: maintenanceByPlan.get(planId) || false
  }));
}

async function isInMaintenance(planId) {
  const normalizedPlanId = normalizePlanId(planId);
  const row = await db.get("SELECT maintenance FROM plan_maintenance WHERE planId = ?", [normalizedPlanId]);
  return Number(row?.maintenance || 0) === 1;
}

async function setMaintenance(planId, maintenance) {
  const normalizedPlanId = normalizePlanId(planId);
  if (!PLAN_IDS.includes(normalizedPlanId)) {
    throw new Error('Invalid plan selected');
  }

  await db.run(
    "INSERT OR REPLACE INTO plan_maintenance (planId, maintenance, updatedAt) VALUES (?, ?, CURRENT_TIMESTAMP)",
    [normalizedPlanId, maintenance ? 1 : 0]
  );

  return { planId: normalizedPlanId, maintenance: !!maintenance };
}

module.exports = {
  PLAN_IDS,
  getAll,
  isInMaintenance,
  normalizePlanId,
  setMaintenance
};
