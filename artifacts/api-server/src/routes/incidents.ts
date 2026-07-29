import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, incidentsTable, timelineEventsTable } from "@workspace/db";
import {
  ListIncidentsQueryParams,
  CreateIncidentBody,
  GetIncidentParams,
  UpdateIncidentParams,
  UpdateIncidentBody,
  GetIncidentTimelineParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/incidents", async (req, res): Promise<void> => {
  const query = ListIncidentsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const conditions = [];
  if (query.data.status) conditions.push(eq(incidentsTable.status, query.data.status));
  if (query.data.vehicleId) conditions.push(eq(incidentsTable.vehicleId, query.data.vehicleId));
  if (query.data.severity) conditions.push(eq(incidentsTable.severity, query.data.severity));

  const incidents = await db
    .select()
    .from(incidentsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(incidentsTable.createdAt);

  res.json(incidents.map(toIncidentResponse));
});

router.post("/incidents", async (req, res): Promise<void> => {
  const parsed = CreateIncidentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [incident] = await db
    .insert(incidentsTable)
    .values({
      vehicleId: parsed.data.vehicleId,
      driverId: parsed.data.driverId ?? null,
      type: parsed.data.type,
      severity: parsed.data.severity,
      description: parsed.data.description ?? null,
      aiConfidence: parsed.data.aiConfidence ?? 0.85,
      latitude: parsed.data.latitude ?? null,
      longitude: parsed.data.longitude ?? null,
    })
    .returning();

  // Auto-create incident_created timeline event
  await db.insert(timelineEventsTable).values({
    incidentId: incident.id,
    eventType: "incident_created",
    description: `Incident reported: ${incident.type} — ${incident.severity} severity`,
    occurredAt: new Date(),
  });

  res.status(201).json(toIncidentResponse(incident));
});

router.get("/incidents/:id", async (req, res): Promise<void> => {
  const params = GetIncidentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [incident] = await db
    .select()
    .from(incidentsTable)
    .where(eq(incidentsTable.id, params.data.id));

  if (!incident) {
    res.status(404).json({ error: "Incident not found" });
    return;
  }

  res.json(toIncidentResponse(incident));
});

router.patch("/incidents/:id", async (req, res): Promise<void> => {
  const params = UpdateIncidentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateIncidentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Partial<typeof incidentsTable.$inferInsert> = {};
  const prevStatus = (
    await db.select({ status: incidentsTable.status }).from(incidentsTable).where(eq(incidentsTable.id, params.data.id))
  )[0]?.status;

  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
  if (parsed.data.severity !== undefined) updateData.severity = parsed.data.severity;
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description ?? null;
  if (parsed.data.resolvedAt !== undefined) {
    updateData.resolvedAt = parsed.data.resolvedAt ? new Date(parsed.data.resolvedAt) : null;
  }

  const [incident] = await db
    .update(incidentsTable)
    .set(updateData)
    .where(eq(incidentsTable.id, params.data.id))
    .returning();

  if (!incident) {
    res.status(404).json({ error: "Incident not found" });
    return;
  }

  // Log status change timeline event
  if (parsed.data.status && parsed.data.status !== prevStatus) {
    await db.insert(timelineEventsTable).values({
      incidentId: incident.id,
      eventType: "status_changed",
      description: `Status changed from ${prevStatus} to ${parsed.data.status}`,
      occurredAt: new Date(),
    });
  }

  res.json(toIncidentResponse(incident));
});

router.get("/incidents/:id/timeline", async (req, res): Promise<void> => {
  const params = GetIncidentTimelineParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [incident] = await db
    .select()
    .from(incidentsTable)
    .where(eq(incidentsTable.id, params.data.id));

  if (!incident) {
    res.status(404).json({ error: "Incident not found" });
    return;
  }

  const events = await db
    .select()
    .from(timelineEventsTable)
    .where(eq(timelineEventsTable.incidentId, params.data.id))
    .orderBy(timelineEventsTable.occurredAt);

  res.json(
    events.map((e) => ({
      id: e.id,
      incidentId: e.incidentId,
      eventType: e.eventType,
      description: e.description,
      occurredAt: e.occurredAt.toISOString(),
      metadata: e.metadata ?? null,
    }))
  );
});

function toIncidentResponse(i: typeof incidentsTable.$inferSelect) {
  return {
    id: i.id,
    vehicleId: i.vehicleId,
    driverId: i.driverId ?? null,
    type: i.type,
    severity: i.severity,
    status: i.status,
    description: i.description ?? null,
    aiConfidence: i.aiConfidence,
    latitude: i.latitude ?? null,
    longitude: i.longitude ?? null,
    startedAt: i.startedAt.toISOString(),
    resolvedAt: i.resolvedAt?.toISOString() ?? null,
    createdAt: i.createdAt.toISOString(),
  };
}

export default router;
