import { Router } from "express";

// FIXME: chemins corrigés vers middlewares/config (bug pré-existant sur staging, cf. branche docker-conteuneur) — à garder ou à reverser selon ce que l'équipe décide pour l'emplacement de config/
import { checkDatabaseConnection } from "../../middlewares/config/database.js";
import { env } from "../../middlewares/config/env.js";

export const healthRouter = Router();

healthRouter.get("/", async (_request, response) => {
  try {
    await checkDatabaseConnection();

    response.status(200).json({
      status: "ok",
      service: env.serviceName,
      database: "connected",
      timestamp: new Date().toISOString()
    });
  } catch {
    response.status(503).json({
      status: "error",
      service: env.serviceName,
      database: "unavailable",
      timestamp: new Date().toISOString()
    });
  }
});
