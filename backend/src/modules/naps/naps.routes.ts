import { Router } from "express";

import { AppError } from "../../errors/app-error.js";
import { actorOf, requireReportAccess } from "../auth/auth.js";
import { mutateDraft } from "../shared/legacy-access.js";
import {
  asyncHandler, optionalPositiveInteger, optionalString, optionalTime, parseId,
  readObject, rejectUnknownFields, requiredPositiveInteger, requiredTime
} from "../shared/http-utils.js";
import { normalizeTime } from "../shared/repository-utils.js";
import {
  createNap, deleteNap, findNapById, listNaps, updateNap,
  type CreateNapInput, type UpdateNapInput
} from "./naps.repository.js";

const fields = ["dailyReportId", "napQualityId", "startTime", "endTime", "comment"];

function validateTimeOrder(startTime: string | undefined, endTime: string | undefined): void {
  if (
    startTime !== undefined &&
    endTime !== undefined &&
    normalizeTime(endTime) <= normalizeTime(startTime)
  ) {
    throw new AppError("endTime doit être postérieure à startTime.", 400);
  }
}

function createInput(body: Record<string, unknown>): CreateNapInput {
  rejectUnknownFields(body, fields);
  const startTime = requiredTime(body, "startTime");
  const endTime = requiredTime(body, "endTime");
  validateTimeOrder(startTime, endTime);
  return {
    dailyReportId: requiredPositiveInteger(body, "dailyReportId"),
    napQualityId: requiredPositiveInteger(body, "napQualityId"),
    startTime,
    endTime,
    comment: optionalString(body, "comment", 65_535, true) ?? null
  };
}

function updateInput(body: Record<string, unknown>): UpdateNapInput {
  rejectUnknownFields(body, fields);
  if (Object.keys(body).length === 0) throw new AppError("Au moins une valeur doit être fournie.", 400);
  const input: UpdateNapInput = {};
  const dailyReportId = optionalPositiveInteger(body, "dailyReportId");
  const napQualityId = optionalPositiveInteger(body, "napQualityId");
  const startTime = optionalTime(body, "startTime");
  const endTime = optionalTime(body, "endTime");
  const comment = optionalString(body, "comment", 65_535, true);
  validateTimeOrder(startTime, endTime);
  if (dailyReportId !== undefined) input.dailyReportId = dailyReportId;
  if (napQualityId !== undefined) input.napQualityId = napQualityId;
  if (startTime !== undefined) input.startTime = startTime;
  if (endTime !== undefined) input.endTime = endTime;
  if (comment !== undefined) input.comment = comment;
  return input;
}

export const napsRouter = Router();
napsRouter.get("/", asyncHandler(async (_request, response) => {
  response.status(200).json(await listNaps(actorOf(response.locals)));
}));
napsRouter.get("/:id", asyncHandler(async (request, response) => {
  const nap = await findNapById(parseId(request.params.id));
  if (!nap) throw new AppError("Sieste introuvable.", 404);
  await requireReportAccess(actorOf(response.locals), nap.dailyReportId);
  response.status(200).json(nap);
}));
napsRouter.post("/", asyncHandler(async (request, response) => {
  const input = createInput(readObject(request.body));
  response.status(201).json(await mutateDraft(actorOf(response.locals), input.dailyReportId, (connection) => createNap(input, connection)));
}));
napsRouter.patch("/:id", asyncHandler(async (request, response) => {
  const id = parseId(request.params.id);
  const current = await findNapById(id);
  if (!current) throw new AppError("Sieste introuvable.", 404);
  const input = updateInput(readObject(request.body));
  const nap = await mutateDraft(actorOf(response.locals), current.dailyReportId,
    (connection) => updateNap(id, input, connection), input.dailyReportId);
  response.status(200).json(nap);
}));
napsRouter.delete("/:id", asyncHandler(async (request, response) => {
  const current = await findNapById(parseId(request.params.id));
  if (!current) throw new AppError("Sieste introuvable.", 404);
  await mutateDraft(actorOf(response.locals), current.dailyReportId,
    (connection) => deleteNap(parseId(request.params.id), connection));
  response.status(204).send();
}));
