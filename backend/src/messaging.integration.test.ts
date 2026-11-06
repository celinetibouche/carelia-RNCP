import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import bcrypt from "bcrypt";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { app } from "./app.js";
import { database } from "./middlewares/config/database.js";
import { migrate } from "./migrate.js";
import { purgeMessages } from "./purge-messages.js";
import { tokenFromCookie } from "./modules/auth/auth.js";

type Result<T = Record<string, unknown>> = { status: number; body: T; cookie: string | null };
async function request<T = Record<string, unknown>>(base: string, path: string, method = "GET", data?: unknown, cookie?: string): Promise<Result<T>> {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { ...(data === undefined ? {} : { "content-type": "application/json" }), ...(cookie ? { cookie } : {}) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) })
  });
  return { status: response.status, body: response.status === 204 ? {} as T : await response.json() as T,
    cookie: response.headers.get("set-cookie")?.split(";")[0] ?? null };
}
function status<T>(result: Result<T>, expected: number): T {
  assert.equal(result.status, expected, JSON.stringify(result.body));
  return result.body;
}

test("F2 : conversations, permissions, lectures, recherche, notifications et pagination", async (t) => {
  await migrate();
  await migrate();
  const suffix = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
  const hash = await bcrypt.hash("Test-Password-123!", 10);
  const [first] = await database.execute<ResultSetHeader>("INSERT INTO daycares (name) VALUES (?)", [`Messagerie ${suffix}`]);
  const [second] = await database.execute<ResultSetHeader>("INSERT INTO daycares (name) VALUES (?)", [`Autre messagerie ${suffix}`]);
  const [roleRows] = await database.execute<(RowDataPacket & { roleId: number; label: string })[]>("SELECT role_id AS roleId, label FROM roles");
  const role = (label: string) => roleRows.find((item) => item.label === label)!.roleId;
  async function user(daycareId: number, roleName: string, name: string) {
    const email = `${name}-${suffix}@carelia.test`;
    const [result] = await database.execute<ResultSetHeader>(
      `INSERT INTO users (daycare_id, role_id, email, password_hash, last_name, first_name)
       VALUES (?, ?, ?, ?, 'Test', ?)`, [daycareId, role(roleName), email, hash, name]
    );
    return { id: result.insertId, email };
  }
  async function child(daycareId: number, name: string, parentId: number) {
    const [result] = await database.execute<ResultSetHeader>(
      "INSERT INTO children (daycare_id, first_name, last_name, birth_date) VALUES (?, ?, 'Test', '2023-01-01')",
      [daycareId, name]
    );
    await database.execute("INSERT INTO parent_child_links (child_id, parent_id, relationship) VALUES (?, ?, 'Parent')", [result.insertId, parentId]);
    return result.insertId;
  }
  const admin = await user(first.insertId, "DAYCARE_ADMIN", "admin");
  const eje = await user(first.insertId, "EJE", "eje");
  const auxiliary = await user(first.insertId, "AUXILIARY", "aux");
  const parentA = await user(first.insertId, "PARENT", "parentA");
  const parentB = await user(first.insertId, "PARENT", "parentB");
  const outsider = await user(second.insertId, "DAYCARE_ADMIN", "outsider");
  const outsiderParent = await user(second.insertId, "PARENT", "outsiderParent");
  const childA = await child(first.insertId, "Lina", parentA.id);
  const childB = await child(first.insertId, "Noah", parentB.id);
  const childOutside = await child(second.insertId, "Emma", outsiderParent.id);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const cookie = async (email: string) => {
    const result = await request(base, "/auth/login", "POST", { email, password: "Test-Password-123!" });
    status(result, 200); return result.cookie!;
  };
  try {
    const adminCookie = await cookie(admin.email);
    const ejeCookie = await cookie(eje.email);
    const auxCookie = await cookie(auxiliary.email);
    let parentCookie = await cookie(parentA.email);
    const otherParentCookie = await cookie(parentB.email);
    const outsideCookie = await cookie(outsider.email);

    await t.test("création idempotente et droits famille/crèche/personnel", async () => {
      status(await request(base, "/conversations"), 401);
      status(await request(base, "/conversations", "GET", undefined, auxCookie), 403);
      status(await request(base, "/conversations", "POST", { childId: childA }, auxCookie), 403);
      status(await request(base, "/conversations", "POST", { childId: childB }, parentCookie), 403);
      status(await request(base, "/conversations", "POST", { childId: childOutside, parentId: outsiderParent.id }, adminCookie), 403);
      status(await request(base, "/conversations", "POST", { childId: childA, parentId: parentB.id }, adminCookie), 403);
      status(await request(base, "/conversations", "POST", { childId: childA, parentId: parentB.id }, parentCookie), 403);
      status(await request(base, "/conversations", "POST", { childId: childA, memberIds: [parentB.id] }, parentCookie), 400);
      status(await request(base, "/conversations", "POST", { childId: childA, type: "GROUP", parentId: parentA.id }, adminCookie), 400);
      status(await request(base, "/conversations", "POST", { childId: 0 }, parentCookie), 400);
      const created = status(await request<{ conversationId: number }>(base, "/conversations", "POST", { childId: childA }, parentCookie), 201);
      const again = status(await request<{ conversationId: number }>(base, "/conversations", "POST", { childId: childA, parentId: parentA.id }, adminCookie), 200);
      assert.equal(again.conversationId, created.conversationId);
      status(await request(base, `/conversations/${created.conversationId}`, "GET", undefined, otherParentCookie), 403);
      status(await request(base, `/conversations/${created.conversationId}`, "GET", undefined, outsideCookie), 403);
      status(await request(base, `/conversations/${created.conversationId}`, "GET", undefined, ejeCookie), 200);
      status(await request(base, "/conversations/999999999", "GET", undefined, parentCookie), 404);
      status(await request(base, "/conversations/nope", "GET", undefined, parentCookie), 400);
      status(await request(base, "/conversations", "POST", { childId: childB, parentId: parentB.id }, adminCookie), 201);
      const listed = status(await request<{ items: Array<{ conversationId: number }>; total: number }>(base, "/conversations?search=Lina", "GET", undefined, adminCookie), 200);
      assert.equal(listed.total, 1);
      assert.equal(listed.items[0]?.conversationId, created.conversationId);
      status(await request(base, "/conversations?limit=51", "GET", undefined, adminCookie), 400);
      status(await request(base, "/conversations?offset=-1", "GET", undefined, adminCookie), 400);
    });

    const list = status(await request<{ items: Array<{ conversationId: number }> }>(base, "/conversations", "GET", undefined, parentCookie), 200);
    const conversation = list.items[0];
    assert.ok(conversation);
    const conversationId = conversation.conversationId;
    await t.test("messages, accusé de première lecture et notifications persistantes", async () => {
      status(await request(base, `/conversations/${conversationId}/messages`, "POST", { body: "  " }, parentCookie), 400);
      status(await request(base, `/conversations/${conversationId}/messages`, "POST", { body: "x".repeat(2001) }, parentCookie), 400);
      status(await request(base, `/conversations/${conversationId}/messages`, "POST", { body: "Interdit" }, otherParentCookie), 403);
      const sent = status(await request<{ messageId: number }>(base, `/conversations/${conversationId}/messages`, "POST", { body: "Lina arrive à 9 h." }, parentCookie), 201);
      const notice = status(await request<{ items: Array<{ messageId: number; readAt: string | null }>; unread: number }>(base, "/message-notifications", "GET", undefined, ejeCookie), 200);
      assert.equal(notice.unread, 1);
      assert.equal(notice.items[0]?.messageId, sent.messageId);
      assert.ok(notice.items[0]);
      assert.equal("body" in notice.items[0], false);
      const adminNotice = status(await request<{ unread: number }>(base, "/message-notifications", "GET", undefined, adminCookie), 200);
      assert.equal(adminNotice.unread, 1);
      status(await request(base, `/conversations/${conversationId}/read`, "POST", { upToMessageId: sent.messageId }, auxCookie), 403);
      status(await request(base, `/conversations/${conversationId}/read`, "POST", { upToMessageId: 999999999 }, ejeCookie), 404);
      status(await request(base, `/conversations/${conversationId}/read`, "POST", { upToMessageId: sent.messageId }, ejeCookie), 204);
      const [readRows] = await database.execute<(RowDataPacket & { readAt: Date })[]>(
        "SELECT read_at AS readAt FROM official_message_recipients WHERE message_id = ? AND recipient_id = ?", [sent.messageId, eje.id]
      );
      assert.ok(readRows[0]);
      const firstRead = readRows[0].readAt.getTime();
      status(await request(base, `/conversations/${conversationId}/read`, "POST", { upToMessageId: sent.messageId }, ejeCookie), 204);
      const [again] = await database.execute<(RowDataPacket & { readAt: Date })[]>(
        "SELECT read_at AS readAt FROM official_message_recipients WHERE message_id = ? AND recipient_id = ?", [sent.messageId, eje.id]
      );
      assert.ok(again[0]);
      assert.equal(again[0].readAt.getTime(), firstRead);
      const adminStillUnread = status(await request<{ unread: number }>(base, "/message-notifications", "GET", undefined, adminCookie), 200);
      assert.equal(adminStillUnread.unread, 1);
      const parentView = status(await request<{ items: Array<{ messageId: number; firstReadAt: string | null }> }>(base, `/conversations/${conversationId}/messages`, "GET", undefined, parentCookie), 200);
      assert.ok(parentView.items[0]);
      assert.equal(parentView.items[0].messageId, sent.messageId);
      assert.ok(parentView.items[0].firstReadAt);
      const reply = status(await request<{ messageId: number }>(base, `/conversations/${conversationId}/messages`, "POST", { body: "Merci, à tout à l'heure." }, ejeCookie), 201);
      const parentNotice = status(await request<{ unread: number }>(base, "/message-notifications", "GET", undefined, parentCookie), 200);
      assert.equal(parentNotice.unread, 1);
      status(await request(base, `/conversations/${conversationId}/read`, "POST", { upToMessageId: reply.messageId }, parentCookie), 204);
      assert.equal(status(await request<{ unread: number }>(base, "/message-notifications", "GET", undefined, parentCookie), 200).unread, 0);
      const [audits] = await database.execute<RowDataPacket[]>("SELECT action FROM official_message_audit WHERE conversation_id = ?", [conversationId]);
      assert.ok(audits.some((item) => item.action === "MESSAGE_READ"));
    });

    await t.test("Socket.IO diffuse les lectures seulement aux sessions encore autorisées", async () => {
      const available = createServer();
      await new Promise<void>((resolve) => available.listen(0, "127.0.0.1", resolve));
      const port = (available.address() as AddressInfo).port;
      await new Promise<void>((resolve) => available.close(() => resolve()));
      const compiled = import.meta.url.endsWith(".js");
      const processServer = spawn(process.execPath, compiled ? ["dist/server.js"] : ["--import", "tsx", "src/server.ts"], {
        cwd: process.cwd(), env: { ...process.env, PORT: String(port), SERVICE_NAME: "carelia-api" },
        stdio: ["ignore", "pipe", "pipe"]
      });
      let output = "";
      processServer.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });
      const sockets: WebSocket[] = [];
      try {
        let healthy = false;
        for (let attempt = 0; attempt < 60; attempt++) {
          if (processServer.exitCode !== null) throw new Error(output);
          try { healthy = (await fetch(`http://127.0.0.1:${port}/api/health`)).ok; } catch { /* Starting. */ }
          if (healthy) break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        assert.ok(healthy, output);
        async function connect(sessionCookie: string): Promise<WebSocket> {
          const token = tokenFromCookie(sessionCookie);
          assert.ok(token);
          const socket = new WebSocket(`ws://127.0.0.1:${port}/socket.io/?EIO=4&transport=websocket`);
          sockets.push(socket);
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("Socket sans réponse.")), 5000);
            socket.addEventListener("message", (event) => {
              const frame = String(event.data);
              if (frame.startsWith("0")) socket.send(`40${JSON.stringify({ token })}`);
              if (frame === "2") socket.send("3");
              if (frame.startsWith('42["connected"')) { clearTimeout(timeout); resolve(); }
            });
          });
          return socket;
        }
        const parentSocket = await connect(parentCookie);
        const otherSocket = await connect(otherParentCookie);
        const staffSocket = await connect(ejeCookie);
        let otherReceived = false;
        otherSocket.addEventListener("message", (event) => {
          if (String(event.data).includes('"conversation:changed"')) otherReceived = true;
        });
        const changed = new Promise<{ conversationId: number; type: string }>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("Événement de messagerie absent.")), 5000);
          parentSocket.addEventListener("message", (event) => {
            const frame = String(event.data);
            if (!frame.startsWith("42")) return;
            const [name, payload] = JSON.parse(frame.slice(2)) as [string, { conversationId: number; type: string }];
            if (name === "conversation:changed" && payload.conversationId === conversationId && payload.type === "MESSAGE") {
              clearTimeout(timeout); resolve(payload);
            }
          });
        });
        const emitted = status(await request<{ messageId: number }>(base, `/conversations/${conversationId}/messages`, "POST", { body: "Événement privé" }, ejeCookie), 201);
        assert.equal((await changed).conversationId, conversationId);
        assert.equal(otherReceived, false);
        const readEvent = new Promise<{ conversationId: number; type: string }>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("Accusé de lecture Socket.IO absent.")), 5000);
          staffSocket.addEventListener("message", (event) => {
            const frame = String(event.data);
            if (!frame.startsWith("42")) return;
            const [name, payload] = JSON.parse(frame.slice(2)) as [string, { conversationId: number; type: string }];
            if (name === "conversation:changed" && payload.conversationId === conversationId && payload.type === "READ") {
              clearTimeout(timeout); resolve(payload);
            }
          });
        });
        status(await request(base, `/conversations/${conversationId}/read`, "POST", { upToMessageId: emitted.messageId }, parentCookie), 204);
        assert.equal((await readEvent).type, "READ");
        status(await request(base, "/auth/logout", "POST", {}, parentCookie), 204);
        let revokedReceived = false;
        parentSocket.addEventListener("message", (event) => {
          if (String(event.data).includes('"conversation:changed"')) revokedReceived = true;
        });
        status(await request(base, `/conversations/${conversationId}/messages`, "POST", { body: "Après révocation" }, ejeCookie), 201);
        await new Promise((resolve) => setTimeout(resolve, 900));
        assert.equal(revokedReceived, false);
        assert.equal(otherReceived, false);
        parentCookie = await cookie(parentA.email);
      } finally {
        for (const socket of sockets) socket.close();
        if (processServer.exitCode === null) {
          const exited = once(processServer, "exit");
          processServer.kill("SIGTERM");
          await exited;
        }
      }
    });

    await t.test("purge paramétrée, conservant les messages récents et l'audit", async () => {
      const old = status(await request<{ messageId: number }>(base, `/conversations/${conversationId}/messages`, "POST", { body: "À effacer après échéance" }, parentCookie), 201);
      const recent = status(await request<{ messageId: number }>(base, `/conversations/${conversationId}/messages`, "POST", { body: "À conserver" }, parentCookie), 201);
      await database.execute("UPDATE official_messages SET created_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 400 DAY) WHERE message_id = ?", [old.messageId]);
      const unusedChild = await child(first.insertId, "Ancien", parentA.id);
      const unused = status(await request<{ conversationId: number }>(base, "/conversations", "POST", { childId: unusedChild }, parentCookie), 201);
      await database.execute("UPDATE official_conversations SET last_activity_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 400 DAY) WHERE conversation_id = ?", [unused.conversationId]);
      await database.execute("UPDATE official_message_events SET created_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 400 DAY) WHERE conversation_id = ? AND event_type = 'CREATED'", [conversationId]);
      await assert.rejects(purgeMessages(0, 365), /durée de conservation/);
      const result = await purgeMessages(365, 730);
      assert.equal(result.messages, 1);
      assert.equal(result.conversations, 1);
      assert.equal(result.events, 1);
      status(await request(base, `/conversations/${unused.conversationId}`, "GET", undefined, parentCookie), 404);
      const visible = status(await request<{ items: Array<{ messageId: number }> }>(base, `/conversations/${conversationId}/messages`, "GET", undefined, parentCookie), 200);
      assert.ok(!visible.items.some((item) => item.messageId === old.messageId));
      assert.ok(visible.items.some((item) => item.messageId === recent.messageId));
      const [audits] = await database.execute<RowDataPacket[]>("SELECT action FROM official_message_audit WHERE conversation_id = ? AND action = 'MESSAGES_PURGED'", [conversationId]);
      assert.equal(audits.length, 1);
      const cli = spawnSync(process.execPath, ["dist/purge-messages.js"], {
        cwd: process.cwd(), encoding: "utf8", timeout: 10000,
        env: { ...process.env, CARELIA_MESSAGE_RETENTION_DAYS: "365", CARELIA_AUDIT_RETENTION_DAYS: "730" }
      });
      assert.equal(cli.status, 0, cli.stderr);
      assert.match(cli.stdout, /Purge terminée : 0 messages/);
      const invalidCli = spawnSync(process.execPath, ["dist/purge-messages.js"], {
        cwd: process.cwd(), encoding: "utf8", timeout: 10000,
        env: { ...process.env, CARELIA_MESSAGE_RETENTION_DAYS: "0", CARELIA_AUDIT_RETENTION_DAYS: "730" }
      });
      assert.equal(invalidCli.status, 1);
      assert.match(invalidCli.stderr, /durée de conservation/);
    });

    await t.test("retrait du lien et désactivation révoquent l'accès", async () => {
      await database.execute("DELETE FROM parent_child_links WHERE child_id = ? AND parent_id = ?", [childA, parentA.id]);
      status(await request(base, `/conversations/${conversationId}`, "GET", undefined, parentCookie), 403);
      status(await request(base, `/conversations/${conversationId}/messages`, "GET", undefined, ejeCookie), 403);
      assert.equal(status(await request<{ total: number }>(base, "/conversations", "GET", undefined, parentCookie), 200).total, 0);
      assert.equal(status(await request<{ total: number }>(base, "/message-notifications", "GET", undefined, parentCookie), 200).total, 0);
    });

    await t.test("plus de 100 conversations sont paginées, compteurs globaux et Swagger", async () => {
      for (let i = 0; i < 101; i++) {
        const childId = await child(first.insertId, `Page${i}`, parentA.id);
        status(await request(base, "/conversations", "POST", { childId }, parentCookie), 201);
      }
      const firstPage = status(await request<{ items: Array<{ conversationId: number }>; total: number; limit: number }>(base, "/conversations?limit=50&offset=0", "GET", undefined, parentCookie), 200);
      const secondPage = status(await request<{ items: Array<{ conversationId: number }>; total: number }>(base, "/conversations?limit=50&offset=50", "GET", undefined, parentCookie), 200);
      const thirdPage = status(await request<{ items: Array<{ conversationId: number }>; total: number }>(base, "/conversations?limit=50&offset=100", "GET", undefined, parentCookie), 200);
      assert.equal(firstPage.total, 101);
      assert.equal(secondPage.total, 101);
      assert.equal(thirdPage.items.length, 1);
      assert.equal(new Set([...firstPage.items, ...secondPage.items, ...thirdPage.items].map((item) => item.conversationId)).size, 101);
      const lastConversationId = thirdPage.items[0]!.conversationId;
      status(await request(base, `/conversations/${lastConversationId}/messages`, "POST", { body: "Message sur la dernière page" }, ejeCookie), 201);
      const firstAfterMessage = status(await request<{ items: Array<{ conversationId: number }>; unreadMessages: number; unreadConversations: number }>(base, "/conversations?limit=50&offset=1", "GET", undefined, parentCookie), 200);
      assert.equal(firstAfterMessage.unreadMessages, 1);
      assert.equal(firstAfterMessage.unreadConversations, 1);
      assert.equal(firstAfterMessage.items.some((item) => item.conversationId === lastConversationId), false);
      const spec = status(await request<{ paths: Record<string, unknown> }>(base, "/docs/openapi.json"), 200);
      for (const path of ["/api/conversations", "/api/conversations/{id}/messages", "/api/conversations/{id}/read", "/api/message-notifications"]) assert.ok(spec.paths[path]);
    });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await database.execute("DELETE FROM official_message_audit WHERE conversation_id IN (SELECT conversation_id FROM official_conversations WHERE daycare_id IN (?, ?)) OR actor_id IN (?, ?, ?, ?, ?, ?, ?)",
      [first.insertId, second.insertId, admin.id, eje.id, auxiliary.id, parentA.id, parentB.id, outsider.id, outsiderParent.id]);
    await database.execute("DELETE FROM children WHERE daycare_id IN (?, ?)", [first.insertId, second.insertId]);
    await database.execute("DELETE FROM users WHERE daycare_id IN (?, ?)", [first.insertId, second.insertId]);
    await database.execute("DELETE FROM daycares WHERE daycare_id IN (?, ?)", [first.insertId, second.insertId]);
    await database.end();
  }
});
