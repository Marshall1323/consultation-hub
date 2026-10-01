import { UserRole } from "@prisma/client";
import { z } from "zod";

export const roleSchema = z.object({
  role: z.nativeEnum(UserRole),
});

export const statusSchema = z.object({
  isActive: z.boolean(),
});

export const specialistSchema = z.object({
  userId: z.string().uuid(),
  specializationUk: z.string().trim().min(2).max(120),
  specializationEn: z.string().trim().max(120).optional(),
  descriptionUk: z.string().trim().max(1200).optional(),
  descriptionEn: z.string().trim().max(1200).optional(),
});

export const specialistUpdateSchema = specialistSchema.omit({ userId: true }).partial().extend({
  isActive: z.boolean().optional(),
});

export const serviceSchema = z.object({
  nameUk: z.string().trim().min(2).max(120),
  nameEn: z.string().trim().min(2).max(120),
  descriptionUk: z.string().trim().max(1200).optional(),
  descriptionEn: z.string().trim().max(1200).optional(),
  durationMin: z.number().int().min(15).max(480),
  priceCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const serviceUpdateSchema = serviceSchema.partial();

export const servicePriceSchema = z.object({
  priceCents: z.number().int().min(0).max(100_000_000),
});

export const specialistServiceSettingsSchema = z.object({
  priceCents: z.number().int().min(0).max(100_000_000),
  durationMin: z.number().int().min(15).max(480),
});
