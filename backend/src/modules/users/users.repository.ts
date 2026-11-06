import type { RowDataPacket } from "mysql2";

import {
  ensureReferenceExists,
  executeStatement,
  requireUpdate,
  selectRows,
  type SqlValue
} from "../shared/repository-utils.js";

export type User = {
  userId: number;
  daycareId: number;
  roleId: number;
  email: string;
  lastName: string;
  firstName: string;
  phone: string | null;
  address: string | null;
  isActive: boolean;
};

export type CreateUserInput = {
  daycareId: number;
  roleId: number;
  email: string;
  passwordHash: string;
  lastName: string;
  firstName: string;
  phone?: string | null;
  address?: string | null;
  isActive?: boolean;
};
export type UpdateUserInput = Partial<CreateUserInput>;

type UserRow = RowDataPacket & User;
const userColumns = `user_id AS userId, daycare_id AS daycareId, role_id AS roleId,
  email, last_name AS lastName, first_name AS firstName, phone, address, is_active AS isActive`;

function toUser(row: UserRow): User {
  return { ...row, isActive: Boolean(row.isActive) };
}

// Exportée pour que la route puisse vérifier les références AVANT de hasher le mot de
// passe (opération volontairement lente) : pas de hash inutile sur une requête invalide.
// C'est la seule vérification (la route est le seul appelant des fonctions ci-dessous),
// donc pas besoin de la répéter dans createUser/updateUser.
export async function ensureUserReferencesExist(input: {
  daycareId?: number;
  roleId?: number;
}): Promise<void> {
  await Promise.all([
    input.daycareId !== undefined
      ? ensureReferenceExists("daycares", "daycare_id", input.daycareId, "Crèche")
      : undefined,
    input.roleId !== undefined
      ? ensureReferenceExists("roles", "role_id", input.roleId, "Rôle")
      : undefined
  ]);
}

export async function listUsers(daycareId: number): Promise<User[]> {
  const rows = await selectRows<UserRow>(`SELECT ${userColumns} FROM users WHERE daycare_id = ? ORDER BY last_name, first_name`, [daycareId]);
  return rows.map(toUser);
}

export async function findUserById(userId: number): Promise<User | null> {
  const rows = await selectRows<UserRow>(
    `SELECT ${userColumns} FROM users WHERE user_id = ?`,
    [userId]
  );
  return rows[0] ? toUser(rows[0]) : null;
}

export async function createUser(input: CreateUserInput): Promise<User | null> {
  const result = await executeStatement(
    `INSERT INTO users
      (daycare_id, role_id, email, password_hash, last_name, first_name, phone, address, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.daycareId, input.roleId, input.email, input.passwordHash, input.lastName,
      input.firstName, input.phone ?? null, input.address ?? null, input.isActive === false ? 0 : 1
    ]
  );
  return findUserById(result.insertId);
}

export async function updateUser(userId: number, input: UpdateUserInput): Promise<User | null> {
  const fields: string[] = [];
  const values: SqlValue[] = [];
  const updates: Array<[keyof UpdateUserInput, string]> = [
    ["daycareId", "daycare_id"], ["roleId", "role_id"], ["email", "email"],
    ["passwordHash", "password_hash"], ["lastName", "last_name"], ["firstName", "first_name"],
    ["phone", "phone"], ["address", "address"]
  ];
  for (const [key, column] of updates) {
    if (input[key] !== undefined) {
      fields.push(`${column} = ?`);
      values.push(input[key] as SqlValue);
    }
  }
  if (input.isActive !== undefined) {
    fields.push("is_active = ?");
    values.push(input.isActive ? 1 : 0);
  }
  requireUpdate(fields);
  values.push(userId);
  await executeStatement(`UPDATE users SET ${fields.join(", ")} WHERE user_id = ?`, values);
  return findUserById(userId);
}

export async function deleteUser(userId: number): Promise<boolean> {
  const result = await executeStatement("DELETE FROM users WHERE user_id = ?", [userId]);
  return result.affectedRows > 0;
}
