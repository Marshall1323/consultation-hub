import { AppointmentStatus, UserRole } from "@prisma/client";
import { Router } from "express";
import type { Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { appointmentInclude } from "../appointments/appointment.select.js";
import { appointmentStatusSchema, exceptionSchema, scheduleSchema } from "../appointments/appointment.schemas.js";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";

export const adminSchedulingRouter = Router();
adminSchedulingRouter.use(requireAuth, requireRole(UserRole.ADMIN));

const invalid = (response: Response, errors: unknown) =>
  response.status(400).json({ code: "VALIDATION_ERROR", message: "Перевірте введені дані", errors });

adminSchedulingRouter.get("/appointments", async (_request, response) => {
  const appointments = await prisma.appointment.findMany({ include: appointmentInclude, orderBy: { startsAt: "desc" } });
  const confirmed = appointments.filter((item) => item.status === AppointmentStatus.CONFIRMED);
  response.json({
    appointments,
    stats: {
      total: appointments.length,
      upcoming: confirmed.filter((item) => item.startsAt > new Date()).length,
      bookedMinutes: confirmed.reduce((sum, item) => sum + Math.round((item.endsAt.getTime() - item.startsAt.getTime()) / 60_000), 0),
    },
  });
});

adminSchedulingRouter.patch("/appointments/:appointmentId/status", async (request, response) => {
  const parsed = appointmentStatusSchema.safeParse(request.body);
  if (!parsed.success) return invalid(response, parsed.error.flatten().fieldErrors);
  const existing = await prisma.appointment.findUnique({ where: { id: request.params.appointmentId } });
  if (!existing) return response.status(404).json({ code: "APPOINTMENT_NOT_FOUND", message: "Запис не знайдено" });
  const appointment = await prisma.appointment.update({
    where: { id: existing.id }, data: { status: parsed.data.status }, include: appointmentInclude,
  });
  response.json({ appointment });
});

adminSchedulingRouter.get("/specialists/:specialistId/schedule", async (request, response) => {
  const [specialist, schedule, exceptions] = await Promise.all([
    prisma.specialistProfile.findUnique({ where: { id: request.params.specialistId } }),
    prisma.workSchedule.findMany({ where: { specialistId: request.params.specialistId }, orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] }),
    prisma.scheduleException.findMany({ where: { specialistId: request.params.specialistId }, orderBy: { startsAt: "asc" } }),
  ]);
  if (!specialist) return response.status(404).json({ code: "SPECIALIST_NOT_FOUND", message: "Спеціаліста не знайдено" });
  response.json({ schedule, exceptions, slotStepMin: specialist.slotStepMin });
});

adminSchedulingRouter.put("/specialists/:specialistId/schedule", async (request, response) => {
  const parsed = scheduleSchema.safeParse(request.body);
  if (!parsed.success) return invalid(response, parsed.error.flatten().fieldErrors);
  const specialist = await prisma.specialistProfile.findUnique({ where: { id: request.params.specialistId } });
  if (!specialist) return response.status(404).json({ code: "SPECIALIST_NOT_FOUND", message: "Спеціаліста не знайдено" });
  const intervals = [...parsed.data.intervals].sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute);
  for (let index = 0; index < intervals.length; index += 1) {
    const current = intervals[index]!;
    const previous = intervals[index - 1];
    if (current.endMinute <= current.startMinute || (previous?.weekday === current.weekday && previous.endMinute > current.startMinute)) {
      return invalid(response, { intervals: ["Некоректні або перехресні інтервали"] });
    }
  }
  await prisma.$transaction([
    prisma.workSchedule.deleteMany({ where: { specialistId: specialist.id } }),
    prisma.workSchedule.createMany({ data: intervals.map((item) => ({ ...item, specialistId: specialist.id })) }),
    ...(parsed.data.slotStepMin
      ? [prisma.specialistProfile.update({ where: { id: specialist.id }, data: { slotStepMin: parsed.data.slotStepMin } })]
      : []),
  ]);
  response.json({ schedule: intervals, slotStepMin: parsed.data.slotStepMin ?? specialist.slotStepMin });
});

adminSchedulingRouter.post("/specialists/:specialistId/exceptions", async (request, response) => {
  const parsed = exceptionSchema.safeParse(request.body);
  if (!parsed.success) return invalid(response, parsed.error.flatten().fieldErrors);
  const startsAt = new Date(parsed.data.startsAt);
  const endsAt = new Date(parsed.data.endsAt);
  if (endsAt <= startsAt) return invalid(response, { endsAt: ["Кінець має бути пізніше початку"] });
  const exception = await prisma.scheduleException.create({
    data: { specialistId: request.params.specialistId, startsAt, endsAt, isAvailable: parsed.data.isAvailable, note: parsed.data.note },
  });
  response.status(201).json({ exception });
});

adminSchedulingRouter.delete("/specialists/:specialistId/exceptions/:exceptionId", async (request, response) => {
  const result = await prisma.scheduleException.deleteMany({
    where: { id: request.params.exceptionId, specialistId: request.params.specialistId },
  });
  if (!result.count) return response.status(404).json({ code: "EXCEPTION_NOT_FOUND", message: "Виняток не знайдено" });
  response.status(204).send();
});
