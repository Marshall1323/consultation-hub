const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

export type Service = {
  id: string;
  nameUk: string;
  nameEn: string;
  descriptionUk: string | null;
  descriptionEn: string | null;
  durationMin: number;
  priceCents: number | null;
  minPriceCents: number | null;
  maxPriceCents: number | null;
  popularity: number;
};

export type Specialist = {
  id: string;
  specializationUk: string;
  specializationEn: string | null;
  descriptionUk: string | null;
  descriptionEn: string | null;
  user: { id: string; firstName: string; lastName: string };
  services: Array<{ priceCents: number | null; durationMin: number | null; service: Service }>;
};

export type Appointment = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED";
  clientNote: string | null;
  priceCents: number | null;
  client: { id: string; firstName: string; lastName: string; email: string };
  specialist: {
    id: string;
    specializationUk: string;
    specializationEn: string | null;
    user: { id: string; firstName: string; lastName: string };
  };
  service: Pick<Service, "id" | "nameUk" | "nameEn" | "durationMin" | "priceCents">;
};

export type WorkInterval = { id?: string; weekday: number; startMinute: number; endMinute: number; isActive?: boolean };
export type ScheduleException = { id: string; startsAt: string; endsAt: string; isAvailable: boolean; note: string | null };

const request = async <T>(path: string, options?: RequestInit, token?: string): Promise<T> => {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null) as { message?: string } | null;
  if (!response.ok) throw new Error(body?.message ?? "Request failed");
  return body as T;
};

export const getServices = () => request<{ services: Service[] }>("/services");
export const getSpecialists = (serviceId: string) =>
  request<{ specialists: Specialist[] }>(`/specialists?serviceId=${encodeURIComponent(serviceId)}`);
export const getAvailability = (specialistId: string, serviceId: string, date: string) =>
  request<{ slots: Array<{ startsAt: string; endsAt: string }>; timeZone: string }>(
    `/availability?specialistId=${encodeURIComponent(specialistId)}&serviceId=${encodeURIComponent(serviceId)}&date=${encodeURIComponent(date)}`,
  );
export const getMyAppointments = (token: string) => request<{ appointments: Appointment[] }>("/appointments/me", undefined, token);
export const createAppointment = (token: string, input: { specialistId: string; serviceId: string; startsAt: string; clientNote?: string }) =>
  request<{ appointment: Appointment }>("/appointments", { method: "POST", body: JSON.stringify(input) }, token);
export const cancelAppointment = (token: string, appointmentId: string) =>
  request<{ appointment: Appointment }>(`/appointments/${appointmentId}/cancel`, { method: "PATCH" }, token);

export type SpecialistDashboardData = {
  profile: { id: string; slotStepMin: number; specializationUk: string; specializationEn: string | null; services: Array<{ priceCents: number | null; durationMin: number | null; service: Service }> };
  schedule: WorkInterval[];
  exceptions: ScheduleException[];
  appointments: Appointment[];
  stats: { total: number; upcoming: number; bookedMinutes: number };
};

export const getSpecialistDashboard = (token: string) => request<SpecialistDashboardData>("/specialist/dashboard", undefined, token);
export const saveSpecialistSchedule = (token: string, intervals: WorkInterval[], slotStepMin: number) =>
  request("/specialist/schedule", { method: "PUT", body: JSON.stringify({ intervals, slotStepMin }) }, token);
export const saveSpecialistServiceSettings = (token: string, serviceId: string, priceCents: number, durationMin: number) =>
  request(`/specialist/services/${serviceId}/price`, { method: "PATCH", body: JSON.stringify({ priceCents, durationMin }) }, token);
export const createScheduleException = (token: string, input: { startsAt: string; endsAt: string; isAvailable: boolean; note?: string }) =>
  request("/specialist/exceptions", { method: "POST", body: JSON.stringify(input) }, token);
export const deleteScheduleException = (token: string, exceptionId: string) =>
  request(`/specialist/exceptions/${exceptionId}`, { method: "DELETE" }, token);
export const updateSpecialistAppointment = (token: string, appointmentId: string, status: "CONFIRMED" | "CANCELLED" | "COMPLETED") =>
  request(`/specialist/appointments/${appointmentId}/status`, { method: "PATCH", body: JSON.stringify({ status }) }, token);
