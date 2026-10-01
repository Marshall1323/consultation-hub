import { AppointmentStatus } from "@prisma/client";
import { z } from "zod";

export const availabilityQuerySchema = z.object({
  specialistId: z.string().uuid(),
  serviceId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const createAppointmentSchema = z.object({
  specialistId: z.string().uuid(),
  serviceId: z.string().uuid(),
  startsAt: z.string().datetime({ offset: true }),
  clientNote: z.string().trim().max(500).optional(),
});

export const scheduleSchema = z.object({
  slotStepMin: z.number().int().min(5).max(120).optional(),
  intervals: z.array(z.object({
    weekday: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(1440),
  })).max(28),
});

export const exceptionSchema = z.object({
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  isAvailable: z.boolean().default(false),
  note: z.string().trim().max(240).optional(),
});

export const appointmentStatusSchema = z.object({
  status: z.enum([AppointmentStatus.CONFIRMED, AppointmentStatus.CANCELLED, AppointmentStatus.COMPLETED]),
});

export const dateRangeSchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});
