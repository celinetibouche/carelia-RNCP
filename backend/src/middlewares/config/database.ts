import mysql from "mysql2/promise";

import { env } from "./env.js";

export const database = mysql.createPool({
  uri: env.databaseUrl,
  charset: "utf8mb4",
  timezone: "Z",
  waitForConnections: true,
  connectionLimit: 10,
  maxIdle: 10,
  idleTimeout: 60_000,
  queueLimit: 0,
  enableKeepAlive: true
});

export async function checkDatabaseConnection(): Promise<void> {
  await database.query("SELECT 1");
}
