import { Prisma, UserRole } from "@prisma/client";
import { Router } from "express";
import type { Response } from "express";
import { prisma } from "../../lib/prisma.js";
import {
  requireAuth,
  requireRole,
  type AuthenticatedRequest,
} from "../auth/auth.middleware.js";
import {
  roleSchema,
  servicePriceSchema,
  serviceSchema,
  serviceUpdateSchema,
  specialistSchema,
  specialistUpdateSchema,
  statusSchema,
} from "./admin.schemas.js";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole(UserRole.ADMIN));

const validationError = (response: Response, errors: unknown) =>
  response.status(400).json({ code: "VALIDATION_ERROR", message: "Перевірте введені дані", errors });

adminRouter.get("/status", (request, response) => {
  const authenticatedRequest = request as AuthenticatedRequest;
  response.json({ status: "ok", ...authenticatedRequest.auth });
});

adminRouter.get("/users", async (request, response) => {
  const search = typeof request.query.search === "string" ? request.query.search.trim() : "";
  const role = typeof request.query.role === "string" && Object.values(UserRole).includes(request.query.role as UserRole)
    ? request.query.role as UserRole
    : undefined;

  const users = await prisma.user.findMany({
    where: {
      role,
      OR: search
        ? [
            { email: { contains: search, mode: "insensitive" } },
            { firstName: { contains: search, mode: "insensitive" } },
            { lastName: { contains: search, mode: "insensitive" } },
          ]
        : undefined,
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      role: true,
      isActive: true,
      createdAt: true,
      specialist: { select: { id: true, isActive: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  response.json({ users });
});

adminRouter.patch("/users/:userId/role", async (request, response) => {
  const parsed = roleSchema.safeParse(request.body);
  if (!parsed.success) return validationError(response, parsed.error.flatten().fieldErrors);

  const currentAdmin = request as unknown as AuthenticatedRequest;
  if (request.params.userId === currentAdmin.auth.userId && parsed.data.role !== UserRole.ADMIN) {
    response.status(409).json({ code: "ADMIN_SELF_ROLE", message: "Не можна змінити власну роль адміністратора" });
    return;
  }
  if (parsed.data.role === UserRole.SPECIALIST) {
    response.status(409).json({
      code: "SPECIALIST_PROFILE_REQUIRED",
      message: "Створіть профіль спеціаліста, щоб призначити цю роль",
    });
    return;
  }

  try {
    const user = await prisma.$transaction(async (transaction) => {
      await transaction.specialistProfile.updateMany({
        where: { userId: request.params.userId },
        data: { isActive: false },
      });
      return transaction.user.update({
        where: { id: request.params.userId },
        data: { role: parsed.data.role },
        select: { id: true, email: true, firstName: true, lastName: true, avatarUrl: true, role: true, isActive: true, createdAt: true },
      });
    });
    response.json({ user });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      response.status(404).json({ code: "USER_NOT_FOUND", message: "Користувача не знайдено" });
      return;
    }
    throw error;
  }
});

adminRouter.patch("/users/:userId/status", async (request, response) => {
  const parsed = statusSchema.safeParse(request.body);
  if (!parsed.success) return validationError(response, parsed.error.flatten().fieldErrors);

  const currentAdmin = request as unknown as AuthenticatedRequest;
  if (request.params.userId === currentAdmin.auth.userId && !parsed.data.isActive) {
    response.status(409).json({ code: "ADMIN_SELF_DEACTIVATE", message: "Не можна деактивувати власний обліковий запис" });
    return;
  }

  try {
    const user = await prisma.user.update({
      where: { id: request.params.userId },
      data: { isActive: parsed.data.isActive },
      select: { id: true, isActive: true },
    });
    response.json({ user });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      response.status(404).json({ code: "USER_NOT_FOUND", message: "Користувача не знайдено" });
      return;
    }
    throw error;
  }
});

adminRouter.get("/specialists", async (_request, response) => {
  const specialists = await prisma.specialistProfile.findMany({
    include: {
      user: { select: { id: true, email: true, firstName: true, lastName: true, isActive: true } },
      services: { include: { service: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  response.json({ specialists });
});

adminRouter.post("/specialists", async (request, response) => {
  const parsed = specialistSchema.safeParse(request.body);
  if (!parsed.success) return validationError(response, parsed.error.flatten().fieldErrors);

  const user = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
  if (!user) {
    response.status(404).json({ code: "USER_NOT_FOUND", message: "Користувача не знайдено" });
    return;
  }
  if (user.role === UserRole.ADMIN) {
    response.status(409).json({ code: "ADMIN_SPECIALIST_CONFLICT", message: "Адміністратора не можна перетворити на спеціаліста" });
    return;
  }

  try {
    const specialist = await prisma.$transaction(async (transaction) => {
      await transaction.user.update({ where: { id: user.id }, data: { role: UserRole.SPECIALIST } });
      return transaction.specialistProfile.create({
        data: { ...parsed.data, description: parsed.data.descriptionUk },
        include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
      });
    });
    response.status(201).json({ specialist });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      response.status(409).json({ code: "SPECIALIST_EXISTS", message: "Профіль спеціаліста вже існує" });
      return;
    }
    throw error;
  }
});

adminRouter.patch("/specialists/:specialistId", async (request, response) => {
  const parsed = specialistUpdateSchema.safeParse(request.body);
  if (!parsed.success) return validationError(response, parsed.error.flatten().fieldErrors);

  try {
    const specialist = await prisma.specialistProfile.update({
      where: { id: request.params.specialistId },
      data: {
        ...parsed.data,
        description: parsed.data.descriptionUk,
      },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });
    response.json({ specialist });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      response.status(404).json({ code: "SPECIALIST_NOT_FOUND", message: "Спеціаліста не знайдено" });
      return;
    }
    throw error;
  }
});

adminRouter.get("/services", async (_request, response) => {
  const services = await prisma.service.findMany({ orderBy: { createdAt: "desc" } });
  response.json({ services });
});

adminRouter.post("/services", async (request, response) => {
  const parsed = serviceSchema.safeParse(request.body);
  if (!parsed.success) return validationError(response, parsed.error.flatten().fieldErrors);
  const service = await prisma.service.create({
    data: {
      ...parsed.data,
      name: parsed.data.nameUk,
      description: parsed.data.descriptionUk,
    },
  });
  response.status(201).json({ service });
});

adminRouter.patch("/services/:serviceId", async (request, response) => {
  const parsed = serviceUpdateSchema.safeParse(request.body);
  if (!parsed.success) return validationError(response, parsed.error.flatten().fieldErrors);

  try {
    const service = await prisma.service.update({
      where: { id: request.params.serviceId },
      data: {
        ...parsed.data,
        name: parsed.data.nameUk,
        description: parsed.data.descriptionUk,
      },
    });
    response.json({ service });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      response.status(404).json({ code: "SERVICE_NOT_FOUND", message: "Послугу не знайдено" });
      return;
    }
    throw error;
  }
});

adminRouter.put("/specialists/:specialistId/services/:serviceId", async (request, response) => {
  const parsed = servicePriceSchema.safeParse(request.body);
  if (!parsed.success) return validationError(response, parsed.error.flatten().fieldErrors);
  try {
    const assignment = await prisma.specialistService.upsert({
      where: {
        specialistId_serviceId: {
          specialistId: request.params.specialistId,
          serviceId: request.params.serviceId,
        },
      },
      create: { specialistId: request.params.specialistId, serviceId: request.params.serviceId, priceCents: parsed.data.priceCents },
      update: { priceCents: parsed.data.priceCents },
    });
    response.json({ assignment });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      response.status(404).json({ code: "CATALOG_ITEM_NOT_FOUND", message: "Спеціаліста або послугу не знайдено" });
      return;
    }
    throw error;
  }
});

adminRouter.delete("/specialists/:specialistId/services/:serviceId", async (request, response) => {
  try {
    await prisma.specialistService.delete({
      where: {
        specialistId_serviceId: {
          specialistId: request.params.specialistId,
          serviceId: request.params.serviceId,
        },
      },
    });
    response.status(204).send();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      response.status(404).json({ code: "ASSIGNMENT_NOT_FOUND", message: "Зв’язок не знайдено" });
      return;
    }
    throw error;
  }
});
