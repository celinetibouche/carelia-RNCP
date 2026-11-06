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

export type MoodObservation = {
  moodObservationId: number;
  dailyReportId: number;
  moodId: number;
  observedTime: string;
  comment: string | null;
};
export type CreateMoodObservationInput = Omit<MoodObservation, "moodObservationId">;
export type UpdateMoodObservationInput = Partial<CreateMoodObservationInput>;
type MoodObservationRow = RowDataPacket & MoodObservation;
const columns = `mood_observation_id AS moodObservationId, daily_report_id AS dailyReportId,
  mood_id AS moodId, observed_time AS observedTime, comment`;

export async function listMoodObservations(actor: Actor): Promise<MoodObservation[]> {
  return selectRows<MoodObservationRow>(
    `SELECT ${columns} FROM mood_observations WHERE daily_report_id IN (
       SELECT r.daily_report_id FROM daily_reports r JOIN children c ON c.child_id = r.child_id
       WHERE c.daycare_id = ? AND (? <> 'PARENT' OR (r.status = 'PUBLISHED' AND EXISTS
         (SELECT 1 FROM parent_child_links l WHERE l.child_id = c.child_id AND l.parent_id = ?))))
     ORDER BY mood_observation_id DESC`, [actor.daycareId, actor.role, actor.userId]
  );
}

export async function findMoodObservationById(id: number, connection?: PoolConnection): Promise<MoodObservation | null> {
  const rows = await selectRows<MoodObservationRow>(
    `SELECT ${columns} FROM mood_observations WHERE mood_observation_id = ?`, [id], connection
  );
  return rows[0] ?? null;
}

export async function createMoodObservation(
  input: CreateMoodObservationInput,
  connection?: PoolConnection
): Promise<MoodObservation | null> {
  await Promise.all([
    ensureReferenceExists("daily_reports", "daily_report_id", input.dailyReportId, "Bulletin quotidien", connection),
    ensureReferenceExists("moods", "mood_id", input.moodId, "Humeur", connection)
  ]);

  const result = await executeStatement(
    `INSERT INTO mood_observations (daily_report_id, mood_id, observed_time, comment)
     VALUES (?, ?, ?, ?)`,
    [input.dailyReportId, input.moodId, input.observedTime, input.comment], connection
  );
  return findMoodObservationById(result.insertId, connection);
}

export async function updateMoodObservation(
  id: number,
  input: UpdateMoodObservationInput,
  connection?: PoolConnection
): Promise<MoodObservation | null> {
  await Promise.all([
    input.dailyReportId !== undefined
      ? ensureReferenceExists("daily_reports", "daily_report_id", input.dailyReportId, "Bulletin quotidien", connection)
      : undefined,
    input.moodId !== undefined
      ? ensureReferenceExists("moods", "mood_id", input.moodId, "Humeur", connection)
      : undefined
  ]);

  const fields: string[] = [];
  const values: SqlValue[] = [];
  const updates: Array<[keyof UpdateMoodObservationInput, string]> = [
    ["dailyReportId", "daily_report_id"], ["moodId", "mood_id"],
    ["observedTime", "observed_time"], ["comment", "comment"]
  ];
  for (const [key, column] of updates) {
    if (input[key] !== undefined) {
      fields.push(`${column} = ?`);
      values.push(input[key] as SqlValue);
    }
  }
  requireUpdate(fields);
  values.push(id);
  await executeStatement(`UPDATE mood_observations SET ${fields.join(", ")} WHERE mood_observation_id = ?`, values, connection);
  return findMoodObservationById(id, connection);
}

export async function deleteMoodObservation(id: number, connection?: PoolConnection): Promise<boolean> {
  const result = await executeStatement("DELETE FROM mood_observations WHERE mood_observation_id = ?", [id], connection);
  return result.affectedRows > 0;
}
