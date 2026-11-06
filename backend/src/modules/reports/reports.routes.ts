import { Router } from "express";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { AppError } from "../../errors/app-error.js";
import { toDatabaseError } from "../../errors/database-error.js";
import { database } from "../../middlewares/config/database.js";
import { actorOf, requireChildAccess, requireReportAccess, requireRole, type Actor } from "../auth/auth.js";
import { asyncHandler, parseId, readObject, rejectUnknownFields, requiredPositiveInteger, requiredString } from "../shared/http-utils.js";
import { selectRows } from "../shared/repository-utils.js";

type ReportRow = RowDataPacket & {
  reportId: number; childId: number; reportDate: string; status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  publishedAt: Date | null; summary: string | null; parentNote: string | null;
  summaryOverride: string | null; revision: number; firstName: string; lastName: string;
};
type Meal = { kind: "MAIN" | "DESSERT" | "SNACK"; intake: "ALL" | "MOST" | "LITTLE" | "NONE"; label: string | null };
type Nap = { napQualityId: number; startTime: string; endTime: string; comment: string | null; qualityLabel?: string };
type Mood = { moodId: number; observedTime: string; comment: string | null; moodLabel?: string };
type Change = { diaperChangeTypeId: number; changeTime: string; comment: string | null; typeLabel?: string };
type Content = { meals: Meal[]; activities: string[]; naps: Nap[]; moods: Mood[]; diaperChanges: Change[] };

export const reportsRouter = Router();

const reportSelect = `SELECT r.daily_report_id AS reportId, r.child_id AS childId,
  DATE_FORMAT(r.report_date, '%Y-%m-%d') AS reportDate, r.status, r.published_at AS publishedAt,
  r.summary, d.parent_note AS parentNote, d.summary_override AS summaryOverride,
  COALESCE(d.revision, 1) AS revision, c.first_name AS firstName, c.last_name AS lastName
  FROM daily_reports r JOIN children c ON c.child_id = r.child_id
  LEFT JOIN daily_report_content d ON d.daily_report_id = r.daily_report_id`;

function dateValue(value: unknown): string {
  const parsed = typeof value === "string" ? new Date(`${value}T00:00:00Z`) : new Date(NaN);
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new AppError("reportDate invalide.", 400);
  return value;
}
function timeValue(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) {
    throw new AppError(`${field} invalide.`, 400);
  }
  return value.length === 5 ? `${value}:00` : value;
}
function positive(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new AppError(`${field} invalide.`, 400);
  return value;
}
function textValue(value: unknown, field: string, max: number): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > max) throw new AppError(`${field} invalide.`, 400);
  return value.trim() || null;
}
function readArray(value: unknown, field: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new AppError(`${field} invalide.`, 400);
  return value;
}

function parseContent(body: Record<string, unknown>): Partial<Content> {
  const content: Partial<Content> = {};
  if (body.meals !== undefined) {
    const kinds = new Set<string>();
    content.meals = readArray(body.meals, "meals", 3).map((raw) => {
      const meal = readObject(raw); rejectUnknownFields(meal, ["kind", "intake", "label"]);
      if (!(["MAIN", "DESSERT", "SNACK"] as unknown[]).includes(meal.kind) || kinds.has(meal.kind as string) ||
        !(["ALL", "MOST", "LITTLE", "NONE"] as unknown[]).includes(meal.intake)) throw new AppError("Repas invalide ou dupliqué.", 400);
      kinds.add(meal.kind as string);
      return { kind: meal.kind as Meal["kind"], intake: meal.intake as Meal["intake"],
        label: textValue(meal.label ?? null, "label", 150) };
    });
  }
  if (body.activities !== undefined) {
    content.activities = readArray(body.activities, "activities", 20).map((item) => {
      if (typeof item !== "string" || !item.trim() || item.length > 100) throw new AppError("Activité invalide.", 400);
      return item.trim();
    });
    if (new Set(content.activities).size !== content.activities.length) throw new AppError("Activité dupliquée.", 400);
  }
  if (body.naps !== undefined) content.naps = readArray(body.naps, "naps", 10).map((raw) => {
    const nap = readObject(raw); rejectUnknownFields(nap, ["napQualityId", "startTime", "endTime", "comment"]);
    const startTime = timeValue(nap.startTime, "startTime");
    const endTime = timeValue(nap.endTime, "endTime");
    if (endTime <= startTime) throw new AppError("Fin de sieste avant son début.", 400);
    return { napQualityId: positive(nap.napQualityId, "napQualityId"), startTime, endTime,
      comment: textValue(nap.comment ?? null, "comment", 2000) };
  });
  if (body.moods !== undefined) content.moods = readArray(body.moods, "moods", 20).map((raw) => {
    const mood = readObject(raw); rejectUnknownFields(mood, ["moodId", "observedTime", "comment"]);
    return { moodId: positive(mood.moodId, "moodId"), observedTime: timeValue(mood.observedTime, "observedTime"),
      comment: textValue(mood.comment ?? null, "comment", 2000) };
  });
  if (body.diaperChanges !== undefined) content.diaperChanges = readArray(body.diaperChanges, "diaperChanges", 20).map((raw) => {
    const change = readObject(raw); rejectUnknownFields(change, ["diaperChangeTypeId", "changeTime", "comment"]);
    return { diaperChangeTypeId: positive(change.diaperChangeTypeId, "diaperChangeTypeId"),
      changeTime: timeValue(change.changeTime, "changeTime"), comment: textValue(change.comment ?? null, "comment", 2000) };
  });
  return content;
}

async function detail(reportId: number): Promise<ReportRow & Content & { publishedBy: Array<{ userId: number; firstName: string; lastName: string }> }> {
  const rows = await selectRows<ReportRow>(`${reportSelect} WHERE r.daily_report_id = ?`, [reportId]);
  const report = rows[0];
  if (!report) throw new AppError("Bulletin introuvable.", 404);
  const [meals, activities, naps, moods, diaperChanges, publishedBy] = await Promise.all([
    selectRows<RowDataPacket & Meal>("SELECT kind, intake, label FROM daily_report_meals WHERE daily_report_id = ? ORDER BY FIELD(kind, 'MAIN', 'DESSERT', 'SNACK')", [reportId]),
    selectRows<RowDataPacket & { label: string }>("SELECT label FROM daily_report_activities WHERE daily_report_id = ? ORDER BY label", [reportId]),
    selectRows<RowDataPacket & Nap>(`SELECT n.nap_quality_id AS napQualityId, n.start_time AS startTime,
      n.end_time AS endTime, n.comment, q.label AS qualityLabel FROM naps n
      JOIN nap_qualities q ON q.nap_quality_id = n.nap_quality_id
      WHERE n.daily_report_id = ? ORDER BY n.start_time`, [reportId]),
    selectRows<RowDataPacket & Mood>(`SELECT o.mood_id AS moodId, o.observed_time AS observedTime,
      o.comment, m.label AS moodLabel FROM mood_observations o
      JOIN moods m ON m.mood_id = o.mood_id WHERE o.daily_report_id = ? ORDER BY o.observed_time`, [reportId]),
    selectRows<RowDataPacket & Change>(`SELECT d.diaper_change_type_id AS diaperChangeTypeId,
      d.change_time AS changeTime, d.comment, t.label AS typeLabel FROM diaper_changes d
      JOIN diaper_change_types t ON t.diaper_change_type_id = d.diaper_change_type_id
      WHERE d.daily_report_id = ? ORDER BY d.change_time`, [reportId]),
    selectRows<RowDataPacket & { userId: number; firstName: string; lastName: string }>(
      `SELECT u.user_id AS userId, u.first_name AS firstName, u.last_name AS lastName
       FROM daily_report_publishers p JOIN users u ON u.user_id = p.user_id WHERE p.daily_report_id = ?`, [reportId]
    )
  ]);
  return { ...report, meals, activities: activities.map(({ label }) => label), naps, moods, diaperChanges, publishedBy };
}

export function generatedSummary(report: ReportRow & Content): string {
  const parts = [`La journée de ${report.firstName}.`];
  if (report.meals.length) parts.push(`Repas : ${report.meals.map((meal) => `${meal.label ?? meal.kind.toLowerCase()} (${({ ALL: "tout", MOST: "bien", LITTLE: "peu", NONE: "refusé" } as const)[meal.intake]})`).join(", ")}.`);
  if (report.moods.length) {
    const labels: Record<string, string> = { HAPPY: "bonne humeur", CALM: "calme", TIRED: "fatigue", SAD: "tristesse" };
    parts.push(`Humeur : ${report.moods.map((mood) => labels[mood.moodLabel ?? ""] ?? mood.moodLabel ?? "observation").join(", ")}.`);
  }
  if (report.naps.length) parts.push(`Sommeil : ${report.naps.map((nap) => `${nap.startTime.slice(0, 5)}–${nap.endTime.slice(0, 5)}`).join(", ")}.`);
  if (report.activities.length) parts.push(`Activités : ${report.activities.join(", ")}.`);
  if (report.diaperChanges.length) parts.push(`Soins : ${report.diaperChanges.length} change${report.diaperChanges.length > 1 ? "s" : ""}.`);
  if (report.parentNote) parts.push(report.parentNote);
  return parts.join(" ");
}

async function replaceRows(connection: PoolConnection, reportId: number, content: Partial<Content>): Promise<void> {
  if (content.meals) {
    await connection.execute("DELETE FROM daily_report_meals WHERE daily_report_id = ?", [reportId]);
    for (const meal of content.meals) await connection.execute(
      "INSERT INTO daily_report_meals (daily_report_id, kind, intake, label) VALUES (?, ?, ?, ?)",
      [reportId, meal.kind, meal.intake, meal.label]
    );
  }
  if (content.activities) {
    await connection.execute("DELETE FROM daily_report_activities WHERE daily_report_id = ?", [reportId]);
    for (const label of content.activities) await connection.execute(
      "INSERT INTO daily_report_activities (daily_report_id, label) VALUES (?, ?)", [reportId, label]
    );
  }
  for (const [key, table, columns] of [
    ["naps", "naps", ["nap_quality_id", "start_time", "end_time", "comment"]],
    ["moods", "mood_observations", ["mood_id", "observed_time", "comment"]],
    ["diaperChanges", "diaper_changes", ["diaper_change_type_id", "change_time", "comment"]]
  ] as const) {
    const rows = content[key];
    if (!rows) continue;
    await connection.execute(`DELETE FROM ${table} WHERE daily_report_id = ?`, [reportId]);
    for (const row of rows) {
      const values = key === "naps" ? Object.values(row as Nap) : key === "moods" ? Object.values(row as Mood) : Object.values(row as Change);
      await connection.execute(
        `INSERT INTO ${table} (daily_report_id, ${columns.join(", ")}) VALUES (?, ${columns.map(() => "?").join(", ")})`,
        [reportId, ...values]
      );
    }
  }
}

async function ownedReport(actor: Actor, id: number, write = false): Promise<void> {
  await requireReportAccess(actor, id, write);
}

reportsRouter.get("/", asyncHandler(async (request, response) => {
  const actor = actorOf(response.locals);
  const childId = request.query.childId === undefined ? null : parseId(request.query.childId);
  if (childId) await requireChildAccess(actor, childId);
  const date = request.query.date === undefined ? null : dateValue(request.query.date);
  const limit = request.query.limit === undefined ? 50 :
    typeof request.query.limit === "string" && /^\d+$/.test(request.query.limit) ? Number(request.query.limit) : NaN;
  const offset = request.query.offset === undefined ? 0 :
    typeof request.query.offset === "string" && /^\d+$/.test(request.query.offset) ? Number(request.query.offset) : NaN;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
    !Number.isSafeInteger(offset) || offset < 0 || offset > 100_000) {
    throw new AppError("Pagination invalide.", 400);
  }
  // MySQL refuse ici les placeholders LIMIT/OFFSET; ces nombres sont validés et bornés avant interpolation.
  const rows = await selectRows<ReportRow>(`${reportSelect}
    WHERE c.daycare_id = ? AND (? IS NULL OR c.child_id = ?)
      AND (? IS NULL OR r.report_date = ?)
      AND (? <> 'PARENT' OR (r.status = 'PUBLISHED' AND EXISTS
        (SELECT 1 FROM parent_child_links l WHERE l.child_id = c.child_id AND l.parent_id = ?)))
    ORDER BY r.report_date DESC, r.daily_report_id DESC LIMIT ${limit} OFFSET ${offset}`,
    [actor.daycareId, childId, childId, date, date, actor.role, actor.userId]
  );
  response.json(rows);
}));

reportsRouter.get("/:id", asyncHandler(async (request, response) => {
  const id = parseId(request.params.id);
  await ownedReport(actorOf(response.locals), id);
  response.json(await detail(id));
}));

reportsRouter.get("/:id/preview", asyncHandler(async (request, response) => {
  const id = parseId(request.params.id);
  await ownedReport(actorOf(response.locals), id);
  const report = await detail(id);
  response.json({ summary: report.summaryOverride ?? generatedSummary(report) });
}));

reportsRouter.post("/", asyncHandler(async (request, response) => {
  const actor = actorOf(response.locals);
  requireRole(actor, "DAYCARE_ADMIN", "EJE", "AUXILIARY");
  const body = readObject(request.body);
  rejectUnknownFields(body, ["childId", "reportDate"]);
  const childId = requiredPositiveInteger(body, "childId");
  await requireChildAccess(actor, childId);
  const active = await selectRows<RowDataPacket & { isActive: number }>(
    "SELECT is_active AS isActive FROM children WHERE child_id = ?", [childId]
  );
  if (!active[0]?.isActive) throw new AppError("Enfant inactif.", 409);
  const reportDate = dateValue(body.reportDate);
  const connection = await database.getConnection();
  let reportId: number;
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute<ResultSetHeader>(
      "INSERT INTO daily_reports (child_id, report_date) VALUES (?, ?)", [childId, reportDate]
    );
    reportId = result.insertId;
    await connection.execute("INSERT INTO daily_report_content (daily_report_id) VALUES (?)", [reportId]);
    await connection.execute(
      "INSERT INTO report_events (report_id, child_id, revision, status) VALUES (?, ?, 1, 'DRAFT')",
      [reportId, childId]
    );
    await connection.commit();
  } catch (error) { await connection.rollback(); throw toDatabaseError(error); }
  finally { connection.release(); }
  response.status(201).json(await detail(reportId!));
}));

reportsRouter.patch("/:id", asyncHandler(async (request, response) => {
  const actor = actorOf(response.locals);
  requireRole(actor, "DAYCARE_ADMIN", "EJE", "AUXILIARY");
  const id = parseId(request.params.id);
  await ownedReport(actor, id, true);
  const body = readObject(request.body);
  rejectUnknownFields(body, ["revision", "parentNote", "summaryOverride", "meals", "activities", "naps", "moods", "diaperChanges"]);
  const revision = requiredPositiveInteger(body, "revision");
  const parentNote = body.parentNote === undefined ? undefined : textValue(body.parentNote, "parentNote", 5000);
  const summaryOverride = body.summaryOverride === undefined ? undefined : textValue(body.summaryOverride, "summaryOverride", 10000);
  const content = parseContent(body);
  if (Object.keys(body).length === 1) throw new AppError("Aucun contenu à modifier.", 400);
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<(RowDataPacket & { status: string; revision: number })[]>(
      `SELECT r.status, d.revision FROM daily_reports r JOIN daily_report_content d
       ON d.daily_report_id = r.daily_report_id WHERE r.daily_report_id = ? FOR UPDATE`, [id]
    );
    if (rows[0]?.status !== "DRAFT") throw new AppError("Bulletin déjà publié.", 409);
    if (rows[0].revision !== revision) throw new AppError("Ce bulletin a été modifié ailleurs. Rechargez-le.", 409);
    await replaceRows(connection, id, content);
    await connection.execute(
      `UPDATE daily_report_content SET revision = revision + 1,
       parent_note = IF(? = 1, ?, parent_note), summary_override = IF(? = 1, ?, summary_override)
       WHERE daily_report_id = ?`,
      [parentNote !== undefined ? 1 : 0, parentNote ?? null,
        summaryOverride !== undefined ? 1 : 0, summaryOverride ?? null, id]
    );
    await connection.execute(
      `INSERT INTO report_events (report_id, child_id, revision, status)
       SELECT r.daily_report_id, r.child_id, d.revision, r.status
       FROM daily_reports r JOIN daily_report_content d ON d.daily_report_id = r.daily_report_id
       WHERE r.daily_report_id = ?`, [id]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw toDatabaseError(error);
  } finally { connection.release(); }
  const report = await detail(id);
  response.json(report);
}));

reportsRouter.post("/:id/publish", asyncHandler(async (request, response) => {
  const actor = actorOf(response.locals);
  requireRole(actor, "DAYCARE_ADMIN", "EJE");
  const id = parseId(request.params.id);
  await ownedReport(actor, id, true);
  const body = readObject(request.body);
  rejectUnknownFields(body, ["revision"]);
  const revision = requiredPositiveInteger(body, "revision");
  const report = await detail(id);
  const summary = report.summaryOverride ?? generatedSummary(report);
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<(RowDataPacket & { status: string; revision: number })[]>(
      `SELECT r.status, d.revision FROM daily_reports r JOIN daily_report_content d
       ON d.daily_report_id = r.daily_report_id WHERE r.daily_report_id = ? FOR UPDATE`, [id]
    );
    if (rows[0]?.status !== "DRAFT") throw new AppError("Bulletin déjà publié.", 409);
    if (rows[0].revision !== revision) throw new AppError("Ce bulletin a été modifié ailleurs. Rechargez-le.", 409);
    await connection.execute(
      "UPDATE daily_reports SET summary = ?, status = 'PUBLISHED', published_at = UTC_TIMESTAMP() WHERE daily_report_id = ?",
      [summary, id]
    );
    await connection.execute("INSERT INTO daily_report_publishers (daily_report_id, user_id) VALUES (?, ?)", [id, actor.userId]);
    await connection.execute(
      `INSERT INTO report_notifications (report_id, parent_id)
       SELECT ?, l.parent_id FROM parent_child_links l
       JOIN users u ON u.user_id = l.parent_id
       JOIN roles role ON role.role_id = u.role_id AND role.label = 'PARENT'
       WHERE l.child_id = ? AND u.is_active = 1`, [id, report.childId]
    );
    await connection.execute(
      "INSERT INTO report_events (report_id, child_id, revision, status) VALUES (?, ?, ?, 'PUBLISHED')",
      [id, report.childId, revision]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw toDatabaseError(error);
  } finally { connection.release(); }
  response.json(await detail(id));
}));
