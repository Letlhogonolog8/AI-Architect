import { Router, type IRouter } from "express";
import healthRouter from "./health";
import vehiclesRouter from "./vehicles";
import driversRouter from "./drivers";
import incidentsRouter from "./incidents";
import alertsRouter from "./alerts";
import evidenceRouter from "./evidence";
import dashboardRouter from "./dashboard";
import analyticsRouter from "./analytics";

const router: IRouter = Router();

router.use(healthRouter);
router.use(vehiclesRouter);
router.use(driversRouter);
router.use(incidentsRouter);
router.use(alertsRouter);
router.use(evidenceRouter);
router.use(dashboardRouter);
router.use(analyticsRouter);

export default router;
