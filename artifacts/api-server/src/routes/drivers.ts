import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, driversTable } from "@workspace/db";
import {
  CreateDriverBody,
  GetDriverParams,
  UpdateDriverParams,
  UpdateDriverBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/drivers", async (_req, res): Promise<void> => {
  const drivers = await db
    .select()
    .from(driversTable)
    .orderBy(driversTable.createdAt);
  res.json(drivers.map(toDriverResponse));
});

router.post("/drivers", async (req, res): Promise<void> => {
  const parsed = CreateDriverBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [driver] = await db
    .insert(driversTable)
    .values({
      name: parsed.data.name,
      phone: parsed.data.phone,
      email: parsed.data.email ?? null,
    })
    .returning();

  res.status(201).json(toDriverResponse(driver));
});

router.get("/drivers/:id", async (req, res): Promise<void> => {
  const params = GetDriverParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [driver] = await db
    .select()
    .from(driversTable)
    .where(eq(driversTable.id, params.data.id));

  if (!driver) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }

  res.json(toDriverResponse(driver));
});

router.patch("/drivers/:id", async (req, res): Promise<void> => {
  const params = UpdateDriverParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateDriverBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Partial<typeof driversTable.$inferInsert> = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.phone !== undefined) updateData.phone = parsed.data.phone;
  if (parsed.data.email !== undefined) updateData.email = parsed.data.email ?? null;
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
  if (parsed.data.behaviorScore !== undefined) updateData.behaviorScore = parsed.data.behaviorScore;

  const [driver] = await db
    .update(driversTable)
    .set(updateData)
    .where(eq(driversTable.id, params.data.id))
    .returning();

  if (!driver) {
    res.status(404).json({ error: "Driver not found" });
    return;
  }

  res.json(toDriverResponse(driver));
});

function toDriverResponse(d: typeof driversTable.$inferSelect) {
  return {
    id: d.id,
    name: d.name,
    phone: d.phone,
    email: d.email ?? null,
    status: d.status,
    behaviorScore: d.behaviorScore,
    createdAt: d.createdAt.toISOString(),
  };
}

export default router;
