import { createServer } from "node:http";

import { Server } from "socket.io";
import type { RowDataPacket } from "mysql2";

import { app } from "./app.js";
import { checkDatabaseConnection, database } from "./middlewares/config/database.js";
import { env } from "./middlewares/config/env.js";
import { migrate } from "./migrate.js";
import { actorFromToken, requireReportAccess, tokenFromCookie } from "./modules/auth/auth.js";
import { requireConversationAccess } from "./modules/messaging/messaging.routes.js";

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: env.corsOrigin,
    credentials: true
  }
});

io.use(async (socket, next) => {
  try {
    const handshakeToken = socket.handshake.auth.token;
    const token = typeof handshakeToken === "string" && /^[a-f0-9]{64}$/i.test(handshakeToken)
      ? handshakeToken : tokenFromCookie(socket.request.headers.cookie);
    const actor = await actorFromToken(token);
    if (!actor) return next(new Error("Authentification requise."));
    socket.data.token = token;
    socket.data.actor = actor;
    next();
  } catch (error) { next(error instanceof Error ? error : new Error("Authentification impossible.")); }
});

io.on("connection", (socket) => {
  const actor = socket.data.actor as NonNullable<Awaited<ReturnType<typeof actorFromToken>>>;
  if (actor.role === "PARENT") void socket.join(`messaging:parent:${actor.userId}`);
  else if (actor.role === "DAYCARE_ADMIN" || actor.role === "EJE") void socket.join(`messaging:daycare:${actor.daycareId}`);
  socket.emit("connected", {
    service: "carelia-api",
    timestamp: new Date().toISOString()
  });
  socket.on("report:join", async (reportId: unknown, reply?: (result: { ok: boolean; error?: string }) => void) => {
    try {
      if (typeof reportId !== "number" || !Number.isSafeInteger(reportId) || reportId < 1) throw new Error("Identifiant invalide.");
      const actor = await actorFromToken(socket.data.token);
      if (!actor) throw new Error("Session révoquée.");
      await requireReportAccess(actor, reportId);
      await socket.join(`report:${reportId}`);
      reply?.({ ok: true });
    } catch { reply?.({ ok: false, error: "Accès interdit." }); }
  });
});

type ReportEvent = RowDataPacket & {
  eventId: number; reportId: number; childId: number; revision: number; status: string;
};
let lastEventId = 0;
let lastMessageEventId = 0;
let polling = false;
let messagePolling = false;
let eventTimer: NodeJS.Timeout | undefined;

async function broadcast(change: ReportEvent): Promise<void> {
  const room = `report:${change.reportId}`;
  const sockets = await io.in(room).fetchSockets();
  await Promise.all(sockets.map(async (socket) => {
    try {
      const actor = await actorFromToken(socket.data.token);
      if (!actor) throw new Error("Session révoquée.");
      await requireReportAccess(actor, change.reportId);
      socket.emit("report:changed", {
        reportId: change.reportId, childId: change.childId,
        revision: change.revision, status: change.status
      });
    } catch { socket.leave(room); }
  }));
}

async function pollReportEvents(): Promise<void> {
  if (polling) return;
  polling = true;
  try {
    const [events] = await database.execute<ReportEvent[]>(
      `SELECT event_id AS eventId, report_id AS reportId, child_id AS childId, revision, status
       FROM report_events WHERE event_id > ? ORDER BY event_id LIMIT 100`, [lastEventId]
    );
    for (const event of events) {
      await broadcast(event);
      lastEventId = event.eventId;
    }
  } catch (error) { console.error("Synchronisation des bulletins indisponible.", error); }
  finally { polling = false; }
}

type MessageEvent = RowDataPacket & { eventId: number; conversationId: number; eventType: "CREATED" | "MESSAGE" | "READ" };

async function broadcastMessage(change: MessageEvent): Promise<void> {
  const [rows] = await database.execute<(RowDataPacket & { daycareId: number; parentId: number })[]>(
    "SELECT daycare_id AS daycareId, parent_id AS parentId FROM official_conversations WHERE conversation_id = ?",
    [change.conversationId]
  );
  const conversation = rows[0];
  if (!conversation) return;
  const sockets = await io.in([`messaging:daycare:${conversation.daycareId}`, `messaging:parent:${conversation.parentId}`]).fetchSockets();
  await Promise.all(sockets.map(async (socket) => {
    try {
      const actor = await actorFromToken(socket.data.token);
      if (!actor) throw new Error("Session révoquée.");
      await requireConversationAccess(actor, change.conversationId);
      socket.emit("conversation:changed", { conversationId: change.conversationId, type: change.eventType });
    } catch {
      socket.leave(`messaging:daycare:${conversation.daycareId}`);
      socket.leave(`messaging:parent:${conversation.parentId}`);
    }
  }));
}

async function pollMessageEvents(): Promise<void> {
  if (messagePolling) return;
  messagePolling = true;
  try {
    const [events] = await database.execute<MessageEvent[]>(
      `SELECT event_id AS eventId, conversation_id AS conversationId, event_type AS eventType
       FROM official_message_events WHERE event_id > ? ORDER BY event_id LIMIT 100`, [lastMessageEventId]
    );
    for (const event of events) {
      await broadcastMessage(event);
      lastMessageEventId = event.eventId;
    }
  } catch (error) { console.error("Synchronisation de la messagerie indisponible.", error instanceof Error ? error.name : "Erreur"); }
  finally { messagePolling = false; }
}

async function start(): Promise<void> {
  await migrate();
  await checkDatabaseConnection();
  if (env.serviceName === "carelia-users-api" || env.serviceName === "carelia-api") {
    const [rows] = await database.query<(RowDataPacket & { lastId: number })[]>(
      "SELECT COALESCE(MAX(event_id), 0) AS lastId FROM report_events"
    );
    lastEventId = rows[0]?.lastId ?? 0;
    const [messageRows] = await database.query<(RowDataPacket & { lastId: number })[]>(
      "SELECT COALESCE(MAX(event_id), 0) AS lastId FROM official_message_events"
    );
    lastMessageEventId = messageRows[0]?.lastId ?? 0;
    eventTimer = setInterval(() => { void pollReportEvents(); void pollMessageEvents(); }, 400);
  }

  httpServer.listen(env.port, "0.0.0.0", () => {
    console.log(`Carelia API démarrée sur le port ${env.port}.`);
  });
}

async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} reçu, arrêt de Carelia API.`);

  if (eventTimer) clearInterval(eventTimer);
  io.close();
  httpServer.close(async () => {
    await database.end();
    process.exit(0);
  });
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

start().catch((error: unknown) => {
  console.error("Impossible de démarrer Carelia API.", error);
  process.exit(1);
});
