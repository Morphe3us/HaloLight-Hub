import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import notificationsRouter from "./notifications";
import onboardingRouter from "./onboarding";
import academyRouter from "./academy";
import eventsRouter from "./events";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(usersRouter);
router.use(notificationsRouter);
router.use(onboardingRouter);
router.use(academyRouter);
router.use(eventsRouter);
router.use(dashboardRouter);

export default router;
