import './test-guard.mjs';
import bcrypt from 'bcrypt';
import { database } from '../dist/middlewares/config/database.js';
import { migrate } from '../dist/migrate.js';
try {
  await migrate();
  const hash = await bcrypt.hash('Browser-Password-123!', 10);
  const [daycare] = await database.execute("INSERT INTO daycares (name) VALUES ('Browser tests')");
  const ids = {};
  for (const [name, role] of Object.entries({direction:'DAYCARE_ADMIN', eje:'EJE', auxiliaire:'AUXILIARY', parent:'PARENT'})) {
    const [result] = await database.execute(`INSERT INTO users (daycare_id, role_id, email, password_hash, last_name, first_name)
      SELECT ?, role_id, ?, ?, 'Navigateur', ? FROM roles WHERE label = ?`,
      [daycare.insertId, `${name}@browser.test`, hash, name, role]);
    ids[name] = result.insertId;
  }
  const [child] = await database.execute("INSERT INTO children (daycare_id, first_name, last_name, birth_date) VALUES (?, 'Test', 'Navigateur', '2023-01-01')", [daycare.insertId]);
  await database.execute("INSERT INTO parent_child_links (child_id, parent_id, relationship) VALUES (?, ?, 'PARENT')", [child.insertId, ids.parent]);
} finally { await database.end(); }
