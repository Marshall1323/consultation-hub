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
