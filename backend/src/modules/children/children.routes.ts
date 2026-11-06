import { Router } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { AppError } from "../../errors/app-error.js";
import { toDatabaseError } from "../../errors/database-error.js";
import { database } from "../../middlewares/config/database.js";
import { actorOf, requireChildAccess, requireRole } from "../auth/auth.js";
import { asyncHandler, optionalBoolean, optionalString, parseId, readObject, rejectUnknownFields, requiredString } from "../shared/http-utils.js";
import { executeStatement, selectRows } from "../shared/repository-utils.js";

type Child = RowDataPacket & {
  childId: number; daycareId: number; firstName: string; lastName: string;
  birthDate: string; isActive: number; groupName: string | null;
  emergencyContactName: string | null; emergencyContactPhone: string | null;
};
const columns = `c.child_id AS childId, c.daycare_id AS daycareId, c.first_name AS firstName,
  c.last_name AS lastName, DATE_FORMAT(c.birth_date, '%Y-%m-%d') AS birthDate,
  c.is_active AS isActive, d.group_name AS groupName,
  d.emergency_contact_name AS emergencyContactName,
  d.emergency_contact_phone AS emergencyContactPhone`;

async function findChild(id: number): Promise<Child | null> {
  return (await selectRows<Child>(`SELECT ${columns} FROM children c LEFT JOIN child_details d ON d.child_id = c.child_id WHERE c.child_id = ?`, [id]))[0] ?? null;
}

function toChild(child: Child) {
  return { ...child, isActive: Boolean(child.isActive) };
}

function readDate(value: unknown): string {
  const parsed = typeof value === "string" ? new Date(`${value}T00:00:00Z`) : new Date(NaN);
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new AppError("birthDate invalide.", 400);
  return value;
}

export const childrenRouter = Router();

childrenRouter.get("/", asyncHandler(async (request, response) => {
  const actor = actorOf(response.locals);
  if (request.query.search !== undefined && typeof request.query.search !== "string") {
    throw new AppError("Recherche invalide.", 400);
  }
  const search = (request.query.search ?? "").trim();
  if (search.length > 100) throw new AppError("Recherche trop longue.", 400);
  if (request.query.groupName !== undefined && typeof request.query.groupName !== "string") {
    throw new AppError("Groupe invalide.", 400);
  }
  const groupName = request.query.groupName?.trim() || null;
  if (groupName && groupName.length > 100) throw new AppError("Groupe invalide.", 400);
  const active = request.query.active;
  if (active !== undefined && active !== "true" && active !== "false") {
    throw new AppError("État actif invalide.", 400);
  }
  const children = await selectRows<Child>(
    `SELECT ${columns} FROM children c LEFT JOIN child_details d ON d.child_id = c.child_id
     WHERE c.daycare_id = ? AND (? <> 'PARENT' OR EXISTS
       (SELECT 1 FROM parent_child_links l WHERE l.child_id = c.child_id AND l.parent_id = ?))
       AND (CONCAT(c.first_name, ' ', c.last_name) LIKE ? OR ? = '')
       AND (? IS NULL OR d.group_name = ?)
       AND (? IS NULL OR c.is_active = ?)
     ORDER BY c.last_name, c.first_name`,
    [actor.daycareId, actor.role, actor.userId, `%${search}%`, search,
      groupName, groupName, active === undefined ? null : Number(active === "true"),
      active === undefined ? null : Number(active === "true")]
  );
  response.json(children.map(toChild));
}));

childrenRouter.get("/:id", asyncHandler(async (request, response) => {
  const id = parseId(request.params.id);
  await requireChildAccess(actorOf(response.locals), id);
  const child = await findChild(id);
  if (!child) throw new AppError("Enfant introuvable.", 404);
  response.json(toChild(child));
}));

childrenRouter.post("/", asyncHandler(async (request, response) => {
  const actor = actorOf(response.locals);
  requireRole(actor, "DAYCARE_ADMIN", "EJE");
  const body = readObject(request.body);
  rejectUnknownFields(body, ["firstName", "lastName", "birthDate", "groupName", "emergencyContactName", "emergencyContactPhone"]);
  const values = [requiredString(body, "firstName", 100), requiredString(body, "lastName", 100), readDate(body.birthDate)];
  const details = [optionalString(body, "groupName", 100, true) ?? null,
    optionalString(body, "emergencyContactName", 150, true) ?? null,
    optionalString(body, "emergencyContactPhone", 30, true) ?? null];
  const connection = await database.getConnection();
  let childId: number;
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute<ResultSetHeader>(
      "INSERT INTO children (daycare_id, first_name, last_name, birth_date) VALUES (?, ?, ?, ?)",
      [actor.daycareId, ...values]
    );
    childId = result.insertId;
    await connection.execute(
      "INSERT INTO child_details (child_id, group_name, emergency_contact_name, emergency_contact_phone) VALUES (?, ?, ?, ?)",
      [childId, ...details]
    );
    await connection.commit();
  } catch (error) { await connection.rollback(); throw toDatabaseError(error); }
  finally { connection.release(); }
  response.status(201).json(toChild((await findChild(childId!))!));
}));

childrenRouter.patch("/:id", asyncHandler(async (request, response) => {
  const actor = actorOf(response.locals);
  requireRole(actor, "DAYCARE_ADMIN", "EJE");
  const id = parseId(request.params.id);
  await requireChildAccess(actor, id);
  const body = readObject(request.body);
  rejectUnknownFields(body, ["firstName", "lastName", "birthDate", "isActive", "groupName", "emergencyContactName", "emergencyContactPhone"]);
  if (!Object.keys(body).length) throw new AppError("Au moins une valeur doit être fournie.", 400);
  const fields: string[] = [];
  const values: Array<string | number> = [];
  for (const [key, column] of [["firstName", "first_name"], ["lastName", "last_name"]] as const) {
    if (body[key] !== undefined) { fields.push(`${column} = ?`); values.push(requiredString(body, key, 100)); }
  }
  if (body.birthDate !== undefined) { fields.push("birth_date = ?"); values.push(readDate(body.birthDate)); }
  const isActive = optionalBoolean(body, "isActive");
  if (isActive !== undefined) { fields.push("is_active = ?"); values.push(isActive ? 1 : 0); }
  const details = ["groupName", "emergencyContactName", "emergencyContactPhone"] as const;
  const parsed = details.map((key) => optionalString(body, key, key === "groupName" ? 100 : key === "emergencyContactName" ? 150 : 30, true));
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    if (fields.length) await connection.execute(`UPDATE children SET ${fields.join(", ")} WHERE child_id = ?`, [...values, id]);
    if (details.some((key) => body[key] !== undefined)) {
      await connection.execute(
        `INSERT INTO child_details (child_id, group_name, emergency_contact_name, emergency_contact_phone)
         VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE
         group_name = IF(? = 1, VALUES(group_name), group_name),
         emergency_contact_name = IF(? = 1, VALUES(emergency_contact_name), emergency_contact_name),
         emergency_contact_phone = IF(? = 1, VALUES(emergency_contact_phone), emergency_contact_phone)`,
        [id, parsed[0] ?? null, parsed[1] ?? null, parsed[2] ?? null,
          body.groupName !== undefined ? 1 : 0, body.emergencyContactName !== undefined ? 1 : 0,
          body.emergencyContactPhone !== undefined ? 1 : 0]
      );
    }
    await connection.commit();
  } catch (error) { await connection.rollback(); throw toDatabaseError(error); }
  finally { connection.release(); }
  response.json(toChild((await findChild(id))!));
}));

childrenRouter.get("/:id/parents", asyncHandler(async (request, response) => {
  const actor = actorOf(response.locals);
  requireRole(actor, "DAYCARE_ADMIN", "EJE", "AUXILIARY");
  const id = parseId(request.params.id);
  await requireChildAccess(actor, id);
  response.json(await selectRows(
    `SELECT u.user_id AS userId, u.first_name AS firstName, u.last_name AS lastName,
      u.email, l.relationship FROM parent_child_links l JOIN users u ON u.user_id = l.parent_id
     WHERE l.child_id = ?`, [id]
  ));
}));

childrenRouter.put("/:id/parents/:parentId", asyncHandler(async (request, response) => {
  const actor = actorOf(response.locals);
  requireRole(actor, "DAYCARE_ADMIN");
  const id = parseId(request.params.id);
  const parentId = parseId(request.params.parentId);
  await requireChildAccess(actor, id);
  const parent = await selectRows<RowDataPacket & { daycareId: number; role: string; isActive: number }>(
    "SELECT u.daycare_id AS daycareId, r.label AS role, u.is_active AS isActive FROM users u JOIN roles r ON r.role_id = u.role_id WHERE u.user_id = ?", [parentId]
  );
  if (!parent[0] || parent[0].daycareId !== actor.daycareId || parent[0].role !== "PARENT" || !parent[0].isActive) {
    throw new AppError("Parent introuvable dans cette crèche.", 400);
  }
  const body = readObject(request.body);
  rejectUnknownFields(body, ["relationship"]);
  await executeStatement(
    `INSERT INTO parent_child_links (child_id, parent_id, relationship) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE relationship = VALUES(relationship)`,
    [id, parentId, requiredString(body, "relationship", 50)]
  );
  response.status(204).send();
}));

childrenRouter.delete("/:id/parents/:parentId", asyncHandler(async (request, response) => {
  const actor = actorOf(response.locals);
  requireRole(actor, "DAYCARE_ADMIN");
  const id = parseId(request.params.id);
  await requireChildAccess(actor, id);
  const result = await executeStatement("DELETE FROM parent_child_links WHERE child_id = ? AND parent_id = ?", [id, parseId(request.params.parentId)]);
  if (!result.affectedRows) throw new AppError("Lien introuvable.", 404);
  response.status(204).send();
}));
