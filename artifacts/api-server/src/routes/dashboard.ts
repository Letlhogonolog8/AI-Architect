import { Router, type IRouter } from "express";
import { eq, isNull, and, or, desc } from "drizzle-orm";
import { db, vehiclesTable, incidentsTable, alertsTable } from "@workspace/db";
import { GetRecentActivityQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const [vehicles, incidents, alerts] = await Promise.all([
    db.select().from(vehiclesTable),
    db.select().from(incidentsTable),
    db.select().from(alertsTable),
  ]);

  const activeIncidents = incidents.filter((i) => i.status === "active" || i.status === "investigating");
  const unresolvedAlerts = alerts.filter((a) => !a.acknowledgedAt);
  const criticalAlerts = alerts.filter((a) => !a.acknowledgedAt && a.severity === "critical");

  const threatLevelAvg =
    vehicles.length > 0
      ? vehicles.reduce((sum, v) => sum + v.threatLevel, 0) / vehicles.length
      : 0;

  const vehiclesByStatus = {
    safe: vehicles.filter((v) => v.status === "safe").length,
    alert: vehicles.filter((v) => v.status === "alert").length,
    emergency: vehicles.filter((v) => v.status === "emergency").length,
    offline: vehicles.filter((v) => v.status === "offline").length,
  };

  const incidentsBySeverity = {
    low: activeIncidents.filter((i) => i.severity === "low").length,
    medium: activeIncidents.filter((i) => i.severity === "medium").length,
    high: activeIncidents.filter((i) => i.severity === "high").length,
    critical: activeIncidents.filter((i) => i.severity === "critical").length,
  };

  res.json({
    totalVehicles: vehicles.length,
    activeIncidents: activeIncidents.length,
    unresolvedAlerts: unresolvedAlerts.length,
    criticalAlerts: criticalAlerts.length,
    threatLevelAvg: Math.round(threatLevelAvg * 10) / 10,
    vehiclesByStatus,
    incidentsBySeverity,
  });
});

router.get("/dashboard/recent-activity", async (req, res): Promise<void> => {
  const query = GetRecentActivityQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const limit = query.data.limit ?? 20;

  const [recentIncidents, recentAlerts, allVehicles] = await Promise.all([
    db
      .select()
      .from(incidentsTable)
      .orderBy(desc(incidentsTable.createdAt))
      .limit(limit),
    db
      .select()
      .from(alertsTable)
      .orderBy(desc(alertsTable.createdAt))
      .limit(limit),
    db.select().from(vehiclesTable),
  ]);

  const vehicleMap = new Map(allVehicles.map((v) => [v.id, v.name]));

  const items: Array<{
    id: number;
    kind: "incident" | "alert";
    title: string;
    severity: string;
    vehicleId: number;
    vehicleName: string;
    timestamp: string;
  }> = [];

  for (const i of recentIncidents) {
    items.push({
      id: i.id,
      kind: "incident",
      title: `${capitalize(i.type.replace("_", " "))} — ${i.status}`,
      severity: i.severity,
      vehicleId: i.vehicleId,
      vehicleName: vehicleMap.get(i.vehicleId) ?? "Unknown Vehicle",
      timestamp: i.createdAt.toISOString(),
    });
  }

  for (const a of recentAlerts) {
    items.push({
      id: a.id,
      kind: "alert",
      title: a.message,
      severity: a.severity,
      vehicleId: a.vehicleId,
      vehicleName: vehicleMap.get(a.vehicleId) ?? "Unknown Vehicle",
      timestamp: a.createdAt.toISOString(),
    });
  }

  // Sort combined by timestamp descending and take the top N
  items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  res.json(items.slice(0, limit));
});

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default router;
