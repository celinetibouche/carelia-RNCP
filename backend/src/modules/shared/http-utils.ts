import type { NextFunction, Request, RequestHandler, Response } from "express";

import { AppError } from "../../errors/app-error.js";

export function asyncHandler(
  handler: (request: Request, response: Response, next: NextFunction) => Promise<void>
): RequestHandler {
  return (request, response, next) => {
    void handler(request, response, next).catch(next);
  };
}

export function parseId(value: unknown): number {
  if (typeof value !== "string") {
    throw new AppError("L'identifiant doit être un entier positif.", 400);
  }
  const id = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(id) || id < 1 || String(id) !== value) {
    throw new AppError("L'identifiant doit être un entier positif.", 400);
  }
  return id;
}

export function readObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new AppError("Le corps de la requête doit être un objet JSON.", 400);
  }
  return value as Record<string, unknown>;
}

export function rejectUnknownFields(body: Record<string, unknown>, allowed: string[]): void {
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) {
      throw new AppError(`Le champ ${key} n'est pas autorisé.`, 400);
    }
  }
}

export function requiredString(body: Record<string, unknown>, key: string, maxLength: number): string {
  const value = body[key];
  if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > maxLength) {
    throw new AppError(`Le champ ${key} est obligatoire et invalide.`, 400);
  }
  return value.trim();
}

export function optionalString(
  body: Record<string, unknown>,
  key: string,
  maxLength: number
): string | undefined;
export function optionalString(
  body: Record<string, unknown>,
  key: string,
  maxLength: number,
  nullable: true
): string | null | undefined;
export function optionalString(
  body: Record<string, unknown>,
  key: string,
  maxLength: number,
  nullable = false
): string | null | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (nullable && value === null) return null;
  if (typeof value !== "string" || value.trim().length > maxLength) {
    throw new AppError(`Le champ ${key} est invalide.`, 400);
  }
  return value.trim();
}

export function requiredPositiveInteger(body: Record<string, unknown>, key: string): number {
  const value = body[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new AppError(`Le champ ${key} doit être un entier positif.`, 400);
  }
  return value;
}

export function optionalPositiveInteger(body: Record<string, unknown>, key: string): number | undefined {
  if (body[key] === undefined) return undefined;
  return requiredPositiveInteger(body, key);
}

export function optionalBoolean(body: Record<string, unknown>, key: string): boolean | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new AppError(`Le champ ${key} doit être un booléen.`, 400);
  return value;
}

export function requiredTime(body: Record<string, unknown>, key: string): string {
  const value = requiredString(body, key, 8);
  if (!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) {
    throw new AppError(`Le champ ${key} doit être une heure valide.`, 400);
  }
  return value;
}

export function optionalTime(body: Record<string, unknown>, key: string): string | undefined {
  const value = optionalString(body, key, 8);
  if (value !== undefined && !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) {
    throw new AppError(`Le champ ${key} doit être une heure valide.`, 400);
  }
  return value;
}
