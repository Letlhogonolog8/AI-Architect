import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, evidenceTable } from "@workspace/db";
import {
  ListEvidenceQueryParams,
  GetEvidenceParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/evidence", async (req, res): Promise<void> => {
  const query = ListEvidenceQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const conditions = [];
  if (query.data.incidentId) conditions.push(eq(evidenceTable.incidentId, query.data.incidentId));
  if (query.data.vehicleId) conditions.push(eq(evidenceTable.vehicleId, query.data.vehicleId));
  if (query.data.type) conditions.push(eq(evidenceTable.type, query.data.type));

  const items = await db
    .select()
    .from(evidenceTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(evidenceTable.capturedAt);

  res.json(items.map(toEvidenceResponse));
});

router.get("/evidence/:id", async (req, res): Promise<void> => {
  const params = GetEvidenceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [item] = await db
    .select()
    .from(evidenceTable)
    .where(eq(evidenceTable.id, params.data.id));

  if (!item) {
    res.status(404).json({ error: "Evidence not found" });
    return;
  }

  res.json(toEvidenceResponse(item));
});

function toEvidenceResponse(e: typeof evidenceTable.$inferSelect) {
  return {
    id: e.id,
    incidentId: e.incidentId,
    vehicleId: e.vehicleId,
    type: e.type,
    filename: e.filename,
    url: e.url ?? null,
    sizeBytes: e.sizeBytes ?? null,
    aiSummary: e.aiSummary ?? null,
    capturedAt: e.capturedAt.toISOString(),
    createdAt: e.createdAt.toISOString(),
  };
}

export default router;
