import { AppointmentStatus, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { schedulingConfig } from "./scheduling.config.js";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

export type TimeInterval = {
  start: Date;
  end: Date;
};

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: schedulingConfig.timeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const partsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: schedulingConfig.timeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

export const localDate = (date: Date) => dateFormatter.format(date);

export const zonedDateTimeToUtc = (date: string, minuteOfDay: number) => {
  const [year, month, day] = date.split("-").map(Number);
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  let timestamp = Date.UTC(year!, month! - 1, day!, hour, minute, 0);

  for (let iteration = 0; iteration < 2; iteration += 1) {
    const parts = Object.fromEntries(
      partsFormatter.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]),
    );
    const represented = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    timestamp -= represented - Date.UTC(year!, month! - 1, day!, hour, minute, 0);
  }

  return new Date(timestamp);
};

export const intervalsOverlap = (left: TimeInterval, right: TimeInterval) =>
  left.start < right.end && left.end > right.start;

export const generateSlots = ({
  windows,
  blocked,
  durationMinutes,
  stepMinutes,
  notBefore,
}: {
  windows: TimeInterval[];
  blocked: TimeInterval[];
  durationMinutes: number;
  stepMinutes: number;
  notBefore: Date;
}) => {
  const durationMs = durationMinutes * 60_000;
  const stepMs = stepMinutes * 60_000;
  const slots = new Map<number, TimeInterval>();

  for (const window of windows) {
    for (let start = window.start.getTime(); start + durationMs <= window.end.getTime(); start += stepMs) {
      const candidate = { start: new Date(start), end: new Date(start + durationMs) };
      if (candidate.start < notBefore || blocked.some((interval) => intervalsOverlap(candidate, interval))) continue;
      slots.set(start, candidate);
    }
  }

  return [...slots.values()].sort((left, right) => left.start.getTime() - right.start.getTime());
};

export class AvailabilityError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) {
    super(message);
  }
}

export const getAvailableSlots = async ({
  specialistId,
  serviceId,
  date,
  database = prisma,
  now = new Date(),
}: {
  specialistId: string;
  serviceId: string;
  date: string;
  database?: DatabaseClient;
  now?: Date;
}) => {
  const today = localDate(now);
  if (date < today) throw new AvailabilityError("DATE_IN_PAST", "Не можна обрати минулу дату");
  if (date > addDays(today, schedulingConfig.bookingHorizonDays)) {
    throw new AvailabilityError("DATE_OUT_OF_RANGE", "Дата виходить за межі періоду запису");
  }

  const assignment = await database.specialistService.findUnique({
    where: { specialistId_serviceId: { specialistId, serviceId } },
    include: {
      service: true,
      specialist: { include: { user: { select: { isActive: true } } } },
    },
  });

  if (!assignment?.service.isActive || !assignment.specialist.isActive || !assignment.specialist.user.isActive) {
    throw new AvailabilityError("SPECIALIST_SERVICE_NOT_FOUND", "Послуга недоступна для цього спеціаліста", 404);
  }

  const dayStart = zonedDateTimeToUtc(date, 0);
  const dayEnd = zonedDateTimeToUtc(addDays(date, 1), 0);
  const weekday = new Date(`${date}T12:00:00.000Z`).getUTCDay();

  const [schedule, exceptions, appointments] = await Promise.all([
    database.workSchedule.findMany({
      where: { specialistId, weekday, isActive: true },
      orderBy: { startMinute: "asc" },
    }),
    database.scheduleException.findMany({
      where: { specialistId, startsAt: { lt: dayEnd }, endsAt: { gt: dayStart } },
      orderBy: { startsAt: "asc" },
    }),
    database.appointment.findMany({
      where: {
        specialistId,
        status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
        startsAt: { lt: dayEnd },
        endsAt: { gt: dayStart },
      },
      select: { startsAt: true, endsAt: true },
    }),
  ]);

  const regularWindows = schedule.map((item) => ({
    start: zonedDateTimeToUtc(date, item.startMinute),
    end: zonedDateTimeToUtc(date, item.endMinute),
  }));
  const extraWindows = exceptions
    .filter((item) => item.isAvailable)
    .map((item) => ({ start: item.startsAt, end: item.endsAt }));
  const unavailable = exceptions
    .filter((item) => !item.isAvailable)
    .map((item) => ({ start: item.startsAt, end: item.endsAt }));
  const booked = appointments.map((item) => ({ start: item.startsAt, end: item.endsAt }));
  const notBefore = new Date(now.getTime() + schedulingConfig.minimumLeadMinutes * 60_000);

  return generateSlots({
    windows: [...regularWindows, ...extraWindows],
    blocked: [...unavailable, ...booked],
    durationMinutes: assignment.durationMin ?? assignment.service.durationMin,
    stepMinutes: assignment.specialist.slotStepMin,
    notBefore,
  });
};
