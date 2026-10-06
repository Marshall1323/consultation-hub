import { AppointmentStatus, Prisma, UserRole } from "@prisma/client";
import { Router } from "express";
import type { Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../auth/auth.middleware.js";
import { appointmentInclude } from "./appointment.select.js";
import { appointmentStatusSchema, decideRescheduleRequestSchema, exceptionSchema, scheduleSchema } from "./appointment.schemas.js";
import { AvailabilityError, getAvailableSlots, localDate } from "./availability.service.js";
import { specialistServiceSettingsSchema } from "../admin/admin.schemas.js";
import { z } from "zod";

export const specialistRouter = Router();
specialistRouter.use(requireAuth, requireRole(UserRole.SPECIALIST));

const invalid = (response: Response, errors: unknown) =>
  response.status(400).json({ code: "VALIDATION_ERROR", message: "Перевірте введені дані", errors });
const profileSchema = z.object({
  specializationUk: z.string().trim().min(2).max(120),
  specializationEn: z.string().trim().max(120).nullable(),
  descriptionUk: z.string().trim().min(20).max(2000),
  descriptionEn: z.string().trim().max(2000).nullable(),
  experienceStartYear: z.number().int().min(1950).max(new Date().getFullYear()),
  languages: z.array(z.string().trim().min(2).max(40)).min(1).max(8),
});

const getProfile = async (userId: string) => prisma.specialistProfile.findUnique({
  where: { userId },
  include: { services: { include: { service: true }, orderBy: { service: { nameUk: "asc" } } } },
});

specialistRouter.get("/dashboard", async (request, response) => {
  const profile = await getProfile((request as unknown as AuthenticatedRequest).auth.userId);
  if (!profile) return response.status(404).json({ code: "PROFILE_NOT_FOUND", message: "Профіль спеціаліста не знайдено" });

  if (request.query.scope === "profile") {
    return response.json({
      profile,
      schedule: [],
      exceptions: [],
      appointments: [],
      stats: { total: 0, upcoming: 0, bookedMinutes: 0 },
    });
  }

  const now = new Date();
  await prisma.appointment.updateMany({
    where: {
      specialistId: profile.id,
      status: AppointmentStatus.CONFIRMED,
      endsAt: { lte: now },
    },
    data: { status: AppointmentStatus.COMPLETED },
  });

  const [schedule, exceptions, total, confirmedAppointments] = await Promise.all([
    prisma.workSchedule.findMany({ where: { specialistId: profile.id }, orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] }),
    prisma.scheduleException.findMany({ where: { specialistId: profile.id, endsAt: { gt: now } }, orderBy: { startsAt: "asc" } }),
    prisma.appointment.count({ where: { specialistId: profile.id } }),
    prisma.appointment.findMany({
      where: { specialistId: profile.id, status: AppointmentStatus.CONFIRMED },
      select: { startsAt: true, endsAt: true },
    }),
  ]);

  response.json({
    profile,
    schedule,
    exceptions,
    appointments: [],
    stats: {
      total,
      upcoming: confirmedAppointments.filter((item) => item.startsAt > now).length,
      bookedMinutes: confirmedAppointments.reduce((sum, item) => sum + Math.round((item.endsAt.getTime() - item.startsAt.getTime()) / 60_000), 0),
    },
  });
});

specialistRouter.get("/requests", async (request, response) => {
  const profile = await prisma.specialistProfile.findUnique({
    where: { userId: (request as AuthenticatedRequest).auth.userId },
    select: { id: true },
  });
  if (!profile) return response.status(404).json({ code: "PROFILE_NOT_FOUND", message: "Профіль спеціаліста не знайдено" });
  const [appointments, rescheduleRequests] = await Promise.all([prisma.appointment.findMany({
    where: { specialistId: profile.id },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      status: true,
      clientNote: true,
      priceCents: true,
      client: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
      service: { select: { id: true, nameUk: true, nameEn: true, durationMin: true, priceCents: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  }), prisma.appointmentRescheduleRequest.findMany({
    where: { appointment: { specialistId: profile.id } },
    include: {
      appointment: {
        select: {
          id: true, startsAt: true, endsAt: true, status: true, clientNote: true, priceCents: true,
          client: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
          service: { select: { id: true, nameUk: true, nameEn: true, durationMin: true, priceCents: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  })]);
  response.json({
    specialistId: profile.id,
    pending: appointments.filter((item) => item.status === AppointmentStatus.PENDING),
    processed: appointments.filter((item) => item.status !== AppointmentStatus.PENDING),
    reschedulePending: rescheduleRequests.filter((item) => item.status === "PENDING"),
    rescheduleProcessed: rescheduleRequests.filter((item) => item.status !== "PENDING"),
    pendingCount: appointments.filter((item) => item.status === AppointmentStatus.PENDING).length
      + rescheduleRequests.filter((item) => item.status === "PENDING").length,
  });
});

specialistRouter.patch("/profile", async (request, response) => {
  const parsed = profileSchema.safeParse(request.body);
  if (!parsed.success) return invalid(response, parsed.error.flatten().fieldErrors);
  const profile = await getProfile((request as unknown as AuthenticatedRequest).auth.userId);
  if (!profile) return response.status(404).json({ code: "PROFILE_NOT_FOUND", message: "Профіль спеціаліста не знайдено" });
  const updated = await prisma.specialistProfile.update({
    where: { id: profile.id },
    data: parsed.data,
    include: { services: { include: { service: true }, orderBy: { service: { nameUk: "asc" } } } },
  });
  response.json({ profile: updated });
});

specialistRouter.put("/schedule", async (request, response) => {
  const parsed = scheduleSchema.safeParse(request.body);
  if (!parsed.success) return invalid(response, parsed.error.flatten().fieldErrors);
  const profile = await getProfile((request as unknown as AuthenticatedRequest).auth.userId);
  if (!profile) return response.status(404).json({ code: "PROFILE_NOT_FOUND", message: "Профіль спеціаліста не знайдено" });

  const intervals = [...parsed.data.intervals].sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute);
  for (let index = 0; index < intervals.length; index += 1) {
    const current = intervals[index]!;
    if (current.endMinute <= current.startMinute) return invalid(response, { intervals: ["Кінець має бути пізніше початку"] });
    const previous = intervals[index - 1];
    if (previous?.weekday === current.weekday && previous.endMinute > current.startMinute) {
      return invalid(response, { intervals: ["Робочі інтервали не можуть перетинатися"] });
    }
  }

  await prisma.$transaction([
    prisma.workSchedule.deleteMany({ where: { specialistId: profile.id } }),
    prisma.workSchedule.createMany({ data: intervals.map((item) => ({ ...item, specialistId: profile.id })) }),
    ...(parsed.data.slotStepMin
      ? [prisma.specialistProfile.update({ where: { id: profile.id }, data: { slotStepMin: parsed.data.slotStepMin } })]
      : []),
  ]);
  response.json({ schedule: intervals, slotStepMin: parsed.data.slotStepMin ?? profile.slotStepMin });
});

specialistRouter.patch("/services/:serviceId/price", async (request, response) => {
  const parsed = specialistServiceSettingsSchema.safeParse(request.body);
  if (!parsed.success) return invalid(response, parsed.error.flatten().fieldErrors);
  const profile = await getProfile((request as unknown as AuthenticatedRequest).auth.userId);
  if (!profile) return response.status(404).json({ code: "PROFILE_NOT_FOUND", message: "Профіль спеціаліста не знайдено" });

  const result = await prisma.specialistService.updateMany({
    where: { specialistId: profile.id, serviceId: request.params.serviceId },
    data: { priceCents: parsed.data.priceCents, durationMin: parsed.data.durationMin },
  });
  if (!result.count) return response.status(404).json({ code: "ASSIGNMENT_NOT_FOUND", message: "Послугу не знайдено у профілі" });
  const assignment = await prisma.specialistService.findUnique({
    where: { specialistId_serviceId: { specialistId: profile.id, serviceId: request.params.serviceId } },
    include: { service: true },
  });
  response.json({ assignment });
});

specialistRouter.post("/exceptions", async (request, response) => {
  const parsed = exceptionSchema.safeParse(request.body);
  if (!parsed.success) return invalid(response, parsed.error.flatten().fieldErrors);
  const startsAt = new Date(parsed.data.startsAt);
  const endsAt = new Date(parsed.data.endsAt);
  if (endsAt <= startsAt) return invalid(response, { endsAt: ["Кінець має бути пізніше початку"] });
  const profile = await getProfile((request as unknown as AuthenticatedRequest).auth.userId);
  if (!profile) return response.status(404).json({ code: "PROFILE_NOT_FOUND", message: "Профіль спеціаліста не знайдено" });
  const exception = await prisma.scheduleException.create({
    data: { specialistId: profile.id, startsAt, endsAt, isAvailable: parsed.data.isAvailable, note: parsed.data.note },
  });
  response.status(201).json({ exception });
});

specialistRouter.delete("/exceptions/:exceptionId", async (request, response) => {
  const profile = await getProfile((request as unknown as AuthenticatedRequest).auth.userId);
  const result = await prisma.scheduleException.deleteMany({ where: { id: request.params.exceptionId, specialistId: profile?.id ?? "" } });
  if (!result.count) return response.status(404).json({ code: "EXCEPTION_NOT_FOUND", message: "Виняток не знайдено" });
  response.status(204).send();
});

specialistRouter.patch("/appointments/:appointmentId/status", async (request, response) => {
  const parsed = appointmentStatusSchema.safeParse(request.body);
  if (!parsed.success) return invalid(response, parsed.error.flatten().fieldErrors);
  const profile = await getProfile((request as unknown as AuthenticatedRequest).auth.userId);
  const existing = await prisma.appointment.findFirst({ where: { id: request.params.appointmentId, specialistId: profile?.id ?? "" } });
  if (!existing) return response.status(404).json({ code: "APPOINTMENT_NOT_FOUND", message: "Запис не знайдено" });
  if (existing.status === AppointmentStatus.PENDING && parsed.data.status !== AppointmentStatus.CONFIRMED && parsed.data.status !== AppointmentStatus.CANCELLED) {
    return response.status(409).json({ code: "INVALID_STATUS_TRANSITION", message: "Новий запит можна підтвердити або відхилити" });
  }
  if (existing.status === AppointmentStatus.CONFIRMED && ![AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED, AppointmentStatus.CONFIRMED].includes(parsed.data.status)) {
    return response.status(409).json({ code: "INVALID_STATUS_TRANSITION", message: "Підтверджений сеанс можна завершити або скасувати" });
  }
  if (parsed.data.status === AppointmentStatus.COMPLETED && existing.startsAt > new Date()) {
    return response.status(409).json({ code: "APPOINTMENT_NOT_STARTED", message: "Сеанс не можна завершити до часу його початку" });
  }
  if (existing.status === AppointmentStatus.CANCELLED || existing.status === AppointmentStatus.COMPLETED) {
    return response.status(409).json({ code: "INVALID_STATUS_TRANSITION", message: "Статус завершеного або скасованого сеансу змінити не можна" });
  }
  if (existing.status === AppointmentStatus.CONFIRMED && parsed.data.status === AppointmentStatus.CONFIRMED) {
    return response.json({ appointment: await prisma.appointment.findUnique({ where: { id: existing.id }, include: appointmentInclude }) });
  }
  const appointment = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.appointment.update({ where: { id: existing.id }, data: { status: parsed.data.status }, include: appointmentInclude });
    if (existing.status === AppointmentStatus.PENDING && (parsed.data.status === AppointmentStatus.CONFIRMED || parsed.data.status === AppointmentStatus.CANCELLED)) {
      const confirmed = parsed.data.status === AppointmentStatus.CONFIRMED;
      await transaction.notification.create({ data: {
        userId: existing.clientId,
        type: confirmed ? "BOOKING_CONFIRMED" : "BOOKING_REJECTED",
        titleUk: confirmed ? "Запис підтверджено" : "Запит відхилено",
        titleEn: confirmed ? "Booking confirmed" : "Request declined",
        bodyUk: confirmed ? "Спеціаліст підтвердив вашу консультацію" : "Спеціаліст не зміг прийняти консультацію у цей час",
        bodyEn: confirmed ? "The specialist confirmed your consultation" : "The specialist could not accept the consultation at this time",
        href: `/sessions?appointmentId=${existing.id}`,
      } });
    }
    return updated;
  });
  response.json({ appointment });
});

specialistRouter.patch("/reschedule-requests/:requestId", async (request, response) => {
  const parsed = decideRescheduleRequestSchema.safeParse(request.body);
  if (!parsed.success) return invalid(response, parsed.error.flatten().fieldErrors);
  const userId = (request as unknown as AuthenticatedRequest).auth.userId;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await prisma.$transaction(async (transaction) => {
        const profile = await transaction.specialistProfile.findUnique({ where: { userId }, select: { id: true } });
        const requestItem = await transaction.appointmentRescheduleRequest.findUnique({
          where: { id: String(request.params.requestId) },
          include: {
            appointment: {
              include: { client: true, service: true, specialist: true },
            },
          },
        });
        if (!profile || !requestItem || requestItem.appointment.specialistId !== profile.id) {
          throw new AvailabilityError("RESCHEDULE_REQUEST_NOT_FOUND", "Запит на перенесення не знайдено", 404);
        }
        if (requestItem.status !== "PENDING") {
          throw new AvailabilityError("RESCHEDULE_ALREADY_DECIDED", "Рішення щодо цього перенесення вже прийнято", 409);
        }

        if (parsed.data.status === "REJECTED") {
          const updatedRequest = await transaction.appointmentRescheduleRequest.update({
            where: { id: requestItem.id },
            data: { status: "REJECTED", decidedAt: new Date() },
          });
          await transaction.notification.create({ data: {
            userId: requestItem.appointment.clientId,
            type: "RESCHEDULE_REJECTED",
            titleUk: "Перенесення відхилено",
            titleEn: "Reschedule declined",
            bodyUk: "Сеанс залишається у попередній час",
            bodyEn: "The consultation remains at its original time",
            href: `/sessions?appointmentId=${requestItem.appointment.id}`,
          } });
          return { rescheduleRequest: updatedRequest, appointment: requestItem.appointment };
        }

        if (requestItem.appointment.status !== AppointmentStatus.CONFIRMED || requestItem.appointment.startsAt.getTime() <= Date.now()) {
          throw new AvailabilityError("RESCHEDULE_NOT_ALLOWED", "Цей сеанс уже не можна перенести", 409);
        }
        const slots = await getAvailableSlots({
          specialistId: requestItem.appointment.specialistId,
          serviceId: requestItem.appointment.serviceId,
          date: localDate(requestItem.proposedStartsAt),
          database: transaction,
        });
        const slot = slots.find((item) => item.start.getTime() === requestItem.proposedStartsAt.getTime());
        if (!slot) throw new AvailabilityError("SLOT_UNAVAILABLE", "Запропонований час уже зайнятий", 409);
        const clientConflict = await transaction.appointment.findFirst({
          where: {
            id: { not: requestItem.appointment.id },
            clientId: requestItem.appointment.clientId,
            status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
            startsAt: { lt: slot.end },
            endsAt: { gt: slot.start },
          },
        });
        if (clientConflict) throw new AvailabilityError("CLIENT_TIME_CONFLICT", "У клієнта вже є запис на цей час", 409);

        const [updatedAppointment, updatedRequest] = await Promise.all([
          transaction.appointment.update({
            where: { id: requestItem.appointment.id },
            data: { startsAt: slot.start, endsAt: slot.end },
            include: appointmentInclude,
          }),
          transaction.appointmentRescheduleRequest.update({
            where: { id: requestItem.id },
            data: { status: "ACCEPTED", proposedEndsAt: slot.end, decidedAt: new Date() },
          }),
        ]);
        await transaction.notification.create({ data: {
          userId: requestItem.appointment.clientId,
          type: "RESCHEDULE_ACCEPTED",
          titleUk: "Новий час підтверджено",
          titleEn: "New time confirmed",
          bodyUk: "Спеціаліст підтвердив перенесення консультації",
          bodyEn: "The specialist confirmed the new consultation time",
          href: `/sessions?appointmentId=${requestItem.appointment.id}`,
        } });
        return { rescheduleRequest: updatedRequest, appointment: updatedAppointment };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      response.json(result);
      return;
    } catch (error) {
      if (error instanceof AvailabilityError) {
        response.status(error.status).json({ code: error.code, message: error.message });
        return;
      }
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (retryable && attempt < 2) continue;
      throw error;
    }
  }
});
