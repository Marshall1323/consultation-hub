import type { AuthUser, UserRole } from "./auth-api";
import type { Appointment, ScheduleException, WorkInterval } from "./scheduling-api";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

export type AdminUser = AuthUser & {
  isActive: boolean;
  specialist: { id: string; isActive: boolean } | null;
};

export type CatalogService = {
  id: string;
  nameUk: string;
  nameEn: string;
  descriptionUk: string | null;
  descriptionEn: string | null;
  durationMin: number;
  priceCents: number | null;
  isActive: boolean;
};

export type AdminSpecialist = {
  id: string;
  specializationUk: string;
  specializationEn: string | null;
  descriptionUk: string | null;
  descriptionEn: string | null;
  isActive: boolean;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    isActive: boolean;
  };
  services: Array<{ priceCents: number | null; service: CatalogService }>;
};

const request = async <T>(token: string, path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  });
  const body = await response.json().catch(() => null) as { message?: string } | null;
  if (!response.ok) throw new Error(body?.message ?? "Request failed");
  return body as T;
};

export const getAdminUsers = (token: string) =>
  request<{ users: AdminUser[] }>(token, "/admin/users");

export const updateUserRole = (token: string, userId: string, role: UserRole) =>
  request<{ user: AdminUser }>(token, `/admin/users/${userId}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });

export const updateUserStatus = (token: string, userId: string, isActive: boolean) =>
  request(token, `/admin/users/${userId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  });

export const getAdminServices = (token: string) =>
  request<{ services: CatalogService[] }>(token, "/admin/services");

export const createService = (
  token: string,
  input: Omit<CatalogService, "id" | "isActive">,
) => request<{ service: CatalogService }>(token, "/admin/services", {
  method: "POST",
  body: JSON.stringify(input),
});

export const updateService = (
  token: string,
  serviceId: string,
  input: Partial<Omit<CatalogService, "id">>,
) => request(token, `/admin/services/${serviceId}`, {
  method: "PATCH",
  body: JSON.stringify(input),
});

export const getAdminSpecialists = (token: string) =>
  request<{ specialists: AdminSpecialist[] }>(token, "/admin/specialists");

export const createSpecialist = (
  token: string,
  input: {
    userId: string;
    specializationUk: string;
    specializationEn?: string;
    descriptionUk?: string;
    descriptionEn?: string;
  },
) => request<{ specialist: AdminSpecialist }>(token, "/admin/specialists", {
  method: "POST",
  body: JSON.stringify(input),
});

export const updateSpecialist = (
  token: string,
  specialistId: string,
  input: { isActive?: boolean },
) => request(token, `/admin/specialists/${specialistId}`, {
  method: "PATCH",
  body: JSON.stringify(input),
});

export const assignService = (token: string, specialistId: string, serviceId: string, priceCents: number) =>
  request(token, `/admin/specialists/${specialistId}/services/${serviceId}`, {
    method: "PUT",
    body: JSON.stringify({ priceCents }),
  });

export const getAdminAppointments = (token: string) =>
  request<{ appointments: Appointment[]; stats: { total: number; upcoming: number; bookedMinutes: number } }>(token, "/admin/appointments");

export const updateAdminAppointment = (
  token: string,
  appointmentId: string,
  status: "CONFIRMED" | "CANCELLED" | "COMPLETED",
) => request(token, `/admin/appointments/${appointmentId}/status`, {
  method: "PATCH",
  body: JSON.stringify({ status }),
});

export const getAdminSchedule = (token: string, specialistId: string) =>
  request<{ schedule: WorkInterval[]; exceptions: ScheduleException[]; slotStepMin: number }>(token, `/admin/specialists/${specialistId}/schedule`);

export const saveAdminSchedule = (token: string, specialistId: string, intervals: WorkInterval[], slotStepMin: number) =>
  request(token, `/admin/specialists/${specialistId}/schedule`, {
    method: "PUT",
    body: JSON.stringify({ intervals, slotStepMin }),
  });
