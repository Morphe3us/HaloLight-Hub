import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import notificationsRouter from "./notifications";
import onboardingRouter from "./onboarding";
import academyRouter from "./academy";
import eventsRouter from "./events";
import dashboardRouter from "./dashboard";
import leadsRouter from "./leads";
import quotesRouter from "./quotes";
import contractsRouter from "./contracts";
import invoicesRouter from "./invoices";
import supportRouter from "./support";
import kbRouter from "./kb";
import aiRouter from "./ai";
import communityRouter from "./community";

const router: IRouter = Router();

router.use(healthRouter);
router.use(usersRouter);
router.use(notificationsRouter);
router.use(onboardingRouter);
router.use(academyRouter);
router.use(eventsRouter);
router.use(dashboardRouter);
router.use(leadsRouter);
router.use(quotesRouter);
router.use(contractsRouter);
router.use(invoicesRouter);
router.use(supportRouter);
router.use(kbRouter);
router.use(aiRouter);
router.use(communityRouter);

export default router;
