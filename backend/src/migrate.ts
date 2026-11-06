import { readFile, readdir } from "node:fs/promises";
import mysql, { type RowDataPacket } from "mysql2/promise";

import { env } from "./middlewares/config/env.js";

const migrationsDirectory = new URL("../migrations/", import.meta.url);

export async function migrate(): Promise<void> {
  const connection = await mysql.createConnection({ uri: env.databaseUrl, multipleStatements: true });
  try {
    const [lockRows] = await connection.query<(RowDataPacket & { acquired: number })[]>(
      "SELECT GET_LOCK('carelia_schema_migration', 30) AS acquired"
    );
    if (lockRows[0]?.acquired !== 1) throw new Error("Verrou de migration indisponible.");

    await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(100) NOT NULL PRIMARY KEY,
      applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE = InnoDB`);
    const files = (await readdir(migrationsDirectory)).filter((file) => /^\d+_[a-z0-9_]+\.sql$/.test(file)).sort();
    for (const file of files) {
      const name = file.slice(0, -4);
      const [rows] = await connection.execute<RowDataPacket[]>(
        "SELECT name FROM schema_migrations WHERE name = ?", [name]
      );
      if (rows.length) continue;
      const source = await readFile(new URL(file, migrationsDirectory), "utf8");
      await connection.query(source);
      await connection.execute("INSERT INTO schema_migrations (name) VALUES (?)", [name]);
    }
  } finally {
    try {
      await connection.query("SELECT RELEASE_LOCK('carelia_schema_migration')");
    } finally {
      await connection.end();
    }
  }
}
