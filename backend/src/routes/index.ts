import { Router } from "express";

// FIXME: chemin corrigé vers middlewares/config (bug pré-existant sur staging, cf. branche docker-conteuneur) — à garder ou à reverser selon ce que l'équipe décide pour l'emplacement de config/
import { swaggerRouter } from "../docs/swagger.routes.js";
import { env } from "../middlewares/config/env.js";
import { authRouter } from "../modules/auth/auth.routes.js";
import { requireAuth } from "../modules/auth/auth.js";
import { childrenRouter } from "../modules/children/children.routes.js";
import { referencesRouter } from "../modules/references/references.routes.js";
import { reportsRouter } from "../modules/reports/reports.routes.js";
import { daycaresRouter } from "../modules/daycares/daycares.routes.js";
import { diaperChangesRouter } from "../modules/diaper-changes/diaper-changes.routes.js";
import { healthRouter } from "../modules/health/health.routes.js";
import { moodsRouter } from "../modules/moods/moods.routes.js";
import { napsRouter } from "../modules/naps/naps.routes.js";
import { notificationsRouter } from "../modules/notifications/notifications.routes.js";
import { usersRouter } from "../modules/users/users.routes.js";
import { conversationsRouter, messageNotificationsRouter } from "../modules/messaging/messaging.routes.js";

export const apiRouter = Router();

apiRouter.get("/", (_request, response) => {
  response.status(200).json({
    name: env.serviceName,
    version: "0.1.0"
  });
});

apiRouter.use("/docs", swaggerRouter);
apiRouter.use("/health", healthRouter);

if (env.serviceName === "carelia-users-api" || env.serviceName === "carelia-api") {
  apiRouter.use("/auth", authRouter);
  apiRouter.use("/children", requireAuth, childrenRouter);
  apiRouter.use("/reports", requireAuth, reportsRouter);
  apiRouter.use("/references", requireAuth, referencesRouter);
  apiRouter.use("/notifications", requireAuth, notificationsRouter);
  apiRouter.use("/conversations", requireAuth, conversationsRouter);
  apiRouter.use("/message-notifications", requireAuth, messageNotificationsRouter);
  apiRouter.use("/users", requireAuth);
  apiRouter.use("/users", usersRouter);
}

if (env.serviceName === "carelia-daycares-api" || env.serviceName === "carelia-api") {
  apiRouter.use("/daycares", requireAuth);
  apiRouter.use("/daycares", daycaresRouter);
}

if (env.serviceName === "carelia-diaper-changes-api" || env.serviceName === "carelia-api") {
  apiRouter.use("/diaper-changes", requireAuth);
  apiRouter.use("/diaper-changes", diaperChangesRouter);
}

if (env.serviceName === "carelia-moods-api" || env.serviceName === "carelia-api") {
  apiRouter.use("/moods", requireAuth);
  apiRouter.use("/moods", moodsRouter);
}

if (env.serviceName === "carelia-naps-api" || env.serviceName === "carelia-api") {
  apiRouter.use("/naps", requireAuth);
  apiRouter.use("/naps", napsRouter);
}
