import { Router } from "express";

import { AppError } from "../../errors/app-error.js";
import { actorOf, requireReportAccess } from "../auth/auth.js";
import { mutateDraft } from "../shared/legacy-access.js";
import {
  asyncHandler, optionalPositiveInteger, optionalString, optionalTime, parseId,
  readObject, rejectUnknownFields, requiredPositiveInteger, requiredTime
} from "../shared/http-utils.js";
import {
  createMoodObservation, deleteMoodObservation, findMoodObservationById,
  listMoodObservations, updateMoodObservation, type CreateMoodObservationInput,
  type UpdateMoodObservationInput
} from "./moods.repository.js";

const fields = ["dailyReportId", "moodId", "observedTime", "comment"];

function createInput(body: Record<string, unknown>): CreateMoodObservationInput {
  rejectUnknownFields(body, fields);
  return {
    dailyReportId: requiredPositiveInteger(body, "dailyReportId"),
    moodId: requiredPositiveInteger(body, "moodId"),
    observedTime: requiredTime(body, "observedTime"),
    comment: optionalString(body, "comment", 65_535, true) ?? null
  };
}

function updateInput(body: Record<string, unknown>): UpdateMoodObservationInput {
  rejectUnknownFields(body, fields);
  if (Object.keys(body).length === 0) throw new AppError("Au moins une valeur doit être fournie.", 400);
  const input: UpdateMoodObservationInput = {};
  const dailyReportId = optionalPositiveInteger(body, "dailyReportId");
  const moodId = optionalPositiveInteger(body, "moodId");
  const observedTime = optionalTime(body, "observedTime");
  const comment = optionalString(body, "comment", 65_535, true);
  if (dailyReportId !== undefined) input.dailyReportId = dailyReportId;
  if (moodId !== undefined) input.moodId = moodId;
  if (observedTime !== undefined) input.observedTime = observedTime;
  if (comment !== undefined) input.comment = comment;
  return input;
}

export const moodsRouter = Router();
moodsRouter.get("/", asyncHandler(async (_request, response) => {
  response.status(200).json(await listMoodObservations(actorOf(response.locals)));
}));
moodsRouter.get("/:id", asyncHandler(async (request, response) => {
  const observation = await findMoodObservationById(parseId(request.params.id));
  if (!observation) throw new AppError("Observation d'humeur introuvable.", 404);
  await requireReportAccess(actorOf(response.locals), observation.dailyReportId);
  response.status(200).json(observation);
}));
moodsRouter.post("/", asyncHandler(async (request, response) => {
  const input = createInput(readObject(request.body));
  response.status(201).json(await mutateDraft(actorOf(response.locals), input.dailyReportId,
    (connection) => createMoodObservation(input, connection)));
}));
moodsRouter.patch("/:id", asyncHandler(async (request, response) => {
  const id = parseId(request.params.id);
  const current = await findMoodObservationById(id);
  if (!current) throw new AppError("Observation d'humeur introuvable.", 404);
  const input = updateInput(readObject(request.body));
  const observation = await mutateDraft(actorOf(response.locals), current.dailyReportId,
    (connection) => updateMoodObservation(id, input, connection), input.dailyReportId);
  response.status(200).json(observation);
}));
moodsRouter.delete("/:id", asyncHandler(async (request, response) => {
  const current = await findMoodObservationById(parseId(request.params.id));
  if (!current) throw new AppError("Observation d'humeur introuvable.", 404);
  await mutateDraft(actorOf(response.locals), current.dailyReportId,
    (connection) => deleteMoodObservation(parseId(request.params.id), connection));
  response.status(204).send();
}));
