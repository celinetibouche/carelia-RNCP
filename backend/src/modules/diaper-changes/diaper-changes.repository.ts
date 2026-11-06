import type { RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import type { Actor } from "../auth/auth.js";

import {
  ensureReferenceExists,
  executeStatement,
  requireUpdate,
  selectRows,
  type SqlValue
} from "../shared/repository-utils.js";

export type DiaperChange = {
  diaperChangeId: number;
  dailyReportId: number;
  diaperChangeTypeId: number;
  changeTime: string;
  comment: string | null;
};
export type CreateDiaperChangeInput = Omit<DiaperChange, "diaperChangeId">;
export type UpdateDiaperChangeInput = Partial<CreateDiaperChangeInput>;
type DiaperChangeRow = RowDataPacket & DiaperChange;
const columns = `diaper_change_id AS diaperChangeId, daily_report_id AS dailyReportId,
  diaper_change_type_id AS diaperChangeTypeId, change_time AS changeTime, comment`;

export async function listDiaperChanges(actor: Actor): Promise<DiaperChange[]> {
  return selectRows<DiaperChangeRow>(
    `SELECT ${columns} FROM diaper_changes WHERE daily_report_id IN (
       SELECT r.daily_report_id FROM daily_reports r JOIN children c ON c.child_id = r.child_id
       WHERE c.daycare_id = ? AND (? <> 'PARENT' OR (r.status = 'PUBLISHED' AND EXISTS
         (SELECT 1 FROM parent_child_links l WHERE l.child_id = c.child_id AND l.parent_id = ?))))
     ORDER BY diaper_change_id DESC`, [actor.daycareId, actor.role, actor.userId]
  );
}

export async function findDiaperChangeById(id: number, connection?: PoolConnection): Promise<DiaperChange | null> {
  const rows = await selectRows<DiaperChangeRow>(
    `SELECT ${columns} FROM diaper_changes WHERE diaper_change_id = ?`, [id], connection
  );
  return rows[0] ?? null;
}

export async function createDiaperChange(input: CreateDiaperChangeInput, connection?: PoolConnection): Promise<DiaperChange | null> {
  await Promise.all([
    ensureReferenceExists("daily_reports", "daily_report_id", input.dailyReportId, "Bulletin quotidien", connection),
    ensureReferenceExists(
      "diaper_change_types", "diaper_change_type_id", input.diaperChangeTypeId, "Type de change", connection
    )
  ]);

  const result = await executeStatement(
    `INSERT INTO diaper_changes (daily_report_id, diaper_change_type_id, change_time, comment)
     VALUES (?, ?, ?, ?)`,
    [input.dailyReportId, input.diaperChangeTypeId, input.changeTime, input.comment], connection
  );
  return findDiaperChangeById(result.insertId, connection);
}

export async function updateDiaperChange(id: number, input: UpdateDiaperChangeInput, connection?: PoolConnection): Promise<DiaperChange | null> {
  await Promise.all([
    input.dailyReportId !== undefined
      ? ensureReferenceExists("daily_reports", "daily_report_id", input.dailyReportId, "Bulletin quotidien", connection)
      : undefined,
    input.diaperChangeTypeId !== undefined
      ? ensureReferenceExists(
          "diaper_change_types", "diaper_change_type_id", input.diaperChangeTypeId, "Type de change", connection
        )
      : undefined
  ]);

  const fields: string[] = [];
  const values: SqlValue[] = [];
  const updates: Array<[keyof UpdateDiaperChangeInput, string]> = [
    ["dailyReportId", "daily_report_id"], ["diaperChangeTypeId", "diaper_change_type_id"],
    ["changeTime", "change_time"], ["comment", "comment"]
  ];
  for (const [key, column] of updates) {
    if (input[key] !== undefined) {
      fields.push(`${column} = ?`);
      values.push(input[key] as SqlValue);
    }
  }
  requireUpdate(fields);
  values.push(id);
  await executeStatement(`UPDATE diaper_changes SET ${fields.join(", ")} WHERE diaper_change_id = ?`, values, connection);
  return findDiaperChangeById(id, connection);
}

export async function deleteDiaperChange(id: number, connection?: PoolConnection): Promise<boolean> {
  const result = await executeStatement("DELETE FROM diaper_changes WHERE diaper_change_id = ?", [id], connection);
  return result.affectedRows > 0;
}
