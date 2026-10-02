import { AppointmentStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireAuth, type AuthenticatedRequest } from "../auth/auth.middleware.js";

const reviewSchema = z.object({ appointmentId: z.string().uuid(), rating: z.number().int().min(1).max(5), comment: z.string().trim().min(10).max(1200) });
const reviewUpdateSchema = reviewSchema.omit({ appointmentId: true });
const routeParam = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";
export const reviewRouter = Router();

reviewRouter.post("/specialists/:specialistId/reviews", requireAuth, async (request, response) => {
  const parsed = reviewSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ code: "VALIDATION_ERROR", message: "Перевірте відгук", errors: parsed.error.flatten().fieldErrors });
  const { userId } = (request as AuthenticatedRequest).auth;
  const specialistId = routeParam(request.params.specialistId);
  const specialistOwner = await prisma.specialistProfile.findUnique({ where: { id: specialistId }, select: { userId: true } });
  if (!specialistOwner || specialistOwner.userId === userId) return response.status(403).json({ code: "REVIEW_NOT_ALLOWED", message: "Не можна залишити відгук самому собі" });
  const appointment = await prisma.appointment.findFirst({ where: { id: parsed.data.appointmentId, clientId: userId, specialistId, status: AppointmentStatus.COMPLETED }, select: { id: true } });
  if (!appointment) return response.status(403).json({ code: "REVIEW_NOT_ALLOWED", message: "Відгук можна залишити лише після завершеної консультації" });
  if (await prisma.review.findUnique({ where: { appointmentId: appointment.id } })) return response.status(409).json({ code: "REVIEW_EXISTS", message: "Для цієї консультації відгук уже залишено" });
  const review = await prisma.$transaction(async (transaction) => {
    const created = await transaction.review.create({ data: { appointmentId: appointment.id, clientId: userId, specialistId, rating: parsed.data.rating, comment: parsed.data.comment }, include: { client: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } } });
    await transaction.notification.create({ data: {
      userId: specialistOwner.userId,
      type: "REVIEW_RECEIVED",
      titleUk: "Новий відгук",
      titleEn: "New review",
      bodyUk: `${created.client.firstName} залишив(-ла) оцінку ${created.rating}/5`,
      bodyEn: `${created.client.firstName} left a ${created.rating}/5 rating`,
      href: `/specialists/${specialistId}#reviews`,
    } });
    return created;
  });
  response.status(201).json({ review });
});

reviewRouter.patch("/reviews/:reviewId", requireAuth, async (request, response) => {
  const parsed = reviewUpdateSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ code: "VALIDATION_ERROR", message: "Перевірте відгук", errors: parsed.error.flatten().fieldErrors });
  const { userId } = (request as AuthenticatedRequest).auth;
  const existing = await prisma.review.findFirst({ where: { id: routeParam(request.params.reviewId), clientId: userId } });
  if (!existing) return response.status(404).json({ code: "REVIEW_NOT_FOUND", message: "Відгук не знайдено" });
  const review = await prisma.review.update({ where: { id: existing.id }, data: parsed.data, include: { client: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } } });
  response.json({ review });
});

reviewRouter.delete("/reviews/:reviewId", requireAuth, async (request, response) => {
  const { userId } = (request as AuthenticatedRequest).auth;
  const result = await prisma.review.deleteMany({ where: { id: routeParam(request.params.reviewId), clientId: userId } });
  if (!result.count) return response.status(404).json({ code: "REVIEW_NOT_FOUND", message: "Відгук не знайдено" });
  response.status(204).send();
});
