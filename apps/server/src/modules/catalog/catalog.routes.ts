import { AppointmentStatus } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { addDays, getAvailableSlots, localDate } from "../appointments/availability.service.js";

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
      photoUrl: true,
      experienceStartYear: true,
      languages: true,
      user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      reviews: { select: { rating: true } },
      _count: { select: { appointments: { where: { status: AppointmentStatus.COMPLETED } } } },
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
  response.json({ specialists: specialists.map(({ reviews, _count, ...specialist }) => ({
    ...specialist,
    photoUrl: specialist.user.avatarUrl ?? specialist.photoUrl,
    completedConsultations: _count.appointments,
    reviewCount: reviews.length,
    averageRating: reviews.length ? reviews.reduce((sum, item) => sum + item.rating, 0) / reviews.length : null,
  })) });
});

catalogRouter.get("/specialists/:specialistId/profile", async (request, response) => {
  const specialist = await prisma.specialistProfile.findFirst({
    where: { id: request.params.specialistId, isActive: true, user: { isActive: true } },
    select: {
      id: true, specializationUk: true, specializationEn: true, descriptionUk: true, descriptionEn: true,
      photoUrl: true, experienceStartYear: true, languages: true,
      user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      services: {
        where: { service: { isActive: true } },
        select: { priceCents: true, durationMin: true, service: { select: { id: true, nameUk: true, nameEn: true, descriptionUk: true, descriptionEn: true, durationMin: true, priceCents: true } } },
        orderBy: { service: { nameUk: "asc" } },
      },
      reviews: {
        orderBy: { createdAt: "desc" },
        select: { id: true, appointmentId: true, rating: true, comment: true, createdAt: true, updatedAt: true, client: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
      },
      _count: { select: { appointments: { where: { status: AppointmentStatus.COMPLETED } }, reviews: true } },
    },
  });
  if (!specialist) return response.status(404).json({ code: "SPECIALIST_NOT_FOUND", message: "Спеціаліста не знайдено" });
  const { _count, ...profile } = specialist;
  response.json({ profile: { ...profile, photoUrl: profile.user.avatarUrl ?? profile.photoUrl, completedConsultations: _count.appointments, reviewCount: _count.reviews, averageRating: profile.reviews.length ? profile.reviews.reduce((sum, item) => sum + item.rating, 0) / profile.reviews.length : null } });
});

catalogRouter.get("/specialists/:specialistId/nearest", async (request, response) => {
  const serviceId = typeof request.query.serviceId === "string" ? request.query.serviceId : "";
  if (!serviceId) return response.status(400).json({ code: "SERVICE_REQUIRED", message: "Оберіть послугу" });
  const startDate = localDate(new Date());
  for (let offset = 0; offset <= 30; offset += 1) {
    const date = addDays(startDate, offset);
    try {
      const slots = await getAvailableSlots({ specialistId: request.params.specialistId, serviceId, date });
      if (slots[0]) return response.json({ slot: { startsAt: slots[0].start.toISOString(), endsAt: slots[0].end.toISOString() } });
    } catch (error) {
      if (offset === 0 && error instanceof Error && error.message.includes("недоступна")) return response.status(404).json({ code: "SPECIALIST_SERVICE_NOT_FOUND", message: error.message });
    }
  }
  response.json({ slot: null });
});
