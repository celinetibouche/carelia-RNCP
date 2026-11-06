import { Router } from "express";
import { AppError } from "../../errors/app-error.js";
import { actorOf, clearSessionCookie, login, logout, requireAuth, sessionCookie } from "./auth.js";
import { asyncHandler, readObject, rejectUnknownFields, requiredString } from "../shared/http-utils.js";

export const authRouter = Router();

authRouter.post("/login", asyncHandler(async (request, response) => {
  const body = readObject(request.body);
  rejectUnknownFields(body, ["email", "password"]);
  const email = requiredString(body, "email", 320).toLowerCase();
  const password = body.password;
  if (typeof password !== "string" || !password) throw new AppError("Mot de passe requis.", 400);
  const session = await login(email, password);
  response.setHeader("Set-Cookie", sessionCookie(session.token));
  response.status(200).json({ user: session.actor });
}));

authRouter.get("/me", requireAuth, (_request, response) => {
  response.status(200).json(actorOf(response.locals));
});

authRouter.post("/logout", requireAuth, asyncHandler(async (request, response) => {
  await logout(request);
  response.setHeader("Set-Cookie", clearSessionCookie());
  response.status(204).send();
}));
