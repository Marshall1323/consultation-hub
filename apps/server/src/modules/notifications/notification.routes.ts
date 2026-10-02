import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { requireAuth, type AuthenticatedRequest } from "../auth/auth.middleware.js";

export const notificationRouter = Router();
notificationRouter.use(requireAuth);

notificationRouter.get("/notifications", async (request, response) => {
  const { userId } = (request as unknown as AuthenticatedRequest).auth;
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  response.json({ notifications, unreadCount });
});

notificationRouter.patch("/notifications/:notificationId/read", async (request, response) => {
  const { userId } = (request as unknown as AuthenticatedRequest).auth;
  const result = await prisma.notification.updateMany({
    where: { id: String(request.params.notificationId), userId },
    data: { readAt: new Date() },
  });
  if (!result.count) return response.status(404).json({ code: "NOTIFICATION_NOT_FOUND", message: "Повідомлення не знайдено" });
  response.status(204).send();
});

notificationRouter.patch("/notifications/read-all", async (request, response) => {
  const { userId } = (request as AuthenticatedRequest).auth;
  await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  response.status(204).send();
});
