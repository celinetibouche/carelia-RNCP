import bcrypt from 'bcrypt';
import type { RowDataPacket } from 'mysql2';
import { database } from './middlewares/config/database.js';
import { migrate } from './migrate.js';

const password = process.env.CARELIA_DEMO_PASSWORD;
if (process.env.NODE_ENV !== 'development') throw new Error('Comptes de démonstration réservés au mode development.');
if (!password || password.length < 12 || password.length > 72) {
  throw new Error('Définir CARELIA_DEMO_PASSWORD avec 12 à 72 caractères.');
}

await migrate();
const hash = await bcrypt.hash(password, 10);
const connection = await database.getConnection();
try {
  await connection.beginTransaction();
  await connection.execute("INSERT IGNORE INTO daycares (name) VALUES ('Carelia Demo Daycare')");
  const [daycares] = await connection.execute<(RowDataPacket & { daycareId: number })[]>(
    "SELECT daycare_id AS daycareId FROM daycares WHERE name = 'Carelia Demo Daycare'"
  );
  if (!daycares[0]) throw new Error('Crèche de démonstration introuvable.');
  const daycareId = daycares[0].daycareId;
  const accounts = [
    { role: 'DAYCARE_ADMIN', email: 'admin@carelia.test', first: 'Alice', last: 'Martin' },
    { role: 'EJE', email: 'equipe@carelia.test', first: 'Marie', last: 'Laurent' },
    { role: 'PARENT', email: 'parent@carelia.test', first: 'Camille', last: 'Durand' },
  ];
  for (const account of accounts) {
    const [roles] = await connection.execute<(RowDataPacket & { roleId: number })[]>(
      'SELECT role_id AS roleId FROM roles WHERE label = ?', [account.role]
    );
    if (!roles[0]) throw new Error(`Rôle absent : ${account.role}`);
    await connection.execute(
      `INSERT INTO users (daycare_id, role_id, email, password_hash, first_name, last_name, is_active)
       VALUES (?, ?, ?, ?, ?, ?, TRUE)
       ON DUPLICATE KEY UPDATE daycare_id = VALUES(daycare_id), role_id = VALUES(role_id),
         password_hash = VALUES(password_hash), is_active = TRUE`,
      [daycareId, roles[0].roleId, account.email, hash, account.first, account.last]
    );
  }
  // Révoquer aussi les cookies déjà émis : les nouveaux mots de passe et la révocation
  // deviennent visibles ensemble à la validation de cette transaction.
  await connection.execute(
    `DELETE s FROM auth_sessions AS s
     JOIN users AS u ON u.user_id = s.user_id
     WHERE u.email IN (?, ?, ?)`,
    accounts.map((account) => account.email)
  );
  const [parents] = await connection.execute<(RowDataPacket & { userId: number })[]>(
    "SELECT user_id AS userId FROM users WHERE email = 'parent@carelia.test'"
  );
  if (!parents[0]) throw new Error('Parent de démonstration introuvable.');
  const [children] = await connection.execute<(RowDataPacket & { childId: number })[]>(
    "SELECT child_id AS childId FROM children WHERE daycare_id = ? AND first_name = 'Lina' AND last_name = 'Durand' LIMIT 1",
    [daycareId]
  );
  let childId = children[0]?.childId;
  if (!childId) {
    const [created] = await connection.execute<import('mysql2').ResultSetHeader>(
      "INSERT INTO children (daycare_id, first_name, last_name, birth_date, is_active) VALUES (?, 'Lina', 'Durand', '2023-05-14', TRUE)",
      [daycareId]
    );
    childId = created.insertId;
  }
  await connection.execute(
    "INSERT IGNORE INTO parent_child_links (child_id, parent_id, relationship) VALUES (?, ?, 'PARENT')",
    [childId, parents[0].userId]
  );
  await connection.commit();
  console.log('Comptes de démonstration prêts : admin@carelia.test, equipe@carelia.test, parent@carelia.test');
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  connection.release();
  await database.end();
}
