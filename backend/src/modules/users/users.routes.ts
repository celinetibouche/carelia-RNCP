import bcrypt from "bcrypt";
import { Router } from "express";

import { AppError } from "../../errors/app-error.js";
import { actorOf, requireDaycare, requireRole } from "../auth/auth.js";
import {
  asyncHandler,
  optionalBoolean,
  optionalPositiveInteger,
  optionalString,
  parseId,
  readObject,
  rejectUnknownFields,
  requiredPositiveInteger,
  requiredString
} from "../shared/http-utils.js";
import {
  createUser,
  deleteUser,
  ensureUserReferencesExist,
  findUserById,
  listUsers,
  updateUser,
  type CreateUserInput,
  type UpdateUserInput
} from "./users.repository.js";

// Le client envoie toujours un mot de passe en clair ("password"), jamais un hash :
// c'est cette route qui a la responsabilité de le hasher avant de toucher la base.
const BCRYPT_SALT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;

type CreateUserBody = Omit<CreateUserInput, "passwordHash"> & { password: string };
type UpdateUserBody = Omit<UpdateUserInput, "passwordHash"> & { password?: string };

const userFields = [
  "daycareId", "roleId", "email", "password", "lastName", "firstName",
  "phone", "address", "isActive"
];

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

function readEmail(body: Record<string, unknown>, required: boolean): string | undefined {
  const email = required
    ? requiredString(body, "email", 320)
    : optionalString(body, "email", 320);
  if (email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError("Le champ email est invalide.", 400);
  }
  return email?.toLowerCase();
}

// On lit "password" directement, sans passer par requiredString/optionalString :
// ces fonctions font un trim(), ce qui changerait silencieusement le mot de passe réel.
function readPassword(body: Record<string, unknown>, required: boolean): string | undefined {
  const value = body.password;
  if (value === undefined) {
    if (required) {
      throw new AppError("Le champ password est obligatoire et invalide.", 400);
    }
    return undefined;
  }
  if (typeof value !== "string" || value.length < MIN_PASSWORD_LENGTH || value.length > 72) {
    throw new AppError(
      `Le champ password doit contenir entre ${MIN_PASSWORD_LENGTH} et 72 caractères.`,
      400
    );
  }
  return value;
}

function readCreateUser(body: Record<string, unknown>): CreateUserBody {
  rejectUnknownFields(body, userFields);
  const phone = optionalString(body, "phone", 30, true);
  const address = optionalString(body, "address", 65_535, true);
  const isActive = optionalBoolean(body, "isActive");
  return {
    daycareId: requiredPositiveInteger(body, "daycareId"),
    roleId: requiredPositiveInteger(body, "roleId"),
    email: readEmail(body, true) as string,
    password: readPassword(body, true) as string,
    lastName: requiredString(body, "lastName", 100),
    firstName: requiredString(body, "firstName", 100),
    ...(phone !== undefined ? { phone } : {}),
    ...(address !== undefined ? { address } : {}),
    ...(isActive !== undefined ? { isActive } : {})
  };
}

function readUpdateUser(body: Record<string, unknown>): UpdateUserBody {
  rejectUnknownFields(body, userFields);
  const result: UpdateUserBody = {};
  const daycareId = optionalPositiveInteger(body, "daycareId");
  const roleId = optionalPositiveInteger(body, "roleId");
  const email = readEmail(body, false);
  const password = readPassword(body, false);
  const lastName = optionalString(body, "lastName", 100);
  const firstName = optionalString(body, "firstName", 100);
  const phone = optionalString(body, "phone", 30, true);
  const address = optionalString(body, "address", 65_535, true);
  const isActive = optionalBoolean(body, "isActive");
  if (daycareId !== undefined) result.daycareId = daycareId;
  if (roleId !== undefined) result.roleId = roleId;
  if (email !== undefined) result.email = email;
  if (password !== undefined) result.password = password;
  if (lastName !== undefined) result.lastName = lastName;
  if (firstName !== undefined) result.firstName = firstName;
  if (phone !== undefined) result.phone = phone;
  if (address !== undefined) result.address = address;
  if (isActive !== undefined) result.isActive = isActive;
  if (Object.values(result).every((value) => value === undefined)) {
    throw new AppError("Au moins une valeur doit être fournie.", 400);
  }
  return result;
}

export const usersRouter = Router();

usersRouter.get("/", asyncHandler(async (_request, response) => {
  const actor = actorOf(response.locals);
  requireRole(actor, "DAYCARE_ADMIN", "EJE");
  response.status(200).json(await listUsers(actor.daycareId));
}));

usersRouter.get("/:id", asyncHandler(async (request, response) => {
  const user = await findUserById(parseId(request.params.id));
  if (!user) throw new AppError("Utilisateur introuvable.", 404);
  const actor = actorOf(response.locals);
  requireDaycare(actor, user.daycareId);
  if (actor.userId !== user.userId) requireRole(actor, "DAYCARE_ADMIN", "EJE");
  response.status(200).json(user);
}));

usersRouter.post("/", asyncHandler(async (request, response) => {
  const actor = actorOf(response.locals);
  requireRole(actor, "DAYCARE_ADMIN");
  const { password, ...body } = readCreateUser(readObject(request.body));
  requireDaycare(actor, body.daycareId);
  // On vérifie les références AVANT de hasher : pas de hash coûteux sur une requête
  // qu'on sait déjà invalide (daycareId/roleId inexistants).
  await ensureUserReferencesExist(body);
  const user = await createUser({ ...body, passwordHash: await hashPassword(password) });
  response.status(201).json(user);
}));

usersRouter.patch("/:id", asyncHandler(async (request, response) => {
  const actor = actorOf(response.locals);
  requireRole(actor, "DAYCARE_ADMIN");
  const current = await findUserById(parseId(request.params.id));
  if (!current) throw new AppError("Utilisateur introuvable.", 404);
  requireDaycare(actor, current.daycareId);
  const { password, ...body } = readUpdateUser(readObject(request.body));
  if (body.daycareId !== undefined) requireDaycare(actor, body.daycareId);
  await ensureUserReferencesExist(body);
  const user = await updateUser(parseId(request.params.id), {
    ...body,
    ...(password !== undefined ? { passwordHash: await hashPassword(password) } : {})
  });
  if (!user) throw new AppError("Utilisateur introuvable.", 404);
  response.status(200).json(user);
}));

usersRouter.delete("/:id", asyncHandler(async (request, response) => {
  const actor = actorOf(response.locals);
  requireRole(actor, "DAYCARE_ADMIN");
  const current = await findUserById(parseId(request.params.id));
  if (!current) throw new AppError("Utilisateur introuvable.", 404);
  requireDaycare(actor, current.daycareId);
  if (actor.userId === current.userId) throw new AppError("Suppression de son compte interdite.", 409);
  const deleted = await deleteUser(parseId(request.params.id));
  if (!deleted) throw new AppError("Utilisateur introuvable.", 404);
  response.status(204).send();
}));
