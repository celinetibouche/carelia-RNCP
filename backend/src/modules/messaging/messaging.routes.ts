import { Router } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { AppError } from "../../errors/app-error.js";
import { toDatabaseError } from "../../errors/database-error.js";
import { database } from "../../middlewares/config/database.js";
import { actorOf, requireRole, type Actor } from "../auth/auth.js";
import { asyncHandler, parseId, readObject, rejectUnknownFields, requiredPositiveInteger, requiredString } from "../shared/http-utils.js";
import { selectRows } from "../shared/repository-utils.js";

type Conversation = RowDataPacket & {
  conversationId: number; daycareId: number; childId: number; parentId: number;
  childFirstName: string; childLastName: string; parentFirstName: string; parentLastName: string;
  createdAt: Date; lastActivityAt: Date; childActive: number; parentActive: number; linked: number;
};

const conversationColumns = `c.conversation_id AS conversationId, c.daycare_id AS daycareId,
  c.child_id AS childId, c.parent_id AS parentId, c.created_at AS createdAt,
  c.last_activity_at AS lastActivityAt, ch.first_name AS childFirstName,
  ch.last_name AS childLastName, ch.is_active AS childActive,
  p.first_name AS parentFirstName, p.last_name AS parentLastName, p.is_active AS parentActive,
  EXISTS(SELECT 1 FROM parent_child_links l WHERE l.child_id = c.child_id AND l.parent_id = c.parent_id) AS linked`;

export async function requireConversationAccess(actor: Actor, conversationId: number): Promise<Conversation> {
  const rows = await selectRows<Conversation>(
    `SELECT ${conversationColumns} FROM official_conversations c
     JOIN children ch ON ch.child_id = c.child_id JOIN users p ON p.user_id = c.parent_id
     WHERE c.conversation_id = ?`, [conversationId]
  );
  const conversation = rows[0];
  if (!conversation) throw new AppError("Conversation introuvable.", 404);
  if (conversation.daycareId !== actor.daycareId || !conversation.childActive ||
      !conversation.parentActive || !conversation.linked) throw new AppError("Accès interdit.", 403);
  if (actor.role === "PARENT") {
    if (conversation.parentId !== actor.userId) throw new AppError("Accès interdit.", 403);
  } else requireRole(actor, "DAYCARE_ADMIN", "EJE");
  return conversation;
}

function page(query: Record<string, unknown>, key: string, fallback: number, max: number): number {
  const value = query[key];
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^\d+$/.test(value)) throw new AppError(`Paramètre ${key} invalide.`, 400);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < (key === "offset" ? 0 : 1) || parsed > max) {
    throw new AppError(`Paramètre ${key} invalide.`, 400);
  }
  return parsed;
}

function searchTerm(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value !== "string" || value.trim().length > 100) throw new AppError("Recherche invalide.", 400);
  return value.trim();
}

function scope(actor: Actor): { where: string; params: Array<string | number> } {
  if (actor.role !== "PARENT") requireRole(actor, "DAYCARE_ADMIN", "EJE");
  return {
    where: `c.daycare_id = ? AND ch.is_active = 1 AND p.is_active = 1
      AND EXISTS(SELECT 1 FROM parent_child_links l WHERE l.child_id = c.child_id AND l.parent_id = c.parent_id)
      ${actor.role === "PARENT" ? "AND c.parent_id = ?" : ""}`,
    params: actor.role === "PARENT" ? [actor.daycareId, actor.userId] : [actor.daycareId]
  };
}

const baseJoins = `FROM official_conversations c JOIN children ch ON ch.child_id = c.child_id
  JOIN users p ON p.user_id = c.parent_id`;

async function conversationView(actor: Actor, conversationId: number) {
  const conversation = await requireConversationAccess(actor, conversationId);
  const [unread] = await database.execute<(RowDataPacket & { unreadCount: number })[]>(
    `SELECT COUNT(*) AS unreadCount FROM official_message_recipients r
     JOIN official_messages m ON m.message_id = r.message_id
     WHERE m.conversation_id = ? AND r.recipient_id = ? AND r.read_at IS NULL`,
    [conversationId, actor.userId]
  );
  const { childActive, parentActive, linked, ...visible } = conversation;
  void childActive; void parentActive; void linked;
  return { ...visible, unreadCount: unread[0]?.unreadCount ?? 0 };
}

export const conversationsRouter = Router();
export const messageNotificationsRouter = Router();

// Règle reprise de staging : les parents écrivent à l'équipe, jamais à d'autres parents.
// L'annuaire parental avec opt-in relève de F4 et ne crée pas de groupe ici.

conversationsRouter.get("/", asyncHandler(async (request, response) => {
  const actor = actorOf(response.locals);
  const { where, params } = scope(actor);
  const limit = page(request.query, "limit", 30, 50);
  const offset = page(request.query, "offset", 0, 100000);
  const search = searchTerm(request.query.search);
  const filter = `${where} AND (? = '' OR CONCAT(ch.first_name, ' ', ch.last_name) LIKE ?
    OR CONCAT(p.first_name, ' ', p.last_name) LIKE ?)`;
  const searchParams = [...params, search, `%${search}%`, `%${search}%`];
  const unreadJoin = `LEFT JOIN (SELECT m.conversation_id, COUNT(*) AS unreadCount
    FROM official_message_recipients r JOIN official_messages m ON m.message_id = r.message_id
    WHERE r.recipient_id = ? AND r.read_at IS NULL GROUP BY m.conversation_id) u
    ON u.conversation_id = c.conversation_id`;
  const [rows] = await database.query<(Conversation & { unreadCount: number })[]>(
    `SELECT ${conversationColumns}, COALESCE(u.unreadCount, 0) AS unreadCount
     ${baseJoins} ${unreadJoin} WHERE ${filter}
     ORDER BY c.last_activity_at DESC, c.conversation_id DESC LIMIT ? OFFSET ?`,
    [actor.userId, ...searchParams, limit, offset]
  );
  const [counts] = await database.execute<(RowDataPacket & { total: number; unreadConversations: number; unreadMessages: number })[]>(
    `SELECT COUNT(*) AS total, COALESCE(SUM(u.unreadCount > 0), 0) AS unreadConversations,
      COALESCE(SUM(u.unreadCount), 0) AS unreadMessages
     ${baseJoins} ${unreadJoin} WHERE ${filter}`,
    [actor.userId, ...searchParams]
  );
  response.json({ items: rows.map(({ childActive, parentActive, linked, ...item }) => {
    void childActive; void parentActive; void linked;
    return item;
  }), total: Number(counts[0]?.total ?? 0), unreadConversations: Number(counts[0]?.unreadConversations ?? 0),
    unreadMessages: Number(counts[0]?.unreadMessages ?? 0), limit, offset });
}));

conversationsRouter.post("/", asyncHandler(async (request, response) => {
  const actor = actorOf(response.locals);
  const body = readObject(request.body);
  rejectUnknownFields(body, ["childId", "parentId"]);
  if (actor.role !== "PARENT") requireRole(actor, "DAYCARE_ADMIN", "EJE");
  const childId = requiredPositiveInteger(body, "childId");
  const parentId = actor.role === "PARENT" ? actor.userId : requiredPositiveInteger(body, "parentId");
  if (actor.role === "PARENT" && body.parentId !== undefined) throw new AppError("Parent non autorisé.", 403);
  const [eligible] = await database.execute<RowDataPacket[]>(
    `SELECT 1 FROM children ch JOIN parent_child_links l ON l.child_id = ch.child_id
     JOIN users p ON p.user_id = l.parent_id JOIN roles r ON r.role_id = p.role_id
     WHERE ch.child_id = ? AND ch.daycare_id = ? AND ch.is_active = 1
       AND l.parent_id = ? AND p.daycare_id = ? AND p.is_active = 1 AND r.label = 'PARENT'`,
    [childId, actor.daycareId, parentId, actor.daycareId]
  );
  if (!eligible.length) throw new AppError("Parent ou enfant inaccessible.", 403);
  const [existing] = await database.execute<(RowDataPacket & { conversationId: number })[]>(
    "SELECT conversation_id AS conversationId FROM official_conversations WHERE child_id = ? AND parent_id = ?",
    [childId, parentId]
  );
  if (existing[0]) {
    response.status(200).json(await conversationView(actor, existing[0].conversationId));
    return;
  }
  const connection = await database.getConnection();
  let createdId = 0;
  try {
    await connection.beginTransaction();
    const [stillEligible] = await connection.execute<RowDataPacket[]>(
      `SELECT 1 FROM children ch JOIN parent_child_links l ON l.child_id = ch.child_id
       JOIN users p ON p.user_id = l.parent_id JOIN roles r ON r.role_id = p.role_id
       WHERE ch.child_id = ? AND ch.daycare_id = ? AND ch.is_active = 1
         AND l.parent_id = ? AND p.daycare_id = ? AND p.is_active = 1 AND r.label = 'PARENT' FOR SHARE`,
      [childId, actor.daycareId, parentId, actor.daycareId]
    );
    if (!stillEligible.length) throw new AppError("Parent ou enfant inaccessible.", 403);
    const [result] = await connection.execute<ResultSetHeader>(
      "INSERT INTO official_conversations (daycare_id, child_id, parent_id) VALUES (?, ?, ?)",
      [actor.daycareId, childId, parentId]
    );
    await connection.execute(
      "INSERT INTO official_message_audit (actor_id, conversation_id, action) VALUES (?, ?, 'CONVERSATION_CREATED')",
      [actor.userId, result.insertId]
    );
    await connection.execute(
      "INSERT INTO official_message_events (conversation_id, event_type) VALUES (?, 'CREATED')", [result.insertId]
    );
    await connection.commit();
    createdId = result.insertId;
  } catch (error) {
    await connection.rollback();
    if ((error as { code?: string }).code === "ER_DUP_ENTRY") {
      const [raced] = await database.execute<(RowDataPacket & { conversationId: number })[]>(
        "SELECT conversation_id AS conversationId FROM official_conversations WHERE child_id = ? AND parent_id = ?",
        [childId, parentId]
      );
      if (raced[0]) { response.status(200).json(await conversationView(actor, raced[0].conversationId)); return; }
    }
    throw toDatabaseError(error);
  }
  finally { connection.release(); }
  response.status(201).json(await conversationView(actor, createdId));
}));

conversationsRouter.get("/:id", asyncHandler(async (request, response) => {
  response.json(await conversationView(actorOf(response.locals), parseId(request.params.id)));
}));

conversationsRouter.get("/:id/messages", asyncHandler(async (request, response) => {
  const actor = actorOf(response.locals);
  const id = parseId(request.params.id);
  await requireConversationAccess(actor, id);
  const limit = page(request.query, "limit", 50, 100);
  const beforeId = request.query.beforeId === undefined ? null : parseId(request.query.beforeId);
  const [rows] = await database.query<RowDataPacket[]>(
    `SELECT m.message_id AS messageId, m.conversation_id AS conversationId, m.sender_id AS senderId,
      u.first_name AS senderFirstName, u.last_name AS senderLastName, m.body, m.created_at AS createdAt,
      (SELECT MIN(r.read_at) FROM official_message_recipients r WHERE r.message_id = m.message_id) AS firstReadAt,
      (SELECT r.read_at FROM official_message_recipients r WHERE r.message_id = m.message_id AND r.recipient_id = ?) AS myReadAt
     FROM official_messages m JOIN users u ON u.user_id = m.sender_id
     WHERE m.conversation_id = ? AND (? IS NULL OR m.message_id < ?)
     ORDER BY m.message_id DESC LIMIT ?`,
    [actor.userId, id, beforeId, beforeId, limit + 1]
  );
  response.json({ items: rows.slice(0, limit).reverse(), hasMore: rows.length > limit });
}));

conversationsRouter.post("/:id/messages", asyncHandler(async (request, response) => {
  const actor = actorOf(response.locals);
  const id = parseId(request.params.id);
  const conversation = await requireConversationAccess(actor, id);
  const body = readObject(request.body);
  rejectUnknownFields(body, ["body"]);
  const content = requiredString(body, "body", 2000);
  const connection = await database.getConnection();
  let sentMessageId = 0;
  try {
    await connection.beginTransaction();
    const [linked] = await connection.execute<RowDataPacket[]>(
      `SELECT 1 FROM official_conversations c JOIN children ch ON ch.child_id = c.child_id
       JOIN parent_child_links l ON l.child_id = c.child_id AND l.parent_id = c.parent_id
       JOIN users p ON p.user_id = c.parent_id
       WHERE c.conversation_id = ? AND c.daycare_id = ? AND ch.is_active = 1 AND p.is_active = 1 FOR SHARE`,
      [id, actor.daycareId]
    );
    if (!linked.length) throw new AppError("Accès interdit.", 403);
    const recipients = actor.role === "PARENT" ? await connection.execute<(RowDataPacket & { userId: number })[]>(
      `SELECT u.user_id AS userId FROM users u JOIN roles r ON r.role_id = u.role_id
       WHERE u.daycare_id = ? AND u.is_active = 1 AND r.label IN ('DAYCARE_ADMIN', 'EJE')`, [actor.daycareId]
    ).then(([rows]) => rows.map((row) => row.userId)) : [conversation.parentId];
    if (!recipients.length) throw new AppError("Aucun destinataire disponible.", 409);
    const [result] = await connection.execute<ResultSetHeader>(
      "INSERT INTO official_messages (conversation_id, sender_id, body) VALUES (?, ?, ?)", [id, actor.userId, content]
    );
    for (const recipientId of recipients) await connection.execute(
      "INSERT INTO official_message_recipients (message_id, recipient_id) VALUES (?, ?)", [result.insertId, recipientId]
    );
    await connection.execute("UPDATE official_conversations SET last_activity_at = UTC_TIMESTAMP(3) WHERE conversation_id = ?", [id]);
    await connection.execute(
      "INSERT INTO official_message_events (conversation_id, message_id, event_type) VALUES (?, ?, 'MESSAGE')",
      [id, result.insertId]
    );
    await connection.execute(
      "INSERT INTO official_message_audit (actor_id, conversation_id, action) VALUES (?, ?, 'MESSAGE_SENT')",
      [actor.userId, id]
    );
    await connection.commit();
    sentMessageId = result.insertId;
  } catch (error) { await connection.rollback(); throw toDatabaseError(error); }
  finally { connection.release(); }
  const [stored] = await database.execute<RowDataPacket[]>(
    `SELECT m.message_id AS messageId, m.conversation_id AS conversationId, m.sender_id AS senderId,
     u.first_name AS senderFirstName, u.last_name AS senderLastName,
     m.body, m.created_at AS createdAt, NULL AS firstReadAt, NULL AS myReadAt
     FROM official_messages m JOIN users u ON u.user_id = m.sender_id WHERE m.message_id = ?`,
    [sentMessageId]
  );
  response.status(201).json(stored[0]);
}));

conversationsRouter.post("/:id/read", asyncHandler(async (request, response) => {
  const actor = actorOf(response.locals);
  const id = parseId(request.params.id);
  await requireConversationAccess(actor, id);
  const body = readObject(request.body);
  rejectUnknownFields(body, ["upToMessageId"]);
  const upToMessageId = requiredPositiveInteger(body, "upToMessageId");
  const [message] = await database.execute<RowDataPacket[]>(
    "SELECT 1 FROM official_messages WHERE conversation_id = ? AND message_id = ?", [id, upToMessageId]
  );
  if (!message.length) throw new AppError("Message introuvable.", 404);
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    const [linked] = await connection.execute<RowDataPacket[]>(
      `SELECT 1 FROM official_conversations c JOIN children ch ON ch.child_id = c.child_id
       JOIN parent_child_links l ON l.child_id = c.child_id AND l.parent_id = c.parent_id
       JOIN users p ON p.user_id = c.parent_id
       WHERE c.conversation_id = ? AND c.daycare_id = ? AND ch.is_active = 1 AND p.is_active = 1 FOR SHARE`,
      [id, actor.daycareId]
    );
    if (!linked.length) throw new AppError("Accès interdit.", 403);
    const [result] = await connection.execute<ResultSetHeader>(
      `UPDATE official_message_recipients r JOIN official_messages m ON m.message_id = r.message_id
       SET r.read_at = COALESCE(r.read_at, UTC_TIMESTAMP(3))
       WHERE m.conversation_id = ? AND m.message_id <= ? AND r.recipient_id = ? AND r.read_at IS NULL`,
      [id, upToMessageId, actor.userId]
    );
    if (result.affectedRows) {
      await connection.execute(
        "INSERT INTO official_message_events (conversation_id, message_id, event_type) VALUES (?, ?, 'READ')",
        [id, upToMessageId]
      );
      await connection.execute(
        "INSERT INTO official_message_audit (actor_id, conversation_id, action) VALUES (?, ?, 'MESSAGE_READ')",
        [actor.userId, id]
      );
    }
    await connection.commit();
    response.status(204).send();
  } catch (error) { await connection.rollback(); throw toDatabaseError(error); }
  finally { connection.release(); }
}));

messageNotificationsRouter.get("/", asyncHandler(async (request, response) => {
  const actor = actorOf(response.locals);
  const { where, params } = scope(actor);
  const limit = page(request.query, "limit", 30, 50);
  const offset = page(request.query, "offset", 0, 100000);
  const from = `FROM official_message_recipients r JOIN official_messages m ON m.message_id = r.message_id
    JOIN official_conversations c ON c.conversation_id = m.conversation_id
    JOIN children ch ON ch.child_id = c.child_id JOIN users p ON p.user_id = c.parent_id`;
  const filter = `r.recipient_id = ? AND ${where}`;
  const [items] = await database.query<RowDataPacket[]>(
    `SELECT m.message_id AS messageId, c.conversation_id AS conversationId,
      c.child_id AS childId, CONCAT(ch.first_name, ' ', ch.last_name) AS childName,
      m.created_at AS createdAt, r.read_at AS readAt
     ${from} WHERE ${filter} ORDER BY m.message_id DESC LIMIT ? OFFSET ?`,
    [actor.userId, ...params, limit, offset]
  );
  const [counts] = await database.execute<(RowDataPacket & { total: number; unread: number })[]>(
    `SELECT COUNT(*) AS total, COALESCE(SUM(r.read_at IS NULL), 0) AS unread
     ${from} WHERE ${filter}`, [actor.userId, ...params]
  );
  response.json({ items, total: Number(counts[0]?.total ?? 0), unread: Number(counts[0]?.unread ?? 0), limit, offset });
}));
