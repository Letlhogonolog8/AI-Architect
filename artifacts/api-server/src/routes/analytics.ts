import { Router, type IRouter } from "express";
import { desc, sql } from "drizzle-orm";
import { db, incidentsTable, vehiclesTable } from "@workspace/db";
import { GetThreatTrendsQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/analytics/threat-trends", async (req, res): Promise<void> => {
  const query = GetThreatTrendsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const days = query.data.days ?? 30;

  // Get all incidents from the last N days
  const incidents = await db
    .select()
    .from(incidentsTable)
    .where(
      sql`${incidentsTable.startedAt} >= NOW() - INTERVAL '${sql.raw(String(days))} days'`
    )
    .orderBy(incidentsTable.startedAt);

  // Build a map of date → incident type counts
  const dateMap = new Map<string, {
    hijacking: number;
    theft_attempt: number;
    coercion: number;
    kidnapping: number;
    suspicious_activity: number;
    sos_triggered: number;
  }>();

  // Seed dates for the range
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateKey = d.toISOString().slice(0, 10);
    dateMap.set(dateKey, {
      hijacking: 0,
      theft_attempt: 0,
      coercion: 0,
      kidnapping: 0,
      suspicious_activity: 0,
      sos_triggered: 0,
    });
  }

  for (const inc of incidents) {
    const dateKey = inc.startedAt.toISOString().slice(0, 10);
    const entry = dateMap.get(dateKey);
    if (entry && inc.type in entry) {
      (entry as Record<string, number>)[inc.type] = ((entry as Record<string, number>)[inc.type] ?? 0) + 1;
    }
  }

  const result = Array.from(dateMap.entries()).map(([date, counts]) => ({
    date,
    ...counts,
  }));

  res.json(result);
});

router.get("/analytics/vehicle-risk", async (_req, res): Promise<void> => {
  const [vehicles, incidents] = await Promise.all([
    db.select().from(vehiclesTable),
    db.select().from(incidentsTable),
  ]);

  const incidentsByVehicle = new Map<number, { count: number; lastAt: Date | null }>();
  for (const inc of incidents) {
    const existing = incidentsByVehicle.get(inc.vehicleId);
    if (!existing) {
      incidentsByVehicle.set(inc.vehicleId, { count: 1, lastAt: inc.createdAt });
    } else {
      existing.count += 1;
      if (!existing.lastAt || inc.createdAt > existing.lastAt) {
        existing.lastAt = inc.createdAt;
      }
    }
  }

  const result = vehicles.map((v) => {
    const vehicleIncidents = incidentsByVehicle.get(v.id);
    const incidentCount = vehicleIncidents?.count ?? 0;
    // Risk score: blend threat level with incident history (max 100)
    const riskScore = Math.min(100, Math.round(v.threatLevel * 0.7 + incidentCount * 3));
    return {
      vehicleId: v.id,
      vehicleName: v.name,
      licensePlate: v.licensePlate,
      riskScore,
      incidentCount,
      lastIncidentAt: vehicleIncidents?.lastAt?.toISOString() ?? null,
    };
  });

  // Sort by risk descending
  result.sort((a, b) => b.riskScore - a.riskScore);

  res.json(result);
});

export default router;
