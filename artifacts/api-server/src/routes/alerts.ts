import { Router, type IRouter } from "express";
import { eq, and, isNull, isNotNull } from "drizzle-orm";
import { db, alertsTable } from "@workspace/db";
import {
  ListAlertsQueryParams,
  AcknowledgeAlertParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/alerts", async (req, res): Promise<void> => {
  const query = ListAlertsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const conditions = [];
  if (query.data.acknowledged === true) conditions.push(isNotNull(alertsTable.acknowledgedAt));
  if (query.data.acknowledged === false) conditions.push(isNull(alertsTable.acknowledgedAt));
  if (query.data.vehicleId) conditions.push(eq(alertsTable.vehicleId, query.data.vehicleId));
  if (query.data.severity) conditions.push(eq(alertsTable.severity, query.data.severity));

  const alerts = await db
    .select()
    .from(alertsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(alertsTable.createdAt);

  res.json(alerts.map(toAlertResponse));
});

router.patch("/alerts/:id/acknowledge", async (req, res): Promise<void> => {
  const params = AcknowledgeAlertParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [alert] = await db
    .update(alertsTable)
    .set({ acknowledgedAt: new Date() })
    .where(eq(alertsTable.id, params.data.id))
    .returning();

  if (!alert) {
    res.status(404).json({ error: "Alert not found" });
    return;
  }

  res.json(toAlertResponse(alert));
});

function toAlertResponse(a: typeof alertsTable.$inferSelect) {
  return {
    id: a.id,
    vehicleId: a.vehicleId,
    incidentId: a.incidentId ?? null,
    type: a.type,
    message: a.message,
    severity: a.severity,
    createdAt: a.createdAt.toISOString(),
    acknowledgedAt: a.acknowledgedAt?.toISOString() ?? null,
  };
}

export default router;
