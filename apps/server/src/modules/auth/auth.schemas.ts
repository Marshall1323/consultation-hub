import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().trim().email("Некоректна адреса електронної пошти"),
  password: z
    .string()
    .min(8, "Пароль повинен містити щонайменше 8 символів")
    .max(72, "Пароль не повинен перевищувати 72 символи"),
  firstName: z.string().trim().min(2).max(50),
  lastName: z.string().trim().min(2).max(50),
});

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

const avatarSchema = z.union([
  z.string().url().max(1000),
  z.string().regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/).max(2_800_000),
  z.null(),
]);

export const updateProfileSchema = z.object({
  firstName: z.string().trim().min(2).max(50),
  lastName: z.string().trim().min(2).max(50),
  email: z.string().trim().email(),
  avatarUrl: avatarSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(72),
});

export const forgotPasswordSchema = z.object({ email: z.string().trim().email() });
