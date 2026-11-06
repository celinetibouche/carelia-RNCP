import type { ErrorRequestHandler } from "express";

import { AppError } from "../errors/app-error.js";

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _request,
  response,
  _next
) => {
  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      error: error.message,
      ...(error.code ? { code: error.code } : {})
    });
    return;
  }

  if (error instanceof SyntaxError && (error as SyntaxError & { type?: string }).type === "entity.parse.failed") {
    response.status(400).json({ error: "Le corps de la requête doit être un objet JSON valide." });
    return;
  }

  // An SQL error can contain a message body or personal data. Keep it out of HTTP and logs.
  console.error("Erreur interne du serveur.", error instanceof Error ? error.name : "Erreur");
  response.status(500).json({ error: "Erreur interne du serveur" });
};
