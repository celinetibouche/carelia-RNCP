import type { RowDataPacket } from "mysql2";

import { executeStatement, requireUpdate, selectRows, type SqlValue } from "../shared/repository-utils.js";

export type Daycare = { daycareId: number; name: string };
export type CreateDaycareInput = { name: string };
export type UpdateDaycareInput = Partial<CreateDaycareInput>;

type DaycareRow = RowDataPacket & Daycare;
const daycareColumns = "daycare_id AS daycareId, name";

export async function listDaycares(): Promise<Daycare[]> {
  return selectRows<DaycareRow>(`SELECT ${daycareColumns} FROM daycares ORDER BY name`);
}

export async function findDaycareById(daycareId: number): Promise<Daycare | null> {
  const rows = await selectRows<DaycareRow>(
    `SELECT ${daycareColumns} FROM daycares WHERE daycare_id = ?`,
    [daycareId]
  );
  return rows[0] ?? null;
}

export async function createDaycare(input: CreateDaycareInput): Promise<Daycare | null> {
  const result = await executeStatement("INSERT INTO daycares (name) VALUES (?)", [input.name]);
  return findDaycareById(result.insertId);
}

export async function updateDaycare(daycareId: number, input: UpdateDaycareInput): Promise<Daycare | null> {
  const fields: string[] = [];
  const values: SqlValue[] = [];
  if (input.name !== undefined) {
    fields.push("name = ?");
    values.push(input.name);
  }
  requireUpdate(fields);
  values.push(daycareId);
  await executeStatement(`UPDATE daycares SET ${fields.join(", ")} WHERE daycare_id = ?`, values);
  return findDaycareById(daycareId);
}

export async function deleteDaycare(daycareId: number): Promise<boolean> {
  const result = await executeStatement("DELETE FROM daycares WHERE daycare_id = ?", [daycareId]);
  return result.affectedRows > 0;
}
