import { AppointmentStatus, Prisma, UserRole } from "@prisma/client";
import { Router } from "express";
import type { Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../auth/auth.middleware.js";
import { appointmentInclude } from "./appointment.select.js";
import { availabilityQuerySchema, createAppointmentSchema } from "./appointment.schemas.js";
import { AvailabilityError, getAvailableSlots, localDate } from "./availability.service.js";
import { schedulingConfig } from "./scheduling.config.js";

export const appointmentRouter = Router();

const invalid = (response: Response, errors: unknown) =>
  response.status(400).json({ code: "VALIDATION_ERROR", message: "Перевірте введені дані", errors });

appointmentRouter.get("/availability", async (request, response) => {
  const parsed = availabilityQuerySchema.safeParse(request.query);
  if (!parsed.success) return invalid(response, parsed.error.flatten().fieldErrors);

  try {
    const slots = await getAvailableSlots(parsed.data);
    response.json({
      date: parsed.data.date,
      timeZone: schedulingConfig.timeZone,
      slots: slots.map((slot) => ({ startsAt: slot.start.toISOString(), endsAt: slot.end.toISOString() })),
    });
  } catch (error) {
    if (error instanceof AvailabilityError) {
      response.status(error.status).json({ code: error.code, message: error.message });
      return;
    }
    throw error;
  }
});

appointmentRouter.get("/appointments/me", requireAuth, async (request, response) => {
  const { userId } = (request as AuthenticatedRequest).auth;
  type CalendarRow = {
    id: string; clientId: string; specialistId: string; serviceId: string; priceCents: number | null;
    startsAt: Date; endsAt: Date; status: AppointmentStatus; clientNote: string | null; createdAt: Date; updatedAt: Date;
    clientFirstName: string; clientLastName: string; clientEmail: string; clientAvatarUrl: string | null;
    specializationUk: string; specializationEn: string | null; specialistPhotoUrl: string | null; specialistUserId: string;
    specialistFirstName: string; specialistLastName: string; specialistAvatarUrl: string | null;
    serviceNameUk: string; serviceNameEn: string; serviceDurationMin: number; servicePriceCents: number | null;
  };
  const rows = await prisma.$queryRaw<CalendarRow[]>(Prisma.sql`
    SELECT
      appointment."id", appointment."clientId", appointment."specialistId", appointment."serviceId",
      appointment."priceCents", appointment."startsAt", appointment."endsAt", appointment."status",
      appointment."clientNote", appointment."createdAt", appointment."updatedAt",
      client."firstName" AS "clientFirstName", client."lastName" AS "clientLastName",
      client."email" AS "clientEmail",
      CASE WHEN specialist."userId" = ${userId} THEN client."avatarUrl" ELSE NULL END AS "clientAvatarUrl",
      specialist."specializationUk", specialist."specializationEn",
      CASE WHEN appointment."clientId" = ${userId} THEN specialist."photoUrl" ELSE NULL END AS "specialistPhotoUrl",
      specialist_user."id" AS "specialistUserId", specialist_user."firstName" AS "specialistFirstName",
      specialist_user."lastName" AS "specialistLastName",
      CASE WHEN appointment."clientId" = ${userId} THEN specialist_user."avatarUrl" ELSE NULL END AS "specialistAvatarUrl",
      service."nameUk" AS "serviceNameUk", service."nameEn" AS "serviceNameEn",
      service."durationMin" AS "serviceDurationMin", service."priceCents" AS "servicePriceCents"
    FROM "Appointment" AS appointment
    JOIN "User" AS client ON client."id" = appointment."clientId"
    JOIN "SpecialistProfile" AS specialist ON specialist."id" = appointment."specialistId"
    JOIN "User" AS specialist_user ON specialist_user."id" = specialist."userId"
    JOIN "Service" AS service ON service."id" = appointment."serviceId"
    WHERE appointment."clientId" = ${userId} OR specialist."userId" = ${userId}
    ORDER BY appointment."startsAt" DESC
  `);
  const appointments = rows.map((row) => ({
    id: row.id, clientId: row.clientId, specialistId: row.specialistId, serviceId: row.serviceId,
    priceCents: row.priceCents, startsAt: row.startsAt, endsAt: row.endsAt, status: row.status,
    clientNote: row.clientNote, createdAt: row.createdAt, updatedAt: row.updatedAt,
    client: { id: row.clientId, firstName: row.clientFirstName, lastName: row.clientLastName, email: row.clientEmail, avatarUrl: row.clientAvatarUrl },
    specialist: {
      id: row.specialistId, specializationUk: row.specializationUk, specializationEn: row.specializationEn,
      photoUrl: row.specialistPhotoUrl,
      user: { id: row.specialistUserId, firstName: row.specialistFirstName, lastName: row.specialistLastName, avatarUrl: row.specialistAvatarUrl },
    },
    service: { id: row.serviceId, nameUk: row.serviceNameUk, nameEn: row.serviceNameEn, durationMin: row.serviceDurationMin, priceCents: row.servicePriceCents },
  }));
  response.json({ appointments });
});

appointmentRouter.post(
  "/appointments",
  requireAuth,
  requireRole(UserRole.CLIENT, UserRole.SPECIALIST, UserRole.ADMIN),
  async (request, response) => {
    const parsed = createAppointmentSchema.safeParse(request.body);
    if (!parsed.success) return invalid(response, parsed.error.flatten().fieldErrors);

    const { userId } = (request as AuthenticatedRequest).auth;
    const requestedStart = new Date(parsed.data.startsAt);
    const date = localDate(requestedStart);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const appointment = await prisma.$transaction(async (transaction) => {
          const slots = await getAvailableSlots({
            specialistId: parsed.data.specialistId,
            serviceId: parsed.data.serviceId,
            date,
            database: transaction,
          });
          const slot = slots.find((item) => item.start.getTime() === requestedStart.getTime());
          if (!slot) throw new AvailabilityError("SLOT_UNAVAILABLE", "Обраний час уже недоступний", 409);

          const assignment = await transaction.specialistService.findUnique({
            where: { specialistId_serviceId: { specialistId: parsed.data.specialistId, serviceId: parsed.data.serviceId } },
            include: { service: { select: { priceCents: true } } },
          });
          if (!assignment) throw new AvailabilityError("SPECIALIST_SERVICE_NOT_FOUND", "Послуга недоступна для цього спеціаліста", 404);

          const clientConflict = await transaction.appointment.findFirst({
            where: {
              clientId: userId,
              status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
              startsAt: { lt: slot.end },
              endsAt: { gt: slot.start },
            },
          });
          if (clientConflict) {
            throw new AvailabilityError("CLIENT_TIME_CONFLICT", "У вас вже є запис на цей час", 409);
          }

          const created = await transaction.appointment.create({
            data: {
              clientId: userId,
              specialistId: parsed.data.specialistId,
              serviceId: parsed.data.serviceId,
              priceCents: assignment.priceCents ?? assignment.service.priceCents,
              startsAt: slot.start,
              endsAt: slot.end,
              clientNote: parsed.data.clientNote || null,
              status: AppointmentStatus.PENDING,
            },
            include: appointmentInclude,
          });
          const specialist = await transaction.specialistProfile.findUnique({ where: { id: parsed.data.specialistId }, select: { userId: true } });
          if (specialist) {
            await transaction.notification.create({ data: {
              userId: specialist.userId,
              type: "BOOKING_REQUEST",
              titleUk: "Новий запит на консультацію",
              titleEn: "New consultation request",
              bodyUk: `${created.client.firstName} ${created.client.lastName} очікує на підтвердження`,
              bodyEn: `${created.client.firstName} ${created.client.lastName} is waiting for confirmation`,
              href: "/specialist/requests",
            } });
          }
          return created;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

        response.status(201).json({ appointment });
        return;
      } catch (error) {
        if (error instanceof AvailabilityError) {
          response.status(error.status).json({ code: error.code, message: error.message });
          return;
        }
        const retryableTransactionError =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034"
          || error instanceof Prisma.PrismaClientUnknownRequestError && error.message.includes("40P01");
        if (retryableTransactionError && attempt < 2) continue;
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2004") {
          response.status(409).json({ code: "SLOT_UNAVAILABLE", message: "Обраний час уже зайнятий" });
          return;
        }
        if (error instanceof Prisma.PrismaClientUnknownRequestError && error.message.includes("23P01")) {
          response.status(409).json({ code: "SLOT_UNAVAILABLE", message: "Обраний час уже зайнятий" });
          return;
        }
        throw error;
      }
    }
  },
);

appointmentRouter.patch("/appointments/:appointmentId/cancel", requireAuth, async (request, response) => {
  const { userId, role } = (request as AuthenticatedRequest).auth;
  const appointmentId = String(request.params.appointmentId);
  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appointment || (role !== UserRole.ADMIN && appointment.clientId !== userId)) {
    response.status(404).json({ code: "APPOINTMENT_NOT_FOUND", message: "Запис не знайдено" });
    return;
  }
  if (appointment.status === AppointmentStatus.CANCELLED) {
    response.json({ appointment });
    return;
  }
  if (role !== UserRole.ADMIN) {
    const cancellationDeadline = appointment.startsAt.getTime() - schedulingConfig.cancellationLeadMinutes * 60_000;
    if (Date.now() > cancellationDeadline) {
      response.status(409).json({ code: "CANCELLATION_TOO_LATE", message: "Термін самостійного скасування минув" });
      return;
    }
  }
  const updated = await prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: AppointmentStatus.CANCELLED },
    include: appointmentInclude,
  });
  response.json({ appointment: updated });
});
