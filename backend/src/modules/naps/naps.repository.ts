import type { RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";

import { AppError } from "../../errors/app-error.js";
import type { Actor } from "../auth/auth.js";
import {
  ensureReferenceExists,
  executeStatement,
  normalizeTime,
  requireUpdate,
  selectRows,
  type SqlValue
} from "../shared/repository-utils.js";

export type Nap = {
  napId: number;
  dailyReportId: number;
  napQualityId: number;
  startTime: string;
  endTime: string;
  comment: string | null;
};
export type CreateNapInput = Omit<Nap, "napId">;
export type UpdateNapInput = Partial<CreateNapInput>;
type NapRow = RowDataPacket & Nap;
const columns = `nap_id AS napId, daily_report_id AS dailyReportId,
  nap_quality_id AS napQualityId, start_time AS startTime, end_time AS endTime, comment`;

export async function listNaps(actor: Actor): Promise<Nap[]> {
  return selectRows<NapRow>(
    `SELECT ${columns} FROM naps WHERE daily_report_id IN (
       SELECT r.daily_report_id FROM daily_reports r JOIN children c ON c.child_id = r.child_id
       WHERE c.daycare_id = ? AND (? <> 'PARENT' OR (r.status = 'PUBLISHED' AND EXISTS
         (SELECT 1 FROM parent_child_links l WHERE l.child_id = c.child_id AND l.parent_id = ?))))
     ORDER BY nap_id DESC`, [actor.daycareId, actor.role, actor.userId]
  );
}

export async function findNapById(id: number, connection?: PoolConnection): Promise<Nap | null> {
  const rows = await selectRows<NapRow>(`SELECT ${columns} FROM naps WHERE nap_id = ?`, [id], connection);
  return rows[0] ?? null;
}

export async function createNap(input: CreateNapInput, connection?: PoolConnection): Promise<Nap | null> {
  await Promise.all([
    ensureReferenceExists("daily_reports", "daily_report_id", input.dailyReportId, "Bulletin quotidien", connection),
    ensureReferenceExists("nap_qualities", "nap_quality_id", input.napQualityId, "Qualité de sieste", connection)
  ]);

  const result = await executeStatement(
    `INSERT INTO naps (daily_report_id, nap_quality_id, start_time, end_time, comment)
     VALUES (?, ?, ?, ?, ?)`,
    [input.dailyReportId, input.napQualityId, input.startTime, input.endTime, input.comment], connection
  );
  return findNapById(result.insertId, connection);
}

export async function updateNap(id: number, input: UpdateNapInput, connection?: PoolConnection): Promise<Nap | null> {
  await Promise.all([
    input.dailyReportId !== undefined
      ? ensureReferenceExists("daily_reports", "daily_report_id", input.dailyReportId, "Bulletin quotidien", connection)
      : undefined,
    input.napQualityId !== undefined
      ? ensureReferenceExists("nap_qualities", "nap_quality_id", input.napQualityId, "Qualité de sieste", connection)
      : undefined
  ]);

  // Un PATCH partiel (un seul des deux horaires) doit être comparé à la valeur déjà en
  // base, sinon on laisse passer une incohérence jusqu'à la contrainte SQL.
  if (input.startTime !== undefined || input.endTime !== undefined) {
    const current = await findNapById(id, connection);
    if (current) {
      const startTime = normalizeTime(input.startTime ?? current.startTime);
      const endTime = normalizeTime(input.endTime ?? current.endTime);
      if (endTime <= startTime) {
        throw new AppError("endTime doit être postérieure à startTime.", 400);
      }
    }
  }

  const fields: string[] = [];
  const values: SqlValue[] = [];
  const updates: Array<[keyof UpdateNapInput, string]> = [
    ["dailyReportId", "daily_report_id"], ["napQualityId", "nap_quality_id"],
    ["startTime", "start_time"], ["endTime", "end_time"], ["comment", "comment"]
  ];
  for (const [key, column] of updates) {
    if (input[key] !== undefined) {
      fields.push(`${column} = ?`);
      values.push(input[key] as SqlValue);
    }
  }
  requireUpdate(fields);
  values.push(id);
  await executeStatement(`UPDATE naps SET ${fields.join(", ")} WHERE nap_id = ?`, values, connection);
  return findNapById(id, connection);
}

export async function deleteNap(id: number, connection?: PoolConnection): Promise<boolean> {
  const result = await executeStatement("DELETE FROM naps WHERE nap_id = ?", [id], connection);
  return result.affectedRows > 0;
}
