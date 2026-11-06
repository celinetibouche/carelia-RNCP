import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import bcrypt from "bcrypt";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { app } from "./app.js";
import { database } from "./middlewares/config/database.js";
import { migrate } from "./migrate.js";

type Result<T = Record<string, unknown>> = { status: number; body: T; cookie: string | null };
async function request<T = Record<string, unknown>>(
  base: string, path: string, method = "GET", data?: unknown, cookie?: string
): Promise<Result<T>> {
  const response = await fetch(`${base}${path}`, {
    method, headers: { ...(data === undefined ? {} : { "content-type": "application/json" }),
      ...(cookie ? { cookie } : {}) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) })
  });
  return { status: response.status, body: response.status === 204 ? {} as T : await response.json() as T,
    cookie: response.headers.get("set-cookie")?.split(";")[0] ?? null };
}
function expectStatus<T>(result: Result<T>, status: number): T {
  assert.equal(result.status, status, JSON.stringify(result.body));
  return result.body;
}

test("P0 et F1 : API, MySQL, permissions et contraintes métier", async (t) => {
  await migrate();
  const suffix = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
  const hash = await bcrypt.hash("Test-Password-123!", 10);
  const [daycareResult] = await database.execute<ResultSetHeader>("INSERT INTO daycares (name) VALUES (?)", [`Integration ${suffix}`]);
  const daycareId = daycareResult.insertId;
  const [otherDaycare] = await database.execute<ResultSetHeader>("INSERT INTO daycares (name) VALUES (?)", [`Other ${suffix}`]);
  const roles = await database.query<(RowDataPacket & { roleId: number; label: string })[]>("SELECT role_id AS roleId, label FROM roles");
  const role = (name: string) => {
    const found = roles[0].find((item) => item.label === name);
    assert.ok(found, `rôle ${name}`);
    return found.roleId;
  };
  async function user(daycare: number, roleName: string, name: string) {
    const email = `${name}-${suffix}@carelia.test`;
    const [result] = await database.execute<ResultSetHeader>(
      `INSERT INTO users (daycare_id, role_id, email, password_hash, last_name, first_name)
       VALUES (?, ?, ?, ?, 'Test', ?)`, [daycare, role(roleName), email, hash, name]
    );
    return { id: result.insertId, email };
  }
  const admin = await user(daycareId, "DAYCARE_ADMIN", "admin");
  const eje = await user(daycareId, "EJE", "eje");
  const auxiliary = await user(daycareId, "AUXILIARY", "auxiliary");
  const parent = await user(daycareId, "PARENT", "parent");
  const outsider = await user(otherDaycare.insertId, "DAYCARE_ADMIN", "outsider");
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const login = async (email: string) => {
    const result = await request<{ user: { role: string } }>(base, "/auth/login", "POST", { email, password: "Test-Password-123!" });
    expectStatus(result, 200);
    assert.ok(result.cookie?.startsWith("carelia_session="));
    assert.equal("token" in result.body, false);
    return result.cookie!;
  };
  try {
    const adminCookie = await login(admin.email);
    const ejeCookie = await login(eje.email);
    const auxCookie = await login(auxiliary.email);
    const parentCookie = await login(parent.email);
    const outsideCookie = await login(outsider.email);

    await t.test("session, santé, documentation et accès non authentifié", async () => {
      expectStatus(await request(base, "/health"), 200);
      expectStatus(await request(base, "/users"), 401);
      expectStatus(await request(base, "/reports"), 401);
      expectStatus(await request(base, "/auth/login", "POST", { email: admin.email, password: "wrong" }), 401);
      expectStatus(await request(base, "/auth/me", "GET", undefined, adminCookie), 200);
      const spec = expectStatus(await request<{ paths: Record<string, unknown>; components: { securitySchemes: object } }>(base, "/docs/openapi.json"), 200);
      for (const path of ["/api/auth/login", "/api/auth/me", "/api/children", "/api/reports", "/api/references", "/api/notifications", "/api/notifications/{id}/read", "/api/reports/{id}/publish"]) assert.ok(spec.paths[path], path);
      assert.ok("cookieAuth" in spec.components.securitySchemes);
      assert.equal("bearerAuth" in spec.components.securitySchemes, false);
      const swagger = await fetch(`${base}/docs/`);
      assert.equal(swagger.status, 200);
      const swaggerInit = await (await fetch(`${base}/docs/swagger-ui-init.js`)).text();
      assert.match(swaggerInit, /"withCredentials": true/);
      expectStatus(await request(base, "/auth/logout", "POST", undefined, outsideCookie), 204);
      expectStatus(await request(base, "/auth/me", "GET", undefined, outsideCookie), 401);
    });

    await t.test("utilisateurs et crèches restent bornés à la crèche courante", async () => {
      const users = expectStatus(await request<Array<{ userId: number }>>(base, "/users", "GET", undefined, adminCookie), 200);
      assert.ok(users.some((item) => item.userId === admin.id));
      assert.ok(!users.some((item) => item.userId === outsider.id));
      expectStatus(await request(base, "/users", "GET", undefined, parentCookie), 403);
      expectStatus(await request(base, `/users/${outsider.id}`, "GET", undefined, adminCookie), 403);
      expectStatus(await request(base, "/users", "POST", { daycareId: otherDaycare.insertId, roleId: role("PARENT"), email: `cross-${suffix}@test.com`, password: "Password123!", firstName: "A", lastName: "B" }, adminCookie), 403);
      const created = expectStatus(await request<{ userId: number }>(base, "/users", "POST", {
        daycareId, roleId: role("PARENT"), email: `new-${suffix}@carelia.test`, password: "Password123!", firstName: "New", lastName: "Parent"
      }, adminCookie), 201);
      const [stored] = await database.execute<(RowDataPacket & { passwordHash: string })[]>("SELECT password_hash AS passwordHash FROM users WHERE user_id = ?", [created.userId]);
      assert.notEqual(stored[0]?.passwordHash, "Password123!");
      assert.equal(await bcrypt.compare("Password123!", stored[0]!.passwordHash), true);
      expectStatus(await request(base, `/users/${created.userId}`, "PATCH", { firstName: "Changed" }, adminCookie), 200);
      expectStatus(await request(base, `/users/${created.userId}`, "DELETE", undefined, adminCookie), 204);
      expectStatus(await request(base, `/users/${created.userId}`, "GET", undefined, adminCookie), 404);
      expectStatus(await request(base, "/daycares", "POST", { name: "Another" }, adminCookie), 403);
      const daycares = expectStatus(await request<Array<{ daycareId: number }>>(base, "/daycares", "GET", undefined, adminCookie), 200);
      assert.deepEqual(daycares.map((item) => item.daycareId), [daycareId]);
    });

    const child = expectStatus(await request<{ childId: number }>(base, "/children", "POST", {
      firstName: "Lina", lastName: "Test", birthDate: "2023-05-14", groupName: "Petits"
    }, adminCookie), 201);
    const childId = child.childId;
    const otherChild = expectStatus(await request<{ childId: number }>(base, "/children", "POST", {
      firstName: "Noa", lastName: "Test", birthDate: "2024-01-15"
    }, adminCookie), 201);

    await t.test("enfants, lien parent et références", async () => {
      expectStatus(await request(base, `/children/${childId}`, "GET", undefined, outsideCookie), 401);
      expectStatus(await request(base, `/children/${childId}`, "GET", undefined, parentCookie), 403);
      expectStatus(await request(base, "/children", "POST", { firstName: "X", lastName: "Y", birthDate: "2024-01-01" }, auxCookie), 403);
      expectStatus(await request(base, `/children/${childId}`, "PATCH", { groupName: "Moyens" }, ejeCookie), 200);
      expectStatus(await request(base, `/children/${childId}/parents/${parent.id}`, "PUT", { relationship: "PARENT" }, adminCookie), 204);
      const parents = expectStatus(await request<Array<{ userId: number }>>(base, `/children/${childId}/parents`, "GET", undefined, auxCookie), 200);
      assert.equal(parents[0]?.userId, parent.id);
      const visible = expectStatus(await request<Array<{ childId: number }>>(base, "/children", "GET", undefined, parentCookie), 200);
      assert.deepEqual(visible.map((item) => item.childId), [childId]);
      expectStatus(await request(base, `/children/${otherChild.childId}`, "GET", undefined, parentCookie), 403);
      const references = expectStatus(await request<{ roles: Array<{ label: string }>; moods: object[] }>(base, "/references", "GET", undefined, auxCookie), 200);
      assert.ok(references.roles.some((item) => item.label === "EJE"));
      assert.ok(references.moods.length);
    });

    await t.test("validations enfant, lien et crèche sans écriture partielle", async () => {
      expectStatus(await request(base, "/children", "POST", { firstName: "Erreur", lastName: "Date", birthDate: "2026-02-31" }, adminCookie), 400);
      expectStatus(await request(base, `/children/${childId}`, "PATCH", { firstName: "Altéré", groupName: "x".repeat(101) }, adminCookie), 400);
      const unchanged = expectStatus(await request<{ firstName: string; groupName: string }>(base, `/children/${childId}`, "GET", undefined, adminCookie), 200);
      assert.equal(unchanged.firstName, "Lina");
      assert.equal(unchanged.groupName, "Moyens");
      expectStatus(await request(base, `/children/${childId}/parents/${outsider.id}`, "PUT", { relationship: "PARENT" }, adminCookie), 400);
      expectStatus(await request(base, `/children/${childId}/parents/${parent.id}`, "PUT", { relationship: "RESPONSABLE" }, adminCookie), 204);
      const parents = expectStatus(await request<Array<{ relationship: string }>>(base, `/children/${childId}/parents`, "GET", undefined, adminCookie), 200);
      assert.deepEqual(parents.map((item) => item.relationship), ["RESPONSABLE"]);
      expectStatus(await request(base, `/children/${childId}/parents`, "GET", undefined, parentCookie), 403);
      const searched = expectStatus(await request<Array<{ childId: number }>>(base, "/children?search=Lina", "GET", undefined, adminCookie), 200);
      assert.deepEqual(searched.map((item) => item.childId), [childId]);
      const grouped = expectStatus(await request<Array<{ childId: number }>>(base, "/children?groupName=Moyens&active=true", "GET", undefined, adminCookie), 200);
      assert.deepEqual(grouped.map((item) => item.childId), [childId]);
      const hiddenGroup = expectStatus(await request<Array<{ childId: number }>>(base, "/children?groupName=Petits", "GET", undefined, parentCookie), 200);
      assert.deepEqual(hiddenGroup, []);
      expectStatus(await request(base, "/children?active=maybe", "GET", undefined, adminCookie), 400);
      expectStatus(await request(base, `/children?groupName=${"x".repeat(101)}`, "GET", undefined, adminCookie), 400);
      expectStatus(await request(base, "/children?search=Lina&search=Noa", "GET", undefined, adminCookie), 400);
      expectStatus(await request(base, `/children/${otherChild.childId}`, "PATCH", { isActive: false }, adminCookie), 200);
      const inactive = expectStatus(await request<Array<{ childId: number }>>(base, "/children?active=false", "GET", undefined, adminCookie), 200);
      assert.deepEqual(inactive.map((item) => item.childId), [otherChild.childId]);
      expectStatus(await request(base, "/reports", "POST", { childId: otherChild.childId, reportDate: "2026-10-19" }, auxCookie), 409);
      expectStatus(await request(base, `/children/${otherChild.childId}`, "PATCH", { isActive: true }, adminCookie), 200);
      expectStatus(await request(base, `/daycares/${daycareId}`, "GET", undefined, parentCookie), 200);
      expectStatus(await request(base, `/daycares/${otherDaycare.insertId}`, "GET", undefined, adminCookie), 403);
      expectStatus(await request(base, `/daycares/${daycareId}`, "PATCH", { name: `Renamed ${suffix}` }, adminCookie), 200);
      expectStatus(await request(base, `/daycares/${daycareId}`, "DELETE", undefined, adminCookie), 409);
    });

    const reportDate = "2026-10-21";
    const report = expectStatus(await request<{ reportId: number; revision: number }>(base, "/reports", "POST", { childId, reportDate }, auxCookie), 201);
    await t.test("brouillon unique, saisie structurée et révisions", async () => {
      expectStatus(await request(base, "/reports", "POST", { childId, reportDate }, auxCookie), 409);
      const byDate = expectStatus(await request<Array<{ reportId: number }>>(base, `/reports?childId=${childId}&date=${reportDate}&limit=1`, "GET", undefined, auxCookie), 200);
      assert.deepEqual(byDate.map((item) => item.reportId), [report.reportId]);
      expectStatus(await request(base, "/reports?limit=0", "GET", undefined, auxCookie), 400);
      expectStatus(await request(base, `/reports/${report.reportId}`, "GET", undefined, parentCookie), 403);
      expectStatus(await request(base, `/reports/${report.reportId}`, "GET", undefined, outsideCookie), 401);
      expectStatus(await request(base, `/reports/${report.reportId}`, "PATCH", { revision: 1, naps: [{ napQualityId: 1, startTime: "14:00", endTime: "13:00" }] }, auxCookie), 400);
      const saved = expectStatus(await request<{ revision: number; meals: object[]; moods: object[]; diaperChanges: object[] }>(base, `/reports/${report.reportId}`, "PATCH", {
        revision: 1, parentNote: "Une belle journée.", meals: [{ kind: "MAIN", intake: "MOST", label: "Purée" }],
        activities: ["Peinture", "Musique"], naps: [{ napQualityId: 1, startTime: "13:00", endTime: "14:00", comment: null }],
        moods: [{ moodId: 1, observedTime: "09:00", comment: null }],
        diaperChanges: [{ diaperChangeTypeId: 1, changeTime: "11:00", comment: null }]
      }, auxCookie), 200);
      assert.equal(saved.revision, 2);
      assert.equal(saved.meals.length, 1);
      assert.equal(saved.moods.length, 1);
      assert.equal(saved.diaperChanges.length, 1);
      expectStatus(await request(base, `/reports/${report.reportId}`, "PATCH", { revision: 1, parentNote: "Écrasement" }, auxCookie), 409);
      const preview = expectStatus(await request<{ summary: string }>(base, `/reports/${report.reportId}/preview`, "GET", undefined, ejeCookie), 200);
      assert.match(preview.summary, /Purée/);
      assert.match(preview.summary, /Humeur/);
      assert.match(preview.summary, /Sommeil/);
      assert.match(preview.summary, /Soins/);
      const naps = expectStatus(await request<Array<{ napId: number; dailyReportId: number }>>(base, "/naps", "GET", undefined, auxCookie), 200);
      assert.ok(naps.some((item) => item.dailyReportId === report.reportId));
      const nap = naps.find((item) => item.dailyReportId === report.reportId)!;
      expectStatus(await request(base, `/naps/${nap.napId}`, "PATCH", { startTime: "15:00" }, parentCookie), 403);
    });

    await t.test("anciens CRUD : transaction, révision, validations et verrouillage", async () => {
      const legacy = expectStatus(await request<{ reportId: number }>(base, "/reports", "POST", {
        childId: otherChild.childId, reportDate: "2026-10-20"
      }, auxCookie), 201);
      const nap = expectStatus(await request<{ napId: number }>(base, "/naps", "POST", {
        dailyReportId: legacy.reportId, napQualityId: 1, startTime: "12:00", endTime: "13:00"
      }, auxCookie), 201);
      expectStatus(await request(base, `/naps/${nap.napId}`, "GET", undefined, auxCookie), 200);
      expectStatus(await request(base, `/naps/${nap.napId}`, "PATCH", { endTime: "13:30" }, auxCookie), 200);
      expectStatus(await request(base, `/naps/${nap.napId}`, "PATCH", { startTime: "14:00" }, auxCookie), 400);
      expectStatus(await request(base, "/naps", "POST", { dailyReportId: legacy.reportId, napQualityId: 999999999, startTime: "12:00", endTime: "13:00" }, auxCookie), 400);
      const extraNap = expectStatus(await request<{ napId: number }>(base, "/naps", "POST", {
        dailyReportId: legacy.reportId, napQualityId: 1, startTime: "14:00", endTime: "15:00"
      }, auxCookie), 201);
      expectStatus(await request(base, `/naps/${extraNap.napId}`, "DELETE", undefined, auxCookie), 204);

      const mood = expectStatus(await request<{ moodObservationId: number }>(base, "/moods", "POST", {
        dailyReportId: legacy.reportId, moodId: 1, observedTime: "09:00"
      }, auxCookie), 201);
      expectStatus(await request(base, `/moods/${mood.moodObservationId}`, "GET", undefined, auxCookie), 200);
      expectStatus(await request(base, `/moods/${mood.moodObservationId}`, "PATCH", { observedTime: "09:30", comment: "Calme" }, auxCookie), 200);
      expectStatus(await request(base, "/moods", "POST", { dailyReportId: legacy.reportId, moodId: 999999999, observedTime: "09:00" }, auxCookie), 400);
      const extraMood = expectStatus(await request<{ moodObservationId: number }>(base, "/moods", "POST", {
        dailyReportId: legacy.reportId, moodId: 1, observedTime: "10:00"
      }, auxCookie), 201);
      expectStatus(await request(base, `/moods/${extraMood.moodObservationId}`, "DELETE", undefined, auxCookie), 204);

      const change = expectStatus(await request<{ diaperChangeId: number }>(base, "/diaper-changes", "POST", {
        dailyReportId: legacy.reportId, diaperChangeTypeId: 1, changeTime: "11:00"
      }, auxCookie), 201);
      expectStatus(await request(base, `/diaper-changes/${change.diaperChangeId}`, "GET", undefined, auxCookie), 200);
      expectStatus(await request(base, `/diaper-changes/${change.diaperChangeId}`, "PATCH", { changeTime: "11:15" }, auxCookie), 200);
      expectStatus(await request(base, "/diaper-changes", "POST", { dailyReportId: legacy.reportId, diaperChangeTypeId: 999999999, changeTime: "11:00" }, auxCookie), 400);
      const extraChange = expectStatus(await request<{ diaperChangeId: number }>(base, "/diaper-changes", "POST", {
        dailyReportId: legacy.reportId, diaperChangeTypeId: 1, changeTime: "16:00"
      }, auxCookie), 201);
      expectStatus(await request(base, `/diaper-changes/${extraChange.diaperChangeId}`, "DELETE", undefined, auxCookie), 204);

      const revised = expectStatus(await request<{ revision: number }>(base, `/reports/${legacy.reportId}`, "GET", undefined, auxCookie), 200);
      assert.equal(revised.revision, 13);
      const [events] = await database.execute<(RowDataPacket & { revision: number })[]>(
        "SELECT revision FROM report_events WHERE report_id = ? ORDER BY event_id DESC LIMIT 1", [legacy.reportId]
      );
      assert.equal(events[0]?.revision, revised.revision);
      expectStatus(await request(base, `/reports/${legacy.reportId}/publish`, "POST", { revision: revised.revision }, ejeCookie), 200);
      expectStatus(await request(base, `/naps/${nap.napId}`, "PATCH", { comment: "Tardif" }, auxCookie), 409);
      expectStatus(await request(base, `/moods/${mood.moodObservationId}`, "DELETE", undefined, auxCookie), 409);
      expectStatus(await request(base, "/diaper-changes", "POST", { dailyReportId: legacy.reportId, diaperChangeTypeId: 1, changeTime: "17:00" }, auxCookie), 409);
      expectStatus(await request(base, `/naps/${nap.napId}`, "GET", undefined, parentCookie), 403);
    });

    await t.test("publication réservée, parent lié et contenu figé", async () => {
      expectStatus(await request(base, `/reports/${report.reportId}/publish`, "POST", { revision: 2 }, auxCookie), 403);
      const published = expectStatus(await request<{ status: string; summary: string; publishedAt: string }>(base, `/reports/${report.reportId}/publish`, "POST", { revision: 2 }, ejeCookie), 200);
      assert.equal(published.status, "PUBLISHED");
      assert.match(published.summary, /Purée/);
      assert.ok(published.publishedAt);
      expectStatus(await request(base, `/reports/${report.reportId}/publish`, "POST", { revision: 2 }, ejeCookie), 409);
      expectStatus(await request(base, `/reports/${report.reportId}`, "PATCH", { revision: 2, parentNote: "Tardif" }, auxCookie), 409);
      const parentReport = expectStatus(await request<{ reportId: number }>(base, `/reports/${report.reportId}`, "GET", undefined, parentCookie), 200);
      assert.equal(parentReport.reportId, report.reportId);
      const notifications = expectStatus(await request<Array<{ notificationId: number; reportId: number; readAt: string | null }>>(base, "/notifications", "GET", undefined, parentCookie), 200);
      const notification = notifications.find((item) => item.reportId === report.reportId);
      assert.ok(notification);
      assert.equal(notification.readAt, null);
      expectStatus(await request(base, "/notifications", "GET", undefined, auxCookie), 403);
      expectStatus(await request(base, `/notifications/${notification.notificationId}/read`, "PATCH", undefined, auxCookie), 403);
      expectStatus(await request(base, "/notifications/999999999/read", "PATCH", undefined, parentCookie), 404);
      expectStatus(await request(base, `/notifications/${notification.notificationId}/read`, "PATCH", undefined, parentCookie), 204);
      expectStatus(await request(base, `/notifications/${notification.notificationId}/read`, "PATCH", undefined, parentCookie), 204);
      const read = expectStatus(await request<Array<{ notificationId: number; readAt: string | null }>>(base, "/notifications", "GET", undefined, parentCookie), 200);
      assert.ok(read.find((item) => item.notificationId === notification.notificationId)?.readAt);
      const visible = expectStatus(await request<Array<{ reportId: number }>>(base, "/reports", "GET", undefined, parentCookie), 200);
      assert.ok(visible.some((item) => item.reportId === report.reportId));
      expectStatus(await request(base, `/children/${childId}/parents/${parent.id}`, "DELETE", undefined, adminCookie), 204);
      expectStatus(await request(base, `/reports/${report.reportId}`, "GET", undefined, parentCookie), 403);
      const hidden = expectStatus(await request<Array<{ reportId: number }>>(base, "/notifications", "GET", undefined, parentCookie), 200);
      assert.ok(!hidden.some((item) => item.reportId === report.reportId));
      expectStatus(await request(base, `/notifications/${notification.notificationId}/read`, "PATCH", undefined, parentCookie), 404);
      expectStatus(await request(base, `/children/${childId}/parents/${parent.id}`, "PUT", { relationship: "PARENT" }, adminCookie), 204);
      expectStatus(await request(base, `/reports/${report.reportId}`, "GET", undefined, parentCookie), 200);
      expectStatus(await request(base, `/reports/${report.reportId}`, "GET", undefined, outsideCookie), 401);
      const [publisher] = await database.execute<(RowDataPacket & { userId: number })[]>("SELECT user_id AS userId FROM daily_report_publishers WHERE daily_report_id = ?", [report.reportId]);
      assert.equal(publisher[0]?.userId, eje.id);
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await database.end();
  }
});
