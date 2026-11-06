import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcrypt';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { app } from './app.js';
import { database } from './middlewares/config/database.js';
import { migrate } from './migrate.js';

const run = promisify(execFile);
const demoEmails = ['admin@carelia.test', 'equipe@carelia.test', 'parent@carelia.test'];

async function bootstrap(password: string, nodeEnv = 'development'): Promise<void> {
  await run(process.execPath, [fileURLToPath(new URL('./bootstrap-demo.js', import.meta.url))], {
    env: { ...process.env, NODE_ENV: nodeEnv, CARELIA_DEMO_PASSWORD: password },
    timeout: 30_000,
  });
}

test('bootstrap:demo remplace les mots de passe et révoque seulement les sessions des comptes concernés', async () => {
  await migrate();
  const oldPassword = 'Demo-Old-Password-123!';
  const newPassword = 'Demo-New-Password-456!';
  await assert.rejects(bootstrap('court'), (error: unknown) => {
    assert.match(String((error as { stderr?: string }).stderr), /Définir CARELIA_DEMO_PASSWORD/);
    return true;
  });
  await assert.rejects(bootstrap(oldPassword, 'test'), (error: unknown) => {
    assert.match(String((error as { stderr?: string }).stderr), /réservés au mode development/);
    return true;
  });
  await bootstrap(oldPassword);

  const [adminRows] = await database.execute<(RowDataPacket & { daycareId: number; roleId: number })[]>(
    'SELECT daycare_id AS daycareId, role_id AS roleId FROM users WHERE email = ?', [demoEmails[0]!]
  );
  assert.ok(adminRows[0]);
  const otherEmail = `outside-demo-${Date.now()}@carelia.test`;
  const [other] = await database.execute<ResultSetHeader>(
    `INSERT INTO users (daycare_id, role_id, email, password_hash, first_name, last_name, is_active)
     VALUES (?, ?, ?, ?, 'Autre', 'Compte', TRUE)`,
    [adminRows[0].daycareId, adminRows[0].roleId, otherEmail, await bcrypt.hash(oldPassword, 10)]
  );

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const login = async (email: string, password: string) => {
    const response = await fetch(`${base}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    return { status: response.status, cookie: response.headers.get('set-cookie')?.split(';')[0] ?? null };
  };
  const me = async (cookie: string) => (await fetch(`${base}/auth/me`, { headers: { cookie } })).status;

  try {
    const oldSessions = await Promise.all(demoEmails.map(async (email) => {
      const result = await login(email, oldPassword);
      assert.equal(result.status, 200, email);
      assert.ok(result.cookie);
      assert.equal(await me(result.cookie), 200);
      return result.cookie;
    }));
    const unaffected = await login(otherEmail, oldPassword);
    assert.equal(unaffected.status, 200);
    assert.ok(unaffected.cookie);

    // Un rôle manquant provoque un rollback après la première mise à jour de mot de passe.
    const [ejeRoles] = await database.execute<(RowDataPacket & { roleId: number })[]>(
      "SELECT role_id AS roleId FROM roles WHERE label = 'EJE'"
    );
    assert.ok(ejeRoles[0]);
    await database.execute("UPDATE roles SET label = 'EJE_UNAVAILABLE_TEST' WHERE role_id = ?", [ejeRoles[0].roleId]);
    try {
      await assert.rejects(bootstrap(newPassword), (error: unknown) => {
        assert.match(String((error as { stderr?: string }).stderr), /Rôle absent : EJE/);
        return true;
      });
    } finally {
      await database.execute("UPDATE roles SET label = 'EJE' WHERE role_id = ?", [ejeRoles[0].roleId]);
    }
    for (const cookie of oldSessions) assert.equal(await me(cookie), 200, 'rollback : ancienne session conservée');
    assert.equal((await login(demoEmails[0]!, oldPassword)).status, 200, 'rollback : ancien mot de passe conservé');
    assert.equal((await login(demoEmails[0]!, newPassword)).status, 401, 'rollback : nouveau mot de passe refusé');

    await bootstrap(newPassword);

    const [sessionRows] = await database.execute<(RowDataPacket & { count: number })[]>(
      `SELECT COUNT(*) AS count FROM auth_sessions
       WHERE user_id IN (SELECT user_id FROM users WHERE email IN (?, ?, ?))`, demoEmails
    );
    assert.equal(sessionRows[0]?.count, 0);
    for (const [index, email] of demoEmails.entries()) {
      assert.equal(await me(oldSessions[index]!), 401, `${email} : ancienne session`);
      assert.equal((await login(email, oldPassword)).status, 401, `${email} : ancien mot de passe`);
      const renewed = await login(email, newPassword);
      assert.equal(renewed.status, 200, `${email} : nouveau mot de passe`);
      assert.ok(renewed.cookie);
      assert.equal(await me(renewed.cookie), 200);
    }
    assert.equal(await me(unaffected.cookie), 200, 'session d’un autre compte conservée');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await database.execute('DELETE FROM users WHERE user_id = ?', [other.insertId]);
    await database.end();
  }
});
