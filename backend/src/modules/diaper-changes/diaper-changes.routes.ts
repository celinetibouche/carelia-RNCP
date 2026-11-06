import { Router } from "express";

import { AppError } from "../../errors/app-error.js";
import { actorOf, requireReportAccess } from "../auth/auth.js";
import { mutateDraft } from "../shared/legacy-access.js";
import {
  asyncHandler, optionalPositiveInteger, optionalString, optionalTime, parseId,
  readObject, rejectUnknownFields, requiredPositiveInteger, requiredTime
} from "../shared/http-utils.js";
import {
  createDiaperChange, deleteDiaperChange, findDiaperChangeById, listDiaperChanges,
  updateDiaperChange, type CreateDiaperChangeInput, type UpdateDiaperChangeInput
} from "./diaper-changes.repository.js";

const fields = ["dailyReportId", "diaperChangeTypeId", "changeTime", "comment"];

function createInput(body: Record<string, unknown>): CreateDiaperChangeInput {
  rejectUnknownFields(body, fields);
  return {
    dailyReportId: requiredPositiveInteger(body, "dailyReportId"),
    diaperChangeTypeId: requiredPositiveInteger(body, "diaperChangeTypeId"),
    changeTime: requiredTime(body, "changeTime"),
    comment: optionalString(body, "comment", 65_535, true) ?? null
  };
}

function updateInput(body: Record<string, unknown>): UpdateDiaperChangeInput {
  rejectUnknownFields(body, fields);
  if (Object.keys(body).length === 0) throw new AppError("Au moins une valeur doit être fournie.", 400);
  const input: UpdateDiaperChangeInput = {};
  const dailyReportId = optionalPositiveInteger(body, "dailyReportId");
  const diaperChangeTypeId = optionalPositiveInteger(body, "diaperChangeTypeId");
  const changeTime = optionalTime(body, "changeTime");
  const comment = optionalString(body, "comment", 65_535, true);
  if (dailyReportId !== undefined) input.dailyReportId = dailyReportId;
  if (diaperChangeTypeId !== undefined) input.diaperChangeTypeId = diaperChangeTypeId;
  if (changeTime !== undefined) input.changeTime = changeTime;
  if (comment !== undefined) input.comment = comment;
  return input;
}

export const diaperChangesRouter = Router();
diaperChangesRouter.get("/", asyncHandler(async (_request, response) => {
  response.status(200).json(await listDiaperChanges(actorOf(response.locals)));
}));
diaperChangesRouter.get("/:id", asyncHandler(async (request, response) => {
  const change = await findDiaperChangeById(parseId(request.params.id));
  if (!change) throw new AppError("Change introuvable.", 404);
  await requireReportAccess(actorOf(response.locals), change.dailyReportId);
  response.status(200).json(change);
}));
diaperChangesRouter.post("/", asyncHandler(async (request, response) => {
  const input = createInput(readObject(request.body));
  response.status(201).json(await mutateDraft(actorOf(response.locals), input.dailyReportId,
    (connection) => createDiaperChange(input, connection)));
}));
diaperChangesRouter.patch("/:id", asyncHandler(async (request, response) => {
  const id = parseId(request.params.id);
  const current = await findDiaperChangeById(id);
  if (!current) throw new AppError("Change introuvable.", 404);
  const input = updateInput(readObject(request.body));
  const change = await mutateDraft(actorOf(response.locals), current.dailyReportId,
    (connection) => updateDiaperChange(id, input, connection), input.dailyReportId);
  response.status(200).json(change);
}));
diaperChangesRouter.delete("/:id", asyncHandler(async (request, response) => {
  const current = await findDiaperChangeById(parseId(request.params.id));
  if (!current) throw new AppError("Change introuvable.", 404);
  await mutateDraft(actorOf(response.locals), current.dailyReportId,
    (connection) => deleteDiaperChange(parseId(request.params.id), connection));
  response.status(204).send();
}));
