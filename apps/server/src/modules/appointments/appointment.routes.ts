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
  const appointments = await prisma.appointment.findMany({
    where: {
      OR: [
        { clientId: userId },
        { specialist: { userId } },
      ],
    },
    include: appointmentInclude,
    orderBy: { startsAt: "desc" },
  });
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

          return transaction.appointment.create({
            data: {
              clientId: userId,
              specialistId: parsed.data.specialistId,
              serviceId: parsed.data.serviceId,
              priceCents: assignment.priceCents ?? assignment.service.priceCents,
              startsAt: slot.start,
              endsAt: slot.end,
              clientNote: parsed.data.clientNote || null,
              status: AppointmentStatus.CONFIRMED,
            },
            include: appointmentInclude,
          });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

        response.status(201).json({ appointment });
        return;
      } catch (error) {
        if (error instanceof AvailabilityError) {
          response.status(error.status).json({ code: error.code, message: error.message });
          return;
        }
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 2) continue;
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
