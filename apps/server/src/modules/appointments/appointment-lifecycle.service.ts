import { AppointmentStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";

export const completeExpiredAppointments = async (now = new Date()) => prisma.appointment.updateMany({
  where: {
    status: AppointmentStatus.CONFIRMED,
    endsAt: { lte: now },
  },
  data: { status: AppointmentStatus.COMPLETED },
});
