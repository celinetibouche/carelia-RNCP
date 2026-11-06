import assert from "node:assert/strict";
import { test } from "node:test";
import mysql from "mysql2/promise";
import type { NextFunction, Request, Response } from "express";

import { AppError } from "./errors/app-error.js";
import { toDatabaseError } from "./errors/database-error.js";
import { database } from "./middlewares/config/database.js";
import { migrate } from "./migrate.js";
import { generatedSummary } from "./modules/reports/reports.routes.js";
import { errorHandler } from "./middlewares/error-handler.js";
import {
  asyncHandler, optionalBoolean, optionalPositiveInteger, optionalString,
  optionalTime, parseId, readObject, rejectUnknownFields,
  requiredPositiveInteger, requiredString, requiredTime
} from "./modules/shared/http-utils.js";
import {
  executeStatement, normalizeTime, requireUpdate, selectRows
} from "./modules/shared/repository-utils.js";

function badRequest(action: () => unknown): void {
  assert.throws(action, (error: unknown) => error instanceof AppError && error.statusCode === 400);
}

test("les codes MySQL sont traduits en réponses stables", async (t) => {
  for (const [code, status] of [
    ["ER_DUP_ENTRY", 409],
    ["ER_NO_REFERENCED_ROW_2", 409],
    ["ER_ROW_IS_REFERENCED_2", 409],
    ["ER_BAD_NULL_ERROR", 400],
    ["ER_DATA_TOO_LONG", 400],
    ["ER_TRUNCATED_WRONG_VALUE", 400],
    ["ER_CHECK_CONSTRAINT_VIOLATED", 400],
    ["ER_UNKNOWN_ERROR", 500]
  ] as const) {
    await t.test(code, () => {
      const converted = toDatabaseError(Object.assign(new Error("SQL detail"), { code }));
      assert.equal(converted.statusCode, status);
      assert.equal(converted.code, code);
      assert.doesNotMatch(converted.message, /SQL detail/);
    });
  }

  const existing = new AppError("Déjà traitée", 422);
  assert.equal(toDatabaseError(existing), existing);
  assert.equal(toDatabaseError({ code: 123 }).statusCode, 500);
});

test("les erreurs SQL des lectures et écritures passent par la traduction", async (t) => {
  const failure = Object.assign(new Error("SQL detail"), { code: "ER_DUP_ENTRY" });
  const mocked = t.mock.method(database, "execute", async () => { throw failure; });
  try {
    await assert.rejects(selectRows("SELECT 1"), (error: unknown) =>
      error instanceof AppError && error.statusCode === 409 && error.code === "ER_DUP_ENTRY");
    await assert.rejects(executeStatement("INSERT INTO example VALUES (1)"), (error: unknown) =>
      error instanceof AppError && error.statusCode === 409 && error.code === "ER_DUP_ENTRY");
  } finally {
    mocked.mock.restore();
  }
});

test("les identifiants et objets de requête rejettent les formats ambigus", async (t) => {
  assert.equal(parseId("42"), 42);
  for (const value of [undefined, 1, "0", "01", "1.0", "1abc", "9007199254740992"]) {
    await t.test(`id ${String(value)}`, () => badRequest(() => parseId(value)));
  }
  assert.deepEqual(readObject({ name: "A" }), { name: "A" });
  for (const value of [null, undefined, [], "texte"]) badRequest(() => readObject(value));
  rejectUnknownFields({ name: "A" }, ["name"]);
  badRequest(() => rejectUnknownFields({ unexpected: true }, ["name"]));
});

test("les champs texte, nombres, booléens et horaires sont validés", () => {
  assert.equal(requiredString({ name: "  Ada  " }, "name", 10), "Ada");
  badRequest(() => requiredString({ name: " " }, "name", 10));
  badRequest(() => requiredString({ name: "trop long" }, "name", 3));
  assert.equal(optionalString({}, "name", 10), undefined);
  assert.equal(optionalString({ name: null }, "name", 10, true), null);
  assert.equal(optionalString({ name: "  ok " }, "name", 10), "ok");
  badRequest(() => optionalString({ name: null }, "name", 10));
  badRequest(() => optionalString({ name: "too long" }, "name", 2));

  assert.equal(requiredPositiveInteger({ id: 7 }, "id"), 7);
  for (const id of [0, -1, 1.5, "2", Number.MAX_SAFE_INTEGER + 1]) {
    badRequest(() => requiredPositiveInteger({ id }, "id"));
  }
  assert.equal(optionalPositiveInteger({}, "id"), undefined);
  assert.equal(optionalPositiveInteger({ id: 7 }, "id"), 7);
  badRequest(() => optionalPositiveInteger({ id: 0 }, "id"));
  assert.equal(optionalBoolean({}, "active"), undefined);
  assert.equal(optionalBoolean({ active: false }, "active"), false);
  badRequest(() => optionalBoolean({ active: "false" }, "active"));

  assert.equal(requiredTime({ time: "09:05" }, "time"), "09:05");
  assert.equal(requiredTime({ time: "23:59:59" }, "time"), "23:59:59");
  badRequest(() => requiredTime({ time: "24:00" }, "time"));
  assert.equal(optionalTime({}, "time"), undefined);
  assert.equal(optionalTime({ time: "09:05" }, "time"), "09:05");
  badRequest(() => optionalTime({ time: "09:60" }, "time"));
  assert.equal(normalizeTime("09:05"), "09:05:00");
  assert.equal(normalizeTime("09:05:20"), "09:05:20");
  requireUpdate(["name = ?"]);
  badRequest(() => requireUpdate([]));
});

test("le gestionnaire d'erreur ne divulgue pas les détails internes", () => {
  let status = 0;
  let body: unknown;
  const response = {
    status(value: number) { status = value; return this; },
    json(value: unknown) { body = value; return this; }
  } as unknown as Response;
  const call = (error: unknown) => errorHandler(error, {} as Request, response, (() => {}) as NextFunction);

  call(new AppError("Conflit", 409, "ER_DUP_ENTRY"));
  assert.equal(status, 409);
  assert.deepEqual(body, { error: "Conflit", code: "ER_DUP_ENTRY" });

  const syntax = Object.assign(new SyntaxError("Invalid JSON"), { type: "entity.parse.failed" });
  call(syntax);
  assert.equal(status, 400);
  assert.deepEqual(body, { error: "Le corps de la requête doit être un objet JSON valide." });

  const originalError = console.error;
  console.error = () => {};
  try {
    call(new Error("secret database detail"));
    assert.equal(status, 500);
    assert.deepEqual(body, { error: "Erreur interne du serveur" });
    call("unexpected error");
    assert.equal(status, 500);
    assert.deepEqual(body, { error: "Erreur interne du serveur" });
  } finally {
    console.error = originalError;
  }
});

test("asyncHandler transmet un rejet au middleware suivant", async () => {
  const failure = new Error("rejet");
  let received: unknown;
  const handler = asyncHandler(async () => { throw failure; });
  handler({} as Request, {} as Response, (error: unknown) => { received = error; });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(received, failure);
});

test("la migration libère sa connexion si le verrou est indisponible", async (context) => {
  const calls: string[] = [];
  const connection = {
    query: async (sql: string) => {
      calls.push(sql);
      return sql.includes("GET_LOCK") ? [[{ acquired: 0 }]] : [[]];
    },
    end: async () => { calls.push("end"); }
  };
  const mocked = context.mock.method(mysql, "createConnection", async () => connection as never);
  try { await assert.rejects(migrate(), /Verrou de migration indisponible/); }
  finally { mocked.mock.restore(); }
  assert.ok(calls.some((sql) => sql.includes("RELEASE_LOCK")));
  assert.equal(calls.at(-1), "end");
});

test("le résumé automatique gère une journée vide et des observations variées", () => {
  const base = {
    firstName: "Lina", meals: [], moods: [], naps: [], activities: [], diaperChanges: [], parentNote: null
  } as unknown as Parameters<typeof generatedSummary>[0];
  assert.equal(generatedSummary(base), "La journée de Lina.");
  const detailed = {
    ...base,
    meals: [{ kind: "SNACK", intake: "NONE", label: null }],
    moods: [{ moodLabel: "INCONNU" }, { moodLabel: "CALM" }, {}],
    naps: [{ startTime: "13:00:00", endTime: "14:00:00" }],
    activities: ["Lecture"],
    diaperChanges: [{}, {}],
    parentNote: "Bon après-midi."
  } as unknown as Parameters<typeof generatedSummary>[0];
  const summary = generatedSummary(detailed);
  assert.match(summary, /snack \(refusé\)/);
  assert.match(summary, /INCONNU, calme, observation/);
  assert.match(summary, /13:00–14:00/);
  assert.match(summary, /Lecture/);
  assert.match(summary, /2 changes/);
  assert.match(summary, /Bon après-midi/);
});
