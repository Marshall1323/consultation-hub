import { AppointmentStatus } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../../lib/prisma.js";

export const catalogRouter = Router();

catalogRouter.get("/services", async (_request, response) => {
  const records = await prisma.service.findMany({
    where: { isActive: true },
    select: {
      id: true,
      nameUk: true,
      nameEn: true,
      descriptionUk: true,
      descriptionEn: true,
      durationMin: true,
      priceCents: true,
      specialists: {
        where: { specialist: { isActive: true, user: { isActive: true } } },
        select: { priceCents: true, durationMin: true },
      },
      _count: {
        select: { appointments: { where: { status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED, AppointmentStatus.COMPLETED] } } } },
      },
    },
  });
  const services = records.map(({ specialists, _count, ...service }) => {
    const prices = specialists.map((item) => item.priceCents ?? service.priceCents).filter((price): price is number => price != null);
    return {
      ...service,
      minPriceCents: prices.length ? Math.min(...prices) : service.priceCents,
      maxPriceCents: prices.length ? Math.max(...prices) : service.priceCents,
      popularity: _count.appointments,
    };
  }).sort((left, right) => right.popularity - left.popularity || left.nameUk.localeCompare(right.nameUk, "uk"));
  response.json({ services });
});

catalogRouter.get("/specialists", async (request, response) => {
  const serviceId = typeof request.query.serviceId === "string" ? request.query.serviceId : undefined;
  const specialists = await prisma.specialistProfile.findMany({
    where: {
      isActive: true,
      user: { isActive: true },
      services: serviceId ? { some: { serviceId, service: { isActive: true } } } : undefined,
    },
    select: {
      id: true,
      specializationUk: true,
      specializationEn: true,
      descriptionUk: true,
      descriptionEn: true,
      user: { select: { id: true, firstName: true, lastName: true } },
      services: {
        where: { service: { isActive: true } },
        select: {
          priceCents: true,
          durationMin: true,
          service: {
            select: { id: true, nameUk: true, nameEn: true, durationMin: true, priceCents: true },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  response.json({ specialists });
});
