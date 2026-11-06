import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { after, test } from "node:test";
import bcrypt from "bcrypt";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { database } from "./middlewares/config/database.js";

after(async () => { await database.end(); });

const compiled = import.meta.url.endsWith(".js");
const serverArgs = compiled ? ["dist/server.js"] : ["--import", "tsx", "src/server.ts"];
const modulePath = (path: string) => compiled ? path.replace("./src/", "./dist/").replace(/\.ts$/, ".js") : path;

async function freePort(): Promise<number> {
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const address = listener.address();
  assert.ok(address && typeof address !== "string");
  const port = address.port;
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  return port;
}

async function waitForHealth(url: string, child: ReturnType<typeof spawn>): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Le serveur s'est arrêté avec le code ${child.exitCode}.`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The process may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Le serveur n'a pas démarré dans le délai attendu.");
}

test("le serveur démarre, émet l'événement Socket.IO et s'arrête proprement", async () => {
  const port = await freePort();
  const child = spawn(process.execPath, serverArgs, {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });
  let socket: WebSocket | undefined;
  let napsServer: ReturnType<typeof spawn> | undefined;

  try {
    await waitForHealth(`http://127.0.0.1:${port}/api/health`, child);
    const [rows] = await database.execute<(RowDataPacket & { daycareId: number; roleId: number })[]>(
      `SELECT d.daycare_id AS daycareId, r.role_id AS roleId FROM daycares d
       JOIN roles r ON r.label = 'DAYCARE_ADMIN' LIMIT 1`
    );
    assert.ok(rows[0]);
    const email = `socket-${Date.now()}-${Math.random().toString(36).slice(2)}@carelia.test`;
    const [created] = await database.execute<ResultSetHeader>(
      `INSERT INTO users (daycare_id, role_id, email, password_hash, last_name, first_name)
       VALUES (?, ?, ?, ?, 'Socket', 'Test')`,
      [rows[0].daycareId, rows[0].roleId, email, await bcrypt.hash("SocketPassword123!", 10)]
    );
    const loggedIn = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "SocketPassword123!" })
    });
    assert.equal(loggedIn.status, 200);
    assert.equal("token" in (await loggedIn.json() as Record<string, unknown>), false);
    const cookie = loggedIn.headers.get("set-cookie")?.split(";")[0];
    assert.ok(cookie);
    const token = loggedIn.headers.get("set-cookie")?.match(/^carelia_session=([a-f0-9]{64})/)?.[1];
    assert.ok(token);
    socket = new WebSocket(`ws://127.0.0.1:${port}/socket.io/?EIO=4&transport=websocket`);
    const connected = await new Promise<{ service: string; timestamp: string }>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Aucun événement Socket.IO reçu.")), 5000);
      socket?.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error("La connexion Socket.IO a échoué."));
      });
      socket?.addEventListener("message", (event) => {
        const frame = String(event.data);
        if (frame.startsWith("0")) socket?.send(`40${JSON.stringify({ token })}`);
        if (frame === "2") socket?.send("3");
        if (frame.startsWith("42")) {
          clearTimeout(timeout);
          const [name, payload] = JSON.parse(frame.slice(2)) as [string, { service: string; timestamp: string }];
          if (name === "connected") resolve(payload);
        }
      });
    });
    assert.equal(connected.service, "carelia-api");
    assert.ok(Number.isFinite(Date.parse(connected.timestamp)));
    const api = async (path: string, method: string, body: unknown) => fetch(`http://127.0.0.1:${port}/api${path}`, {
      method, headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(body)
    });
    const childResponse = await api("/children", "POST", {
      firstName: "Socket", lastName: "Child", birthDate: "2024-01-01"
    });
    assert.equal(childResponse.status, 201);
    const { childId } = await childResponse.json() as { childId: number };
    const reportResponse = await api("/reports", "POST", { childId, reportDate: "2026-10-21" });
    assert.equal(reportResponse.status, 201);
    const { reportId } = await reportResponse.json() as { reportId: number };
    const invalidJoin = new Promise<{ ok: boolean }>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Aucune réponse pour l'identifiant invalide.")), 5000);
      socket?.addEventListener("message", (event) => {
        const frame = String(event.data);
        if (frame.startsWith("433")) { clearTimeout(timeout); resolve(JSON.parse(frame.slice(3))[0] as { ok: boolean }); }
      });
    });
    socket.send('423["report:join","invalid"]');
    assert.equal((await invalidJoin).ok, false);
    const joinReply = new Promise<{ ok: boolean }>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Abonnement Socket.IO sans réponse.")), 5000);
      socket?.addEventListener("message", (event) => {
        const frame = String(event.data);
        if (frame.startsWith("431")) { clearTimeout(timeout); resolve(JSON.parse(frame.slice(3))[0] as { ok: boolean }); }
      });
    });
    socket.send(`421["report:join",${reportId}]`);
    assert.deepEqual(await joinReply, { ok: true });
    const changed = new Promise<{ reportId: number; revision: number }>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Aucun événement de mise à jour reçu.")), 5000);
      socket?.addEventListener("message", (event) => {
        const frame = String(event.data);
        if (!frame.startsWith("42")) return;
        const [name, payload] = JSON.parse(frame.slice(2)) as [string, { reportId: number; revision: number }];
        if (name === "report:changed" && payload.revision === 2) { clearTimeout(timeout); resolve(payload); }
      });
    });
    const patched = await api(`/reports/${reportId}`, "PATCH", { revision: 1, parentNote: "Temps réel" });
    assert.equal(patched.status, 200);
    assert.deepEqual({ reportId: (await changed).reportId, revision: (await changed).revision }, { reportId, revision: 2 });
    const napsPort = await freePort();
    napsServer = spawn(process.execPath, serverArgs, {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(napsPort), SERVICE_NAME: "carelia-naps-api" },
      stdio: ["ignore", "pipe", "pipe"]
    });
    await waitForHealth(`http://127.0.0.1:${napsPort}/api/health`, napsServer);
    const crossServiceChange = new Promise<{ reportId: number; revision: number }>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Aucun événement inter-services reçu.")), 5000);
      socket?.addEventListener("message", (event) => {
        const frame = String(event.data);
        if (!frame.startsWith("42")) return;
        const [name, payload] = JSON.parse(frame.slice(2)) as [string, { reportId: number; revision: number }];
        if (name === "report:changed" && payload.revision === 3) { clearTimeout(timeout); resolve(payload); }
      });
    });
    const createdNap = await fetch(`http://127.0.0.1:${napsPort}/api/naps`, {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ dailyReportId: reportId, napQualityId: 1, startTime: "13:00", endTime: "14:00" })
    });
    assert.equal(createdNap.status, 201);
    assert.equal((await crossServiceChange).reportId, reportId);
    const napsExited = once(napsServer, "exit");
    napsServer.kill("SIGTERM");
    await napsExited;
    const logout = await api("/auth/logout", "POST", {});
    assert.equal(logout.status, 204);
    const revokedJoin = new Promise<{ ok: boolean }>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Aucune réponse après révocation.")), 5000);
      socket?.addEventListener("message", (event) => {
        const frame = String(event.data);
        if (frame.startsWith("432")) { clearTimeout(timeout); resolve(JSON.parse(frame.slice(3))[0] as { ok: boolean }); }
      });
    });
    socket.send(`422["report:join",${reportId}]`);
    assert.equal((await revokedJoin).ok, false);
    const renewed = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "SocketPassword123!" })
    });
    assert.equal(renewed.status, 200);
    assert.equal("token" in (await renewed.json() as Record<string, unknown>), false);
    const renewedCookie = renewed.headers.get("set-cookie")?.split(";")[0];
    assert.ok(renewedCookie);
    let leaked = false;
    socket.addEventListener("message", (event) => {
      if (String(event.data).includes('"revision":4')) leaked = true;
    });
    const afterLogout = await fetch(`http://127.0.0.1:${port}/api/reports/${reportId}`, {
      method: "PATCH", headers: { "content-type": "application/json", cookie: renewedCookie },
      body: JSON.stringify({ revision: 3, parentNote: "Après déconnexion" })
    });
    assert.equal(afterLogout.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 650));
    assert.equal(leaked, false);
    await database.execute("DELETE FROM children WHERE child_id = ?", [childId]);
    await database.execute("DELETE FROM users WHERE user_id = ?", [created.insertId]);

    socket.close();
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    const [code] = await Promise.race([
      exited,
      new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("Arrêt du serveur trop long.")), 5000))
    ]);
    assert.equal(code, 0, output);
  } finally {
    socket?.close();
    if (napsServer && napsServer.exitCode === null && napsServer.signalCode === null) {
      napsServer.kill("SIGKILL");
      await once(napsServer, "exit");
    }
    if (child.exitCode === null) {
      child.kill("SIGKILL");
      await once(child, "exit");
    }
  }
});

test("une socket sans session est refusée et SIGINT arrête le serveur", async () => {
  const port = await freePort();
  const child = spawn(process.execPath, serverArgs, {
    cwd: process.cwd(), env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"]
  });
  try {
    await waitForHealth(`http://127.0.0.1:${port}/api/health`, child);
    const socket = new WebSocket(`ws://127.0.0.1:${port}/socket.io/?EIO=4&transport=websocket`);
    const rejected = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Socket non authentifiée sans réponse.")), 5000);
      socket.addEventListener("message", (event) => {
        const frame = String(event.data);
        if (frame.startsWith("0")) socket.send("40");
        if (frame.startsWith("44")) { clearTimeout(timeout); resolve(frame); }
      });
    });
    assert.match(await rejected, /Authentification requise/);
    socket.close();
    const exited = once(child, "exit");
    child.kill("SIGINT");
    const [code] = await exited;
    assert.equal(code, 0);
  } finally {
    if (child.exitCode === null) {
      child.kill("SIGKILL");
      await once(child, "exit");
    }
  }
});

test("la configuration refuse une base absente ou invalide et un port hors plage", async (t) => {
  for (const [name, overrides, message] of [
    ["DATABASE_URL absente", { DATABASE_URL: "" }, "DATABASE_URL est obligatoire"],
    ["DATABASE_URL invalide", { DATABASE_URL: "postgres://localhost/carelia" }, "URL MySQL valide"],
    ["PORT invalide", { PORT: "70000" }, "port valide"]
  ] as const) {
    await t.test(name, () => {
      const result = spawnSync(process.execPath, [
        ...(compiled ? [] : ["--import", "tsx"]), "--input-type=module", "-e",
        `import('${modulePath("./src/middlewares/config/env.ts")}')`
      ], {
        cwd: process.cwd(),
        env: { ...process.env, ...overrides },
        encoding: "utf8",
        timeout: 10000
      });
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, new RegExp(message));
    });
  }
});

test("le serveur refuse de démarrer si MySQL est inaccessible", () => {
  const result = spawnSync(process.execPath, serverArgs, {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: "mysql://carelia:carelia_test@127.0.0.1:1/carelia" },
    encoding: "utf8",
    timeout: 10000
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Impossible de démarrer Carelia API/);
});

test("le mode développement ne divulgue pas le détail d'une erreur interne", () => {
  const script = [
    `import { errorHandler } from '${modulePath("./src/middlewares/error-handler.ts")}';`,
    "const response = { status() { return this; }, json(body) { process.stdout.write(JSON.stringify(body)); } };",
    "errorHandler(new Error('debug detail'), {}, response, () => {});"
  ].join(" ");
  const result = spawnSync(process.execPath, [...(compiled ? [] : ["--import", "tsx"]), "--input-type=module", "-e", script], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "development" },
    encoding: "utf8",
    timeout: 10000
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { error: "Erreur interne du serveur" });
  assert.doesNotMatch(result.stderr, /debug detail/);
});
