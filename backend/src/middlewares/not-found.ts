import type { RequestHandler } from "express";

export const notFound: RequestHandler = (request, response) => {
  response.status(404).json({
    error: "Route introuvable",
    path: request.originalUrl
  });
};
