import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "./auth.middleware.js";
import { loginSchema, registerSchema } from "./auth.schemas.js";
import { getPublicUser, loginUser, registerClient } from "./auth.service.js";

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
