import { Router } from "express";
import { compare, hash } from "bcryptjs";
import { prisma } from "../../lib/prisma.js";
import { requireAuth, type AuthenticatedRequest } from "./auth.middleware.js";
import { changePasswordSchema, forgotPasswordSchema, loginSchema, registerSchema, updateProfileSchema } from "./auth.schemas.js";
import { getPublicUser, loginUser, PASSWORD_ROUNDS, publicUserSelect, registerClient } from "./auth.service.js";

export const authRouter = Router();

authRouter.post("/register", async (request, response) => {
  const parsed = registerSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({
      code: "VALIDATION_ERROR",
      message: "Перевірте введені дані",
      errors: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const result = await registerClient(parsed.data);

  if (!result) {
    response.status(409).json({
      code: "AUTH_EMAIL_EXISTS",
      message: "Користувач із такою поштою вже існує",
    });
    return;
  }

  response.status(201).json(result);
});

authRouter.post("/login", async (request, response) => {
  const parsed = loginSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({
      code: "VALIDATION_ERROR",
      message: "Некоректна пошта або пароль",
    });
    return;
  }

  const result = await loginUser(parsed.data.email, parsed.data.password);

  if (!result) {
    response.status(401).json({
      code: "AUTH_INVALID_CREDENTIALS",
      message: "Некоректна пошта або пароль",
    });
    return;
  }

  response.json(result);
});

authRouter.get("/me", requireAuth, async (request, response) => {
  const authenticatedRequest = request as AuthenticatedRequest;
  const user = await getPublicUser(authenticatedRequest.auth.userId);

  if (!user) {
    response.status(404).json({ code: "USER_NOT_FOUND", message: "Користувача не знайдено" });
    return;
  }

  response.json({ user });
});

authRouter.patch("/profile", requireAuth, async (request, response) => {
  const parsed = updateProfileSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ code: "VALIDATION_ERROR", message: "Перевірте особисті дані", errors: parsed.error.flatten().fieldErrors });
  const { userId } = (request as AuthenticatedRequest).auth;
  const email = parsed.data.email.toLowerCase();
  const duplicate = await prisma.user.findFirst({ where: { id: { not: userId }, email }, select: { id: true } });
  if (duplicate) return response.status(409).json({ code: "AUTH_EMAIL_EXISTS", message: "Користувач із такою поштою вже існує" });
  const user = await prisma.$transaction(async (database) => {
    const updated = await database.user.update({ where: { id: userId }, data: { email, firstName: parsed.data.firstName, lastName: parsed.data.lastName, avatarUrl: parsed.data.avatarUrl }, select: publicUserSelect });
    if (updated.role === "SPECIALIST") await database.specialistProfile.updateMany({ where: { userId }, data: { photoUrl: parsed.data.avatarUrl } });
    return updated;
  });
  response.json({ user });
});

authRouter.patch("/password", requireAuth, async (request, response) => {
  const parsed = changePasswordSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ code: "VALIDATION_ERROR", message: "Новий пароль має містити щонайменше 8 символів" });
  const { userId } = (request as AuthenticatedRequest).auth;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user || !(await compare(parsed.data.currentPassword, user.passwordHash))) return response.status(400).json({ code: "AUTH_CURRENT_PASSWORD_INVALID", message: "Поточний пароль введено неправильно" });
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hash(parsed.data.newPassword, PASSWORD_ROUNDS) } });
  response.json({ message: "Пароль змінено" });
});

authRouter.post("/forgot-password", async (request, response) => {
  const parsed = forgotPasswordSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ code: "VALIDATION_ERROR", message: "Введіть коректну електронну пошту" });
  response.status(202).json({ available: false, message: "Відновлення через код на пошту буде доступне в наступній версії" });
});
