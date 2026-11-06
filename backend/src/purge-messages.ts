import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { database } from "./middlewares/config/database.js";

function cutoff(days: number, now: Date): Date {
  if (!Number.isSafeInteger(days) || days < 1 || days > 3650) {
    throw new Error("La durée de conservation doit être comprise entre 1 et 3650 jours.");
  }
  return new Date(now.getTime() - days * 86_400_000);
}

export async function purgeMessages(messageDays: number, auditDays: number, now = new Date()): Promise<{ messages: number; conversations: number; events: number; audits: number }> {
  const messagesBefore = cutoff(messageDays, now);
  const auditsBefore = cutoff(auditDays, now);
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    const [official_conversations] = await connection.execute<(RowDataPacket & { conversationId: number })[]>(
      "SELECT DISTINCT conversation_id AS conversationId FROM official_messages WHERE created_at < ?",
      [messagesBefore]
    );
    const [removed] = await connection.execute<ResultSetHeader>(
      "DELETE FROM official_messages WHERE created_at < ?", [messagesBefore]
    );
    for (const { conversationId } of official_conversations) {
      await connection.execute(
        "INSERT INTO official_message_audit (conversation_id, action) VALUES (?, 'MESSAGES_PURGED')", [conversationId]
      );
    }
    const [events] = await connection.execute<ResultSetHeader>(
      "DELETE FROM official_message_events WHERE created_at < ?", [messagesBefore]
    );
    const [expiredConversations] = await connection.execute<ResultSetHeader>(
      `DELETE c FROM official_conversations c
       WHERE c.last_activity_at < ? AND NOT EXISTS (
         SELECT 1 FROM official_messages m WHERE m.conversation_id = c.conversation_id
       )`, [messagesBefore]
    );
    const [audits] = await connection.execute<ResultSetHeader>(
      "DELETE FROM official_message_audit WHERE occurred_at < ?", [auditsBefore]
    );
    await connection.commit();
    return { messages: removed.affectedRows, conversations: expiredConversations.affectedRows,
      events: events.affectedRows, audits: audits.affectedRows };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const messageDays = Number(process.env.CARELIA_MESSAGE_RETENTION_DAYS);
  const auditDays = Number(process.env.CARELIA_AUDIT_RETENTION_DAYS);
  purgeMessages(messageDays, auditDays)
    .then((result) => { console.log(`Purge terminée : ${result.messages} messages, ${result.conversations} discussions, ${result.events} événements et ${result.audits} entrées d'audit.`); })
    .catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Purge impossible."); process.exitCode = 1; })
    .finally(() => database.end());
}
