import { Router } from "express";

import { AppError } from "../../errors/app-error.js";
import { actorOf, requireDaycare, requireRole } from "../auth/auth.js";
import {
  asyncHandler,
  parseId,
  readObject,
  rejectUnknownFields,
  requiredString
} from "../shared/http-utils.js";
import {
  findDaycareById,
  listDaycares,
  updateDaycare
} from "./daycares.repository.js";

export const daycaresRouter = Router();

daycaresRouter.get("/", asyncHandler(async (_request, response) => {
  const actor = actorOf(response.locals);
  response.status(200).json((await listDaycares()).filter((daycare) => daycare.daycareId === actor.daycareId));
}));

daycaresRouter.get("/:id", asyncHandler(async (request, response) => {
  requireDaycare(actorOf(response.locals), parseId(request.params.id));
  const daycare = await findDaycareById(parseId(request.params.id));
  if (!daycare) throw new AppError("Crèche introuvable.", 404);
  response.status(200).json(daycare);
}));

daycaresRouter.post("/", asyncHandler(async (request, response) => {
  requireRole(actorOf(response.locals), "DAYCARE_ADMIN");
  throw new AppError("La création d'une autre crèche nécessite un administrateur plateforme.", 403);
}));

daycaresRouter.patch("/:id", asyncHandler(async (request, response) => {
  const actor = actorOf(response.locals);
  requireRole(actor, "DAYCARE_ADMIN");
  requireDaycare(actor, parseId(request.params.id));
  const body = readObject(request.body);
  rejectUnknownFields(body, ["name"]);
  const daycare = await updateDaycare(parseId(request.params.id), {
    name: requiredString(body, "name", 150)
  });
  if (!daycare) throw new AppError("Crèche introuvable.", 404);
  response.status(200).json(daycare);
}));

daycaresRouter.delete("/:id", asyncHandler(async (request, response) => {
  requireRole(actorOf(response.locals), "DAYCARE_ADMIN");
  requireDaycare(actorOf(response.locals), parseId(request.params.id));
  throw new AppError("La crèche du compte courant ne peut pas être supprimée.", 409);
}));
