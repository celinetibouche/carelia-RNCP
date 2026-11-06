import type { RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { AppError } from "../../errors/app-error.js";
import { toDatabaseError } from "../../errors/database-error.js";
import { database } from "../../middlewares/config/database.js";
import { requireReportAccess, requireRole, type Actor } from "../auth/auth.js";
import { selectRows } from "./repository-utils.js";

export async function ensureObservationWrite(actor: Actor, reportId: number, newReportId?: number): Promise<void> {
  requireRole(actor, "DAYCARE_ADMIN", "EJE", "AUXILIARY");
  await requireReportAccess(actor, reportId, true);
  if (newReportId !== undefined && newReportId !== reportId) {
    throw new AppError("Déplacer une observation vers un autre bulletin est interdit.", 400);
  }
}

export async function mutateDraft<T>(
  actor: Actor, reportId: number, mutation: (connection: PoolConnection) => Promise<T>, newReportId?: number
): Promise<T> {
  await ensureObservationWrite(actor, reportId, newReportId);
  const connection = await database.getConnection();
  let result: T;
  let childId: number;
  let revision: number;
  try {
    await connection.beginTransaction();
    const rows = await selectRows<RowDataPacket & { childId: number; status: string }>(
      "SELECT child_id AS childId, status FROM daily_reports WHERE daily_report_id = ? FOR UPDATE", [reportId], connection
    );
    if (rows[0]?.status !== "DRAFT") throw new AppError("Bulletin déjà publié.", 409);
    childId = rows[0].childId;
    result = await mutation(connection);
    if (!result) throw new AppError("Observation introuvable.", 404);
    await connection.execute(
      "UPDATE daily_report_content SET revision = revision + 1 WHERE daily_report_id = ?", [reportId]
    );
    const revised = await selectRows<RowDataPacket & { revision: number }>(
      "SELECT revision FROM daily_report_content WHERE daily_report_id = ?", [reportId], connection
    );
    revision = revised[0]!.revision;
    await connection.execute(
      "INSERT INTO report_events (report_id, child_id, revision, status) VALUES (?, ?, ?, 'DRAFT')",
      [reportId, childId, revision]
    );
    await connection.commit();
  } catch (error) { await connection.rollback(); throw toDatabaseError(error); }
  finally { connection.release(); }
  return result!;
}
