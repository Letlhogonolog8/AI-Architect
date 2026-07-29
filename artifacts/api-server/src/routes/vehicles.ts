import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, vehiclesTable } from "@workspace/db";
import {
  ListVehiclesQueryParams,
  CreateVehicleBody,
  GetVehicleParams,
  UpdateVehicleParams,
  UpdateVehicleBody,
  DeleteVehicleParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/vehicles", async (req, res): Promise<void> => {
  const query = ListVehiclesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  let q = db.select().from(vehiclesTable).$dynamic();
  if (query.data.status) {
    q = q.where(eq(vehiclesTable.status, query.data.status));
  }

  const vehicles = await q.orderBy(vehiclesTable.createdAt);
  res.json(vehicles.map(toVehicleResponse));
});

router.post("/vehicles", async (req, res): Promise<void> => {
  const parsed = CreateVehicleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [vehicle] = await db
    .insert(vehiclesTable)
    .values({
      name: parsed.data.name,
      make: parsed.data.make,
      model: parsed.data.model,
      year: parsed.data.year,
      licensePlate: parsed.data.licensePlate,
      driverId: parsed.data.driverId ?? null,
    })
    .returning();

  res.status(201).json(toVehicleResponse(vehicle));
});

router.get("/vehicles/:id", async (req, res): Promise<void> => {
  const params = GetVehicleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [vehicle] = await db
    .select()
    .from(vehiclesTable)
    .where(eq(vehiclesTable.id, params.data.id));

  if (!vehicle) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }

  res.json(toVehicleResponse(vehicle));
});

router.patch("/vehicles/:id", async (req, res): Promise<void> => {
  const params = UpdateVehicleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateVehicleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Partial<typeof vehiclesTable.$inferInsert> = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.make !== undefined) updateData.make = parsed.data.make;
  if (parsed.data.model !== undefined) updateData.model = parsed.data.model;
  if (parsed.data.year !== undefined) updateData.year = parsed.data.year;
  if (parsed.data.licensePlate !== undefined) updateData.licensePlate = parsed.data.licensePlate;
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
  if (parsed.data.threatLevel !== undefined) updateData.threatLevel = parsed.data.threatLevel;
  if (parsed.data.driverId !== undefined) updateData.driverId = parsed.data.driverId ?? null;
  if (parsed.data.locationLat !== undefined) updateData.locationLat = parsed.data.locationLat ?? null;
  if (parsed.data.locationLng !== undefined) updateData.locationLng = parsed.data.locationLng ?? null;
  if (parsed.data.lastSeenAt !== undefined) {
    updateData.lastSeenAt = parsed.data.lastSeenAt ? new Date(parsed.data.lastSeenAt) : null;
  }

  const [vehicle] = await db
    .update(vehiclesTable)
    .set(updateData)
    .where(eq(vehiclesTable.id, params.data.id))
    .returning();

  if (!vehicle) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }

  res.json(toVehicleResponse(vehicle));
});

router.delete("/vehicles/:id", async (req, res): Promise<void> => {
  const params = DeleteVehicleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [vehicle] = await db
    .delete(vehiclesTable)
    .where(eq(vehiclesTable.id, params.data.id))
    .returning();

  if (!vehicle) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }

  res.sendStatus(204);
});

function toVehicleResponse(v: typeof vehiclesTable.$inferSelect) {
  return {
    id: v.id,
    name: v.name,
    make: v.make,
    model: v.model,
    year: v.year,
    licensePlate: v.licensePlate,
    status: v.status,
    threatLevel: v.threatLevel,
    driverId: v.driverId ?? null,
    locationLat: v.locationLat ?? null,
    locationLng: v.locationLng ?? null,
    lastSeenAt: v.lastSeenAt?.toISOString() ?? null,
    createdAt: v.createdAt.toISOString(),
  };
}

export default router;
