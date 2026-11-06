import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import type { Request, RequestHandler } from "express";
import type { RowDataPacket } from "mysql2";

import { AppError } from "../../errors/app-error.js";
import { executeStatement, selectRows } from "../shared/repository-utils.js";
import { asyncHandler } from "../shared/http-utils.js";

export type Role = "DAYCARE_ADMIN" | "EJE" | "AUXILIARY" | "PARENT";
export type Actor = { userId: number; daycareId: number; role: Role; email: string; firstName: string; lastName: string };
type LoginRow = RowDataPacket & Actor & { passwordHash: string; isActive: number };

const sessionSeconds = 60 * 60 * 12;
const cookieName = "carelia_session";

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function tokenFromCookie(cookieHeader: string | undefined): string | null {
  const cookie = cookieHeader?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`));
  const token = cookie?.slice(cookieName.length + 1);
  return token && /^[a-f0-9]{64}$/i.test(token) ? token : null;
}

function readToken(request: Request): string | null {
  const bearer = request.get("authorization")?.match(/^Bearer ([a-f0-9]{64})$/i)?.[1];
  if (bearer) return bearer;
  return tokenFromCookie(request.get("cookie"));
}

export async function actorFromToken(token: string | null): Promise<Actor | null> {
  if (!token) return null;
  const rows = await selectRows<RowDataPacket & Actor & { isActive: number }>(
    `SELECT u.user_id AS userId, u.daycare_id AS daycareId, r.label AS role,
      u.email, u.first_name AS firstName, u.last_name AS lastName, u.is_active AS isActive
     FROM auth_sessions s JOIN users u ON u.user_id = s.user_id
     JOIN roles r ON r.role_id = u.role_id
     WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP(3) LIMIT 1`, [tokenHash(token)]
  );
  const row = rows[0];
  if (!row || !row.isActive) return null;
  return { userId: row.userId, daycareId: row.daycareId, role: row.role,
    email: row.email, firstName: row.firstName, lastName: row.lastName };
}

export const requireAuth: RequestHandler = asyncHandler(async (request, response, next) => {
  const actor = await actorFromToken(readToken(request));
  if (!actor) throw new AppError("Authentification requise.", 401);
  response.locals.actor = actor;
  next();
});

export function actorOf(locals: Record<string, unknown>): Actor {
  const actor = locals.actor as Actor | undefined;
  if (!actor) throw new AppError("Authentification requise.", 401);
  return actor;
}

export function requireRole(actor: Actor, ...roles: Role[]): void {
  if (!roles.includes(actor.role)) throw new AppError("Accès interdit.", 403);
}

export function requireDaycare(actor: Actor, daycareId: number): void {
  if (actor.daycareId !== daycareId) throw new AppError("Accès interdit.", 403);
}

export async function requireChildAccess(actor: Actor, childId: number): Promise<void> {
  const rows = await selectRows<RowDataPacket & { daycareId: number; linked: number }>(
    `SELECT c.daycare_id AS daycareId,
      EXISTS(SELECT 1 FROM parent_child_links l WHERE l.child_id = c.child_id AND l.parent_id = ?) AS linked
     FROM children c WHERE c.child_id = ?`, [actor.userId, childId]
  );
  const child = rows[0];
  if (!child) throw new AppError("Enfant introuvable.", 404);
  requireDaycare(actor, child.daycareId);
  if (actor.role === "PARENT" && !child.linked) throw new AppError("Accès interdit.", 403);
}

export async function requireReportAccess(actor: Actor, reportId: number, write = false): Promise<void> {
  const rows = await selectRows<RowDataPacket & { childId: number; status: string }>(
    "SELECT child_id AS childId, status FROM daily_reports WHERE daily_report_id = ?", [reportId]
  );
  const report = rows[0];
  if (!report) throw new AppError("Bulletin introuvable.", 404);
  await requireChildAccess(actor, report.childId);
  if (actor.role === "PARENT" && (write || report.status !== "PUBLISHED")) {
    throw new AppError("Accès interdit.", 403);
  }
  if (write && report.status !== "DRAFT") throw new AppError("Bulletin déjà publié.", 409);
}

export async function login(email: string, password: string): Promise<{ token: string; actor: Actor }> {
  const rows = await selectRows<LoginRow>(
    `SELECT u.user_id AS userId, u.daycare_id AS daycareId, r.label AS role,
      u.email, u.first_name AS firstName, u.last_name AS lastName,
      u.password_hash AS passwordHash, u.is_active AS isActive
     FROM users u JOIN roles r ON r.role_id = u.role_id WHERE u.email = ? LIMIT 1`, [email]
  );
  const row = rows[0];
  if (!row?.isActive || !row.passwordHash.startsWith("$2") || !await bcrypt.compare(password, row.passwordHash)) {
    throw new AppError("Identifiants invalides.", 401);
  }
  const token = randomBytes(32).toString("hex");
  await executeStatement(
    "INSERT INTO auth_sessions (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 12 HOUR))",
    [row.userId, tokenHash(token)]
  );
  const { userId, daycareId, role, firstName, lastName } = row;
  return { token, actor: { userId, daycareId, role, email: row.email, firstName, lastName } };
}

export async function logout(request: Request): Promise<void> {
  const token = readToken(request);
  if (token) await executeStatement("DELETE FROM auth_sessions WHERE token_hash = ?", [tokenHash(token)]);
}

export function sessionCookie(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${sessionSeconds}${secure}`;
}

export function clearSessionCookie(): string {
  return `${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
}
