import { Router } from "express";
import { AppError } from "../../errors/app-error.js";
import { actorOf, requireRole } from "../auth/auth.js";
import { asyncHandler, parseId } from "../shared/http-utils.js";
import { executeStatement, selectRows } from "../shared/repository-utils.js";

export const notificationsRouter = Router();

notificationsRouter.get("/", asyncHandler(async (_request, response) => {
  const actor = actorOf(response.locals);
  requireRole(actor, "PARENT");
  response.json(await selectRows(
    `SELECT n.notification_id AS notificationId, n.report_id AS reportId,
      r.child_id AS childId, DATE_FORMAT(r.report_date, '%Y-%m-%d') AS reportDate,
      CONCAT(c.first_name, ' ', c.last_name) AS childName,
      n.created_at AS createdAt, n.read_at AS readAt
     FROM report_notifications n JOIN daily_reports r ON r.daily_report_id = n.report_id
     JOIN children c ON c.child_id = r.child_id
     JOIN parent_child_links l ON l.child_id = c.child_id AND l.parent_id = n.parent_id
     WHERE n.parent_id = ? AND c.daycare_id = ? AND r.status = 'PUBLISHED'
     ORDER BY n.created_at DESC LIMIT 100`, [actor.userId, actor.daycareId]
  ));
}));

notificationsRouter.patch("/:id/read", asyncHandler(async (request, response) => {
  const actor = actorOf(response.locals);
  requireRole(actor, "PARENT");
  const id = parseId(request.params.id);
  const visible = await selectRows(
    `SELECT n.notification_id FROM report_notifications n
     JOIN daily_reports r ON r.daily_report_id = n.report_id AND r.status = 'PUBLISHED'
     JOIN children c ON c.child_id = r.child_id AND c.daycare_id = ?
     JOIN parent_child_links l ON l.child_id = c.child_id AND l.parent_id = n.parent_id
     WHERE n.notification_id = ? AND n.parent_id = ?`,
    [actor.daycareId, id, actor.userId]
  );
  if (!visible.length) throw new AppError("Notification introuvable.", 404);
  await executeStatement(
    `UPDATE report_notifications n
     JOIN daily_reports r ON r.daily_report_id = n.report_id AND r.status = 'PUBLISHED'
     JOIN children c ON c.child_id = r.child_id AND c.daycare_id = ?
     JOIN parent_child_links l ON l.child_id = c.child_id AND l.parent_id = n.parent_id
     SET n.read_at = COALESCE(n.read_at, UTC_TIMESTAMP(3))
     WHERE n.notification_id = ? AND n.parent_id = ?`,
    [actor.daycareId, id, actor.userId]
  );
  response.status(204).send();
}));
