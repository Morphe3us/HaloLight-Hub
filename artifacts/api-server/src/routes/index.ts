import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import notificationsRouter from "./notifications";
import onboardingRouter from "./onboarding";

const router: IRouter = Router();

router.use(healthRouter);
router.use(usersRouter);
router.use(notificationsRouter);
router.use(onboardingRouter);

export default router;
