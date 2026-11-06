import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";

import { AppError } from "../../errors/app-error.js";
import { toDatabaseError } from "../../errors/database-error.js";
import { database } from "../../middlewares/config/database.js";

export type SqlValue = string | number | null;

export async function selectRows<T extends RowDataPacket>(
  sql: string,
  values: SqlValue[] = [],
  connection?: PoolConnection
): Promise<T[]> {
  try {
    const [rows] = await (connection ?? database).execute<RowDataPacket[]>(sql, values);
    return rows as T[];
  } catch (error) {
    throw toDatabaseError(error);
  }
}

export async function executeStatement(
  sql: string,
  values: SqlValue[] = [],
  connection?: PoolConnection
): Promise<ResultSetHeader> {
  try {
    const [result] = await (connection ?? database).execute<ResultSetHeader>(sql, values);
    return result;
  } catch (error) {
    throw toDatabaseError(error);
  }
}

export function requireUpdate(fields: string[]): void {
  if (fields.length === 0) {
    throw new AppError("Au moins une valeur doit être fournie.", 400);
  }
}

// table/idColumn viennent toujours d'appels codés en dur (jamais d'entrée utilisateur),
// donc les interpoler dans le SQL ici est sûr.
export async function ensureReferenceExists(
  table: string,
  idColumn: string,
  id: number,
  label: string,
  connection?: PoolConnection
): Promise<void> {
  const rows = await selectRows(`SELECT 1 FROM ${table} WHERE ${idColumn} = ? LIMIT 1`, [id], connection);
  if (rows.length === 0) {
    throw new AppError(`${label} introuvable (id ${id}).`, 400);
  }
}

// Les routes valident les horaires en "HH:MM" ou "HH:MM:SS" (requiredTime/optionalTime),
// mais la base renvoie toujours "HH:MM:SS" : comparer les textes bruts peut donner un
// résultat faux si les deux formats se mélangent. On normalise avant toute comparaison.
export function normalizeTime(time: string): string {
  return time.length === 5 ? `${time}:00` : time;
}
