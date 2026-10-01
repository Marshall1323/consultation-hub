import { AppointmentStatus, UserRole } from "@prisma/client";
import { Router } from "express";
import type { Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../auth/auth.middleware.js";
import { appointmentInclude } from "./appointment.select.js";
import { appointmentStatusSchema, exceptionSchema, scheduleSchema } from "./appointment.schemas.js";
import { specialistServiceSettingsSchema } from "../admin/admin.schemas.js";

export const specialistRouter = Router();
specialistRouter.use(requireAuth, requireRole(UserRole.SPECIALIST));

const invalid = (response: Response, errors: unknown) =>
  response.status(400).json({ code: "VALIDATION_ERROR", message: "Перевірте введені дані", errors });

const getProfile = async (userId: string) => prisma.specialistProfile.findUnique({
  where: { userId },
  include: { services: { include: { service: true }, orderBy: { service: { nameUk: "asc" } } } },
});

specialistRouter.get("/dashboard", async (request, response) => {
  const profile = await getProfile((request as unknown as AuthenticatedRequest).auth.userId);
  if (!profile) return response.status(404).json({ code: "PROFILE_NOT_FOUND", message: "Профіль спеціаліста не знайдено" });

  const [schedule, exceptions, appointments] = await Promise.all([
    prisma.workSchedule.findMany({ where: { specialistId: profile.id }, orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] }),
    prisma.scheduleException.findMany({ where: { specialistId: profile.id, endsAt: { gt: new Date() } }, orderBy: { startsAt: "asc" } }),
    prisma.appointment.findMany({ where: { specialistId: profile.id }, include: appointmentInclude, orderBy: { startsAt: "asc" } }),
  ]);

  const confirmed = appointments.filter((item) => item.status === AppointmentStatus.CONFIRMED);
  response.json({
    profile,
    schedule,
    exceptions,
    appointments,
    stats: {
      total: appointments.length,
      upcoming: confirmed.filter((item) => item.startsAt > new Date()).length,
      bookedMinutes: confirmed.reduce((sum, item) => sum + Math.round((item.endsAt.getTime() - item.startsAt.getTime()) / 60_000), 0),
    },
  });
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
  const appointment = await prisma.appointment.update({
    where: { id: existing.id }, data: { status: parsed.data.status }, include: appointmentInclude,
  });
  response.json({ appointment });
});
