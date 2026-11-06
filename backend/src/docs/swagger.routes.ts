import { Router } from "express";
import swaggerUi from "swagger-ui-express";

import { env } from "../middlewares/config/env.js";
import { openApiDocument } from "./openapi.js";

export const swaggerRouter = Router();

const servicePaths: Record<string, string[]> = {
  "carelia-users-api": ["/api/auth", "/api/users", "/api/children", "/api/reports", "/api/references", "/api/notifications", "/api/conversations", "/api/message-notifications"],
  "carelia-daycares-api": ["/api/daycares"],
  "carelia-diaper-changes-api": ["/api/diaper-changes"],
  "carelia-moods-api": ["/api/moods"],
  "carelia-naps-api": ["/api/naps"]
};
const allowed = servicePaths[env.serviceName];
const document = allowed ? {
  ...openApiDocument,
  paths: Object.fromEntries(Object.entries(openApiDocument.paths).filter(([path]) =>
    path === "/api" || path === "/api/health" || path.startsWith("/api/docs") ||
    allowed.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))))
} : openApiDocument;

swaggerRouter.get("/openapi.json", (_request, response) => {
  response.status(200).json(document);
});

swaggerRouter.use("/", swaggerUi.serve);
swaggerRouter.get(
  "/",
  swaggerUi.setup(document, {
    customSiteTitle: "Carelia API - Swagger",
    swaggerOptions: {
      url: "/api/docs/openapi.json",
      withCredentials: true
    }
  })
);
