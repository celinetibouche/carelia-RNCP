import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test, type TestContext } from "node:test";
import bcrypt from "bcrypt";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { app } from "./app.js";
import { database } from "./middlewares/config/database.js";
import { migrate } from "./migrate.js";
import { actorOf, sessionCookie, tokenFromCookie } from "./modules/auth/auth.js";
import { createDaycare, deleteDaycare, findDaycareById, listDaycares, updateDaycare } from "./modules/daycares/daycares.repository.js";

type Reply<T = Record<string, unknown>> = { status: number; body: T; cookie: string | null };

test("P0/F1 : refus, validations et chemins de maintenance", async (t) => {
  await migrate();
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const [daycare] = await database.execute<ResultSetHeader>("INSERT INTO daycares (name) VALUES (?)", [`Edge ${suffix}`]);
  const [otherDaycare] = await database.execute<ResultSetHeader>("INSERT INTO daycares (name) VALUES (?)", [`Other edge ${suffix}`]);
  const [roleRows] = await database.query<(RowDataPacket & { roleId: number; label: string })[]>(
    "SELECT role_id AS roleId, label FROM roles"
  );
  const roleId = (label: string) => {
    const role = roleRows.find((item) => item.label === label);
    assert.ok(role);
    return role.roleId;
  };
  const password = "EdgePassword123!";
  const passwordHash = await bcrypt.hash(password, 10);
  async function createUser(name: string, role: string, daycareId = daycare.insertId, active = true) {
    const email = `${name}-${suffix}@carelia.test`;
    const [result] = await database.execute<ResultSetHeader>(
      `INSERT INTO users (daycare_id, role_id, email, password_hash, last_name, first_name, is_active)
       VALUES (?, ?, ?, ?, 'Edge', ?, ?)`,
      [daycareId, roleId(role), email, passwordHash, name, active ? 1 : 0]
    );
    return { id: result.insertId, email };
  }
  const admin = await createUser("admin", "DAYCARE_ADMIN");
  const parent = await createUser("parent", "PARENT");
  const auxiliary = await createUser("auxiliary", "AUXILIARY");
  const outsider = await createUser("outsider", "DAYCARE_ADMIN", otherDaycare.insertId);
  const inactive = await createUser("inactive", "PARENT", daycare.insertId, false);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  async function request<T = Record<string, unknown>>(
    path: string, method = "GET", data?: unknown, cookie?: string, authorization?: string
  ): Promise<Reply<T>> {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(data === undefined ? {} : { "content-type": "application/json" }),
        ...(cookie ? { cookie } : {}),
        ...(authorization ? { authorization } : {})
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) })
    });
    return {
      status: response.status,
      body: response.status === 204 ? {} as T : await response.json() as T,
      cookie: response.headers.get("set-cookie")?.split(";")[0] ?? null
    };
  }
  const expect = async (path: string, status: number, method = "GET", data?: unknown, cookie?: string) => {
    const result = await request(path, method, data, cookie);
    assert.equal(result.status, status, `${method} ${path}: ${JSON.stringify(result.body)}`);
    return result.body;
  };
  const login = async (email: string) => {
    const result = await request<{ user: { role: string } }>("/auth/login", "POST", { email, password });
    assert.equal(result.status, 200);
    assert.ok(result.cookie);
    assert.equal("token" in result.body, false);
    const token = tokenFromCookie(result.cookie);
    assert.ok(token);
    return { cookie: result.cookie, token };
  };
  async function withPoolResult(
    context: TestContext, match: (sql: string) => boolean, result: unknown, action: () => Promise<void>
  ) {
    const original = database.execute.bind(database);
    const mocked = context.mock.method(database, "execute", async (...args: unknown[]) =>
      match(String(args[0])) ? result as never : Reflect.apply(original, database, args));
    try { await action(); }
    finally { mocked.mock.restore(); }
  }
  async function withTransactionResult(
    context: TestContext, match: (sql: string) => boolean, result: unknown, action: () => Promise<void>
  ) {
    const original = database.getConnection.bind(database);
    const mocked = context.mock.method(database, "getConnection", async () => {
      const connection = await original();
      return new Proxy(connection, {
        get(target, property) {
          if (property === "execute") return async (sql: string, values: unknown[]) =>
            match(sql) ? result : Reflect.apply(target.execute, target, [sql, values]);
          const value = Reflect.get(target, property);
          return typeof value === "function" ? value.bind(target) : value;
        }
      });
    });
    try { await action(); }
    finally { mocked.mock.restore(); }
  }

  try {
    const adminSession = await login(admin.email);
    const parentSession = await login(parent.email);
    const auxiliarySession = await login(auxiliary.email);
    const outsiderSession = await login(outsider.email);

    await t.test("authentification, session révoquée, expirée et compte désactivé", async () => {
      await expect("", 200);
      await expect("/inconnue", 404);
      assert.equal(tokenFromCookie(undefined), null);
      assert.equal(tokenFromCookie("other=value; carelia_session=bad"), null);
      assert.equal(tokenFromCookie(`other=value; ${adminSession.cookie}`), adminSession.token);
      assert.throws(() => actorOf({}), /Authentification requise/);
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      try { assert.match(sessionCookie(adminSession.token), /; Secure$/); }
      finally { process.env.NODE_ENV = originalEnv; }
      await expect("/auth/login", 400, "POST", { email: admin.email });
      await expect("/auth/login", 400, "POST", { email: admin.email, password: "" });
      await expect("/auth/login", 400, "POST", { email: admin.email, password, extra: true });
      await expect("/auth/login", 401, "POST", { email: inactive.email, password });
      const seedLike = await createUser("unusable", "PARENT");
      await database.execute("UPDATE users SET password_hash = '$argon2id$UNUSABLE_DEMO_HASH' WHERE user_id = ?", [seedLike.id]);
      await expect("/auth/login", 401, "POST", { email: seedLike.email, password });
      await expect("/auth/login", 401, "POST", { email: `missing-${suffix}@carelia.test`, password });
      await expect("/auth/me", 401, "GET", undefined, "carelia_session=bad");
      const bearer = await request("/auth/me", "GET", undefined, undefined, `Bearer ${adminSession.token}`);
      assert.equal(bearer.status, 200);
      const extra = await login(admin.email);
      await expect("/auth/logout", 204, "POST", undefined, extra.cookie);
      await expect("/auth/me", 401, "GET", undefined, extra.cookie);
      const expired = await login(admin.email);
      await database.execute("UPDATE auth_sessions SET expires_at = UTC_TIMESTAMP(3) - INTERVAL 1 SECOND WHERE token_hash = SHA2(?, 256)", [expired.token]);
      await expect("/auth/me", 401, "GET", undefined, expired.cookie);
      const deactivated = await createUser("later-inactive", "PARENT");
      const deactivatedSession = await login(deactivated.email);
      await database.execute("UPDATE users SET is_active = 0 WHERE user_id = ?", [deactivated.id]);
      await expect("/auth/me", 401, "GET", undefined, deactivatedSession.cookie);
    });

    await t.test("utilisateurs : validations, rôles, mise à jour et suppression", async (context) => {
      await expect(`/users/${admin.id}`, 200, "GET", undefined, adminSession.cookie);
      await expect(`/users/${parent.id}`, 200, "GET", undefined, parentSession.cookie);
      await expect(`/users/${admin.id}`, 403, "GET", undefined, parentSession.cookie);
      await expect(`/users/${outsider.id}`, 403, "GET", undefined, adminSession.cookie);
      await expect("/users/999999999", 404, "GET", undefined, adminSession.cookie);
      await expect("/users", 403, "POST", { daycareId: daycare.insertId }, parentSession.cookie);
      const create = { daycareId: daycare.insertId, roleId: roleId("PARENT"),
        email: `new-${suffix}@carelia.test`, password: "NewPassword123!", firstName: "New", lastName: "User" };
      for (const [payload, status] of [
        [{ ...create, email: "invalid" }, 400],
        [Object.fromEntries(Object.entries(create).filter(([key]) => key !== "password")), 400],
        [{ ...create, password: "short" }, 400],
        [{ ...create, roleId: 999999999 }, 400],
        [{ ...create, daycareId: otherDaycare.insertId }, 403],
        [{ ...create, extra: true }, 400]
      ] as const) await expect("/users", status, "POST", payload, adminSession.cookie);
      const created = await request<{ userId: number }>("/users", "POST", create, adminSession.cookie);
      assert.equal(created.status, 201);
      const id = created.body.userId;
      await expect("/users", 409, "POST", create, adminSession.cookie);
      await expect(`/users/${id}`, 400, "PATCH", {}, adminSession.cookie);
      await expect(`/users/${id}`, 400, "PATCH", { email: "bad" }, adminSession.cookie);
      await expect(`/users/${id}`, 400, "PATCH", { password: "short" }, adminSession.cookie);
      await expect(`/users/${id}`, 403, "PATCH", { firstName: "No" }, auxiliarySession.cookie);
      await expect(`/users/${id}`, 403, "PATCH", { daycareId: otherDaycare.insertId }, adminSession.cookie);
      await expect(`/users/${id}`, 400, "PATCH", { roleId: 999999999 }, adminSession.cookie);
      await expect("/users/999999999", 404, "PATCH", { firstName: "No" }, adminSession.cookie);
      const updated = await request<{ firstName: string; isActive: boolean }>(`/users/${id}`, "PATCH", {
        firstName: "Changed", lastName: "Name", phone: "0102030405", address: "Paris",
        isActive: false, roleId: roleId("PARENT"), password: "ChangedPassword123!"
      }, adminSession.cookie);
      assert.equal(updated.status, 200);
      assert.equal(updated.body.firstName, "Changed");
      assert.equal(updated.body.isActive, false);
      await expect(`/users/${id}`, 200, "PATCH", { daycareId: daycare.insertId, isActive: true }, adminSession.cookie);
      await expect(`/users/${id}`, 200, "PATCH", { email: `renamed-${suffix}@carelia.test` }, adminSession.cookie);
      let userReads = 0;
      await withPoolResult(context, (sql) => sql.includes("FROM users WHERE user_id = ?") && ++userReads === 2,
        [[], []], async () => {
          await expect(`/users/${id}`, 404, "PATCH", { firstName: "Gone" }, adminSession.cookie);
        });
      await withPoolResult(context, (sql) => sql.includes("DELETE FROM users WHERE user_id"),
        [{ affectedRows: 0 }, []], async () => {
          await expect(`/users/${id}`, 404, "DELETE", undefined, adminSession.cookie);
        });
      const optional = await request<{ userId: number }>("/users", "POST", {
        ...create, email: `optional-${suffix}@carelia.test`, phone: "0102030405", address: "Paris", isActive: false
      }, adminSession.cookie);
      assert.equal(optional.status, 201);
      await expect(`/users/${optional.body.userId}`, 204, "DELETE", undefined, adminSession.cookie);
      await expect(`/users/${admin.id}`, 409, "DELETE", undefined, adminSession.cookie);
      await expect(`/users/${id}`, 204, "DELETE", undefined, adminSession.cookie);
      await expect(`/users/${id}`, 404, "GET", undefined, adminSession.cookie);
      await expect(`/users/${id}`, 404, "DELETE", undefined, adminSession.cookie);
    });

    await t.test("crèches : dépôt, droits et contrainte de suppression", async (context) => {
      const temporary = await createDaycare({ name: `Temporary ${suffix}` });
      assert.ok(temporary);
      assert.ok((await listDaycares()).some((item) => item.daycareId === temporary.daycareId));
      assert.equal((await findDaycareById(temporary.daycareId))?.name, temporary.name);
      assert.equal((await updateDaycare(temporary.daycareId, { name: `Updated ${suffix}` }))?.name, `Updated ${suffix}`);
      assert.equal(await deleteDaycare(temporary.daycareId), true);
      assert.equal(await deleteDaycare(temporary.daycareId), false);
      assert.equal(await findDaycareById(temporary.daycareId), null);
      assert.equal(await updateDaycare(temporary.daycareId, { name: "Missing" }), null);
      await expect(`/daycares/${daycare.insertId}`, 403, "PATCH", { name: "No" }, parentSession.cookie);
      await expect(`/daycares/${otherDaycare.insertId}`, 403, "PATCH", { name: "No" }, adminSession.cookie);
      await withPoolResult(context, (sql) => sql.includes("SELECT daycare_id AS daycareId, name FROM daycares WHERE daycare_id"),
        [[], []], async () => {
          await expect(`/daycares/${daycare.insertId}`, 404, "GET", undefined, adminSession.cookie);
        });
      await withPoolResult(context, (sql) => sql.includes("SELECT daycare_id AS daycareId, name FROM daycares WHERE daycare_id"),
        [[], []], async () => {
          await expect(`/daycares/${daycare.insertId}`, 404, "PATCH", { name: `Missing ${suffix}` }, adminSession.cookie);
        });
      await expect(`/daycares/${daycare.insertId}`, 403, "DELETE", undefined, parentSession.cookie);
      const rejected = await expect(`/daycares/${daycare.insertId}`, 409, "DELETE", undefined, adminSession.cookie);
      assert.equal(rejected.error, "La crèche du compte courant ne peut pas être supprimée.");
      const spec = await request<{ paths: Record<string, { delete?: { responses: Record<string, unknown> } }> }>("/docs/openapi.json");
      assert.ok(spec.body.paths["/api/daycares/{id}"]?.delete?.responses["409"]);
      assert.equal(spec.body.paths["/api/daycares/{id}"]?.delete?.responses["204"], undefined);
    });

    await t.test("santé : MySQL indisponible retourne 503", async (context) => {
      const mocked = context.mock.method(database, "query", async () => { throw new Error("MySQL indisponible"); });
      try { await expect("/health", 503); }
      finally { mocked.mock.restore(); }
    });

    const createdChild = await request<{ childId: number }>("/children", "POST", {
      firstName: "Edge", lastName: "Child", birthDate: "2024-05-06"
    }, adminSession.cookie);
    assert.equal(createdChild.status, 201);
    const childId = createdChild.body.childId;
    const outsiderChild = await request<{ childId: number }>("/children", "POST", {
      firstName: "Other", lastName: "Child", birthDate: "2024-05-06"
    }, outsiderSession.cookie);
    assert.equal(outsiderChild.status, 201);

    await t.test("enfants et liens parentaux : contraintes et périmètre", async (context) => {
      await expect(`/children/${childId}`, 403, "GET", undefined, parentSession.cookie);
      await expect(`/children/${outsiderChild.body.childId}`, 403, "GET", undefined, adminSession.cookie);
      await expect("/children/999999999", 404, "GET", undefined, adminSession.cookie);
      await withPoolResult(context, (sql) => sql.includes("FROM children c LEFT JOIN child_details"),
        [[], []], async () => {
          await expect(`/children/${childId}`, 404, "GET", undefined, adminSession.cookie);
        });
      await expect(`/children/${childId}/parents`, 403, "GET", undefined, parentSession.cookie);
      await expect("/children?search=" + "x".repeat(101), 400, "GET", undefined, adminSession.cookie);
      await expect("/children", 400, "POST", { firstName: "A", lastName: "B", birthDate: "2024-02-30" }, adminSession.cookie);
      await expect("/children", 400, "POST", { firstName: "A", lastName: "B" }, adminSession.cookie);
      await expect("/children", 400, "POST", { firstName: "A", lastName: "B", birthDate: "2024-01-01", extra: true }, adminSession.cookie);
      const complete = await request<{ childId: number }>("/children", "POST", {
        firstName: "Complet", lastName: "Test", birthDate: "2024-01-01", groupName: "Moyens",
        emergencyContactName: "Parent test", emergencyContactPhone: "0102030405"
      }, adminSession.cookie);
      assert.equal(complete.status, 201);
      await expect(`/children/${complete.body.childId}`, 200, "PATCH", {
        groupName: null, emergencyContactName: null, emergencyContactPhone: null
      }, adminSession.cookie);
      await expect(`/children/${childId}`, 400, "PATCH", {}, adminSession.cookie);
      await expect(`/children/${childId}`, 400, "PATCH", { birthDate: "2024-02-30" }, adminSession.cookie);
      await expect(`/children/${childId}`, 400, "PATCH", { isActive: "false" }, adminSession.cookie);
      await expect(`/children/${childId}/parents/${parent.id}`, 403, "PUT", { relationship: "Parent" }, auxiliarySession.cookie);
      await expect(`/children/${childId}/parents/${parent.id}`, 400, "PUT", {}, adminSession.cookie);
      await expect(`/children/${childId}/parents/${inactive.id}`, 400, "PUT", { relationship: "Parent" }, adminSession.cookie);
      await expect(`/children/${childId}/parents/${inactive.id}`, 404, "DELETE", undefined, adminSession.cookie);
      await expect(`/children/${childId}/parents/${parent.id}`, 204, "PUT", { relationship: "Parent" }, adminSession.cookie);
      await expect(`/children/${childId}`, 200, "GET", undefined, parentSession.cookie);
      await expect(`/children/${childId}/parents/${parent.id}`, 204, "PUT", { relationship: "Responsable" }, adminSession.cookie);
    });

    await t.test("une erreur SQL annule entièrement la transaction enfant", async (context) => {
      const original = database.getConnection.bind(database);
      const mocked = context.mock.method(database, "getConnection", async () => {
        const connection = await original();
        return new Proxy(connection, {
          get(target, property) {
            if (property === "execute") return async (sql: string, values: unknown[]) => {
              if (sql.includes("INSERT INTO child_details")) throw new Error("Échec SQL simulé");
              return Reflect.apply(target.execute, target, [sql, values]);
            };
            const value = Reflect.get(target, property);
            return typeof value === "function" ? value.bind(target) : value;
          }
        });
      });
      try {
        await expect("/children", 500, "POST", { firstName: "Rollback", lastName: "Test", birthDate: "2024-01-01" }, adminSession.cookie);
        await expect(`/children/${childId}`, 500, "PATCH", { firstName: "Rollback", groupName: "Autre groupe" }, adminSession.cookie);
      } finally { mocked.mock.restore(); }
      const matches = await request<Array<{ childId: number }>>("/children?search=Rollback", "GET", undefined, adminSession.cookie);
      assert.equal(matches.status, 200);
      assert.deepEqual(matches.body, []);
      const preserved = await request<{ firstName: string }>(`/children/${childId}`, "GET", undefined, adminSession.cookie);
      assert.equal(preserved.body.firstName, "Edge");
    });

    const reportDate = "2026-10-20";
    const createdReport = await request<{ reportId: number }>("/reports", "POST", { childId, reportDate }, auxiliarySession.cookie);
    assert.equal(createdReport.status, 201);
    const reportId = createdReport.body.reportId;

    await t.test("bulletin : paramètres, contenu et transaction sans écriture partielle", async (context) => {
      await expect("/reports?limit=101", 400, "GET", undefined, adminSession.cookie);
      await expect("/reports?limit=abc", 400, "GET", undefined, adminSession.cookie);
      await expect("/reports?offset=-1", 400, "GET", undefined, adminSession.cookie);
      await expect("/reports?offset=1", 200, "GET", undefined, adminSession.cookie);
      await expect("/reports?date=2026-02-30", 400, "GET", undefined, adminSession.cookie);
      await expect("/reports?childId=999999999", 404, "GET", undefined, adminSession.cookie);
      await expect(`/reports/${reportId}`, 403, "GET", undefined, parentSession.cookie);
      await expect("/reports/999999999", 404, "GET", undefined, adminSession.cookie);
      await withPoolResult(context, (sql) => sql.includes("LEFT JOIN daily_report_content d") && sql.includes("WHERE r.daily_report_id = ?"),
        [[], []], async () => {
          await expect(`/reports/${reportId}`, 404, "GET", undefined, adminSession.cookie);
        });
      await expect(`/reports/${reportId}/preview`, 200, "GET", undefined, adminSession.cookie);
      await expect("/reports", 400, "POST", { childId, reportDate: "2026-02-30" }, adminSession.cookie);
      await expect("/reports", 400, "POST", { childId }, adminSession.cookie);
      await expect("/reports", 400, "POST", { childId, reportDate, extra: true }, adminSession.cookie);
      await expect("/reports", 403, "POST", { childId: outsiderChild.body.childId, reportDate }, adminSession.cookie);
      await expect(`/reports/${reportId}`, 400, "PATCH", { revision: 1 }, adminSession.cookie);
      await expect(`/reports/${reportId}`, 400, "PATCH", { revision: 1, unknown: true }, adminSession.cookie);
      await expect(`/reports/${reportId}`, 400, "PATCH", { revision: 1, meals: [{ kind: "MAIN", intake: "ALL", extra: true }] }, adminSession.cookie);
      const invalid = [
        { meals: [{ kind: "MAIN", intake: "ALL" }, { kind: "MAIN", intake: "NONE" }] },
        { meals: [{ kind: "MAIN", intake: "OTHER" }] },
        { activities: ["Peinture", "Peinture"] },
        { activities: [""] },
        { naps: [{ napQualityId: 1, startTime: "14:00", endTime: "13:00" }] },
        { moods: [{ moodId: 1, observedTime: "25:00" }] },
        { diaperChanges: [{ diaperChangeTypeId: 0, changeTime: "10:00" }] },
        { parentNote: "x".repeat(5001) },
        { meals: "not an array" }
      ];
      for (const content of invalid) await expect(`/reports/${reportId}`, 400, "PATCH", { revision: 1, ...content }, adminSession.cookie);
      await expect(`/reports/${reportId}`, 409, "PATCH", {
        revision: 1, parentNote: "Should roll back", moods: [{ moodId: 999999999, observedTime: "09:00" }]
      }, adminSession.cookie);
      await withTransactionResult(context, (sql) => sql.includes("FOR UPDATE") && sql.includes("daily_report_content"),
        [[{ status: "PUBLISHED", revision: 1 }], []], async () => {
          await expect(`/reports/${reportId}`, 409, "PATCH", { revision: 1, parentNote: "Late" }, adminSession.cookie);
          await expect(`/reports/${reportId}/publish`, 409, "POST", { revision: 1 }, adminSession.cookie);
        });
      const afterInvalid = await request<{ revision: number; parentNote: string | null }>(`/reports/${reportId}`, "GET", undefined, adminSession.cookie);
      assert.equal(afterInvalid.body.revision, 1);
      assert.equal(afterInvalid.body.parentNote, null);
      const saved = await request<{ revision: number }>(`/reports/${reportId}`, "PATCH", {
        revision: 1, summaryOverride: "Résumé contrôlé", parentNote: "Bonjour",
        meals: [{ kind: "MAIN", intake: "ALL", label: "Riz" }], activities: ["Lecture"],
        naps: [{ napQualityId: 1, startTime: "13:00:00", endTime: "14:00:00", comment: "Repos" }],
        moods: [{ moodId: 1, observedTime: "09:00", comment: "Calme" }],
        diaperChanges: [{ diaperChangeTypeId: 1, changeTime: "11:00", comment: "RAS" }]
      }, adminSession.cookie);
      assert.equal(saved.status, 200);
      assert.equal(saved.body.revision, 2);
      const cleared = await request<{ revision: number; parentNote: string | null; summaryOverride: string | null }>(
        `/reports/${reportId}`, "PATCH", { revision: 2, parentNote: "  ", summaryOverride: null }, adminSession.cookie
      );
      assert.equal(cleared.status, 200);
      assert.equal(cleared.body.parentNote, null);
      assert.equal(cleared.body.summaryOverride, null);
      const preview = await request<{ summary: string }>(`/reports/${reportId}/preview`, "GET", undefined, adminSession.cookie);
      assert.match(preview.body.summary, /La journée de Edge/);
      await expect(`/reports/${reportId}`, 409, "PATCH", { revision: 1, parentNote: "Stale" }, adminSession.cookie);
      await expect(`/reports/${reportId}/publish`, 409, "POST", { revision: 1 }, adminSession.cookie);
    });

    await t.test("anciens CRUD et bulletin publié restent protégés", async (context) => {
      const naps = await request<Array<{ napId: number }>>("/naps", "GET", undefined, adminSession.cookie);
      assert.equal(naps.status, 200);
      const moods = await request<Array<{ moodObservationId: number }>>("/moods", "GET", undefined, adminSession.cookie);
      assert.equal(moods.status, 200);
      const changes = await request<Array<{ diaperChangeId: number }>>("/diaper-changes", "GET", undefined, adminSession.cookie);
      assert.equal(changes.status, 200);
      await expect("/naps/999999999", 404, "GET", undefined, adminSession.cookie);
      await expect("/naps/999999999", 404, "PATCH", { comment: "Non" }, adminSession.cookie);
      await expect("/naps/999999999", 404, "DELETE", undefined, adminSession.cookie);
      await expect("/moods/999999999", 404, "GET", undefined, adminSession.cookie);
      await expect("/moods/999999999", 404, "PATCH", { comment: "Non" }, adminSession.cookie);
      await expect("/moods/999999999", 404, "DELETE", undefined, adminSession.cookie);
      await expect("/diaper-changes/999999999", 404, "GET", undefined, adminSession.cookie);
      await expect("/diaper-changes/999999999", 404, "PATCH", { comment: "Non" }, adminSession.cookie);
      await expect("/diaper-changes/999999999", 404, "DELETE", undefined, adminSession.cookie);
      await expect("/naps", 400, "POST", { dailyReportId: reportId, napQualityId: 1, startTime: "15:00", endTime: "14:00" }, adminSession.cookie);
      await expect("/moods", 400, "POST", { dailyReportId: reportId, moodId: 1, observedTime: "25:00" }, adminSession.cookie);
      await expect("/diaper-changes", 400, "POST", { dailyReportId: reportId, diaperChangeTypeId: 1, changeTime: "25:00" }, adminSession.cookie);
      const nap = naps.body[0];
      const mood = moods.body[0];
      const change = changes.body[0];
      assert.ok(nap && mood && change);
      await expect(`/naps/${nap.napId}`, 400, "PATCH", {}, adminSession.cookie);
      await expect(`/moods/${mood.moodObservationId}`, 400, "PATCH", {}, adminSession.cookie);
      await expect(`/diaper-changes/${change.diaperChangeId}`, 400, "PATCH", {}, adminSession.cookie);
      await expect(`/naps/${nap.napId}`, 400, "PATCH", { dailyReportId: 999999999 }, adminSession.cookie);
      await expect(`/moods/${mood.moodObservationId}`, 400, "PATCH", { dailyReportId: 999999999 }, adminSession.cookie);
      await expect(`/diaper-changes/${change.diaperChangeId}`, 400, "PATCH", { dailyReportId: 999999999 }, adminSession.cookie);
      await expect(`/naps/${nap.napId}`, 200, "PATCH", { comment: "Repos confirmé", napQualityId: 1 }, adminSession.cookie);
      await expect(`/moods/${mood.moodObservationId}`, 200, "PATCH", { comment: "Joyeux", moodId: 1 }, adminSession.cookie);
      await expect(`/diaper-changes/${change.diaperChangeId}`, 200, "PATCH", { comment: "RAS", diaperChangeTypeId: 1 }, adminSession.cookie);
      await expect(`/naps/${nap.napId}`, 200, "PATCH", { dailyReportId: reportId }, adminSession.cookie);
      await expect(`/moods/${mood.moodObservationId}`, 200, "PATCH", { dailyReportId: reportId }, adminSession.cookie);
      await expect(`/diaper-changes/${change.diaperChangeId}`, 200, "PATCH", { dailyReportId: reportId }, adminSession.cookie);
      await withTransactionResult(context, (sql) => sql.includes("FROM daily_reports") && sql.includes("FOR UPDATE"),
        [[{ childId, status: "PUBLISHED" }], []], async () => {
          await expect(`/moods/${mood.moodObservationId}`, 409, "PATCH", { comment: "Concurrent" }, adminSession.cookie);
        });
      await withTransactionResult(context, (sql) => sql.includes("DELETE FROM mood_observations"),
        [{ affectedRows: 0 }, []], async () => {
          await expect(`/moods/${mood.moodObservationId}`, 404, "DELETE", undefined, adminSession.cookie);
        });
      const latest = await request<{ revision: number }>(`/reports/${reportId}`, "GET", undefined, adminSession.cookie);
      await expect(`/reports/${reportId}/publish`, 200, "POST", { revision: latest.body.revision }, adminSession.cookie);
      await expect(`/reports/${reportId}`, 409, "PATCH", { revision: latest.body.revision, parentNote: "Late" }, adminSession.cookie);
      await expect(`/naps/${nap.napId}`, 409, "DELETE", undefined, adminSession.cookie);
      await expect(`/moods/${mood.moodObservationId}`, 409, "DELETE", undefined, adminSession.cookie);
      await expect(`/diaper-changes/${change.diaperChangeId}`, 409, "DELETE", undefined, adminSession.cookie);
      await expect(`/reports/${reportId}`, 200, "GET", undefined, parentSession.cookie);
      const notifications = await request<Array<{ reportId: number }>>("/notifications", "GET", undefined, parentSession.cookie);
      assert.ok(notifications.body.some((item) => item.reportId === reportId));
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await database.end();
  }
});
