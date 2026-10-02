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
  photoUrl: string | null;
  experienceStartYear: number | null;
  languages: string[];
  completedConsultations: number;
  reviewCount: number;
  averageRating: number | null;
  user: { id: string; firstName: string; lastName: string; avatarUrl: string | null };
  services: Array<{ priceCents: number | null; durationMin: number | null; service: Service }>;
};

export type Review = {
  id: string;
  appointmentId: string;
  rating: number;
  comment: string;
  createdAt: string;
  updatedAt: string;
  client: { id: string; firstName: string; lastName: string; avatarUrl: string | null };
};

export type SpecialistProfile = Specialist & { reviews: Review[] };

export type Appointment = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED";
  clientNote: string | null;
  priceCents: number | null;
  client: { id: string; firstName: string; lastName: string; email: string; avatarUrl: string | null };
  specialist: {
    id: string;
    specializationUk: string;
    specializationEn: string | null;
    photoUrl: string | null;
    user: { id: string; firstName: string; lastName: string; avatarUrl: string | null };
  };
  service: Pick<Service, "id" | "nameUk" | "nameEn" | "durationMin" | "priceCents">;
};

type AppointmentsResponse = { appointments: Appointment[] };
const appointmentCache = new Map<string, { value: AppointmentsResponse; expiresAt: number }>();
const appointmentRequests = new Map<string, Promise<AppointmentsResponse>>();
const appointmentCacheVersions = new Map<string, number>();
const appointmentCacheLifetimeMs = 30_000;
const specialistRequestCache = new Map<string, { value: SpecialistRequests; expiresAt: number }>();
const specialistRequestPromises = new Map<string, Promise<SpecialistRequests>>();
const specialistRequestCacheLifetimeMs = 15_000;

export const invalidateAppointmentsCache = (token: string) => {
  appointmentCache.delete(token);
  appointmentRequests.delete(token);
  appointmentCacheVersions.set(token, (appointmentCacheVersions.get(token) ?? 0) + 1);
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
export const getSpecialistProfile = (specialistId: string) =>
  request<{ profile: SpecialistProfile }>(`/specialists/${encodeURIComponent(specialistId)}/profile`);
export const getNearestAvailability = (specialistId: string, serviceId: string) =>
  request<{ slot: { startsAt: string; endsAt: string } | null }>(`/specialists/${encodeURIComponent(specialistId)}/nearest?serviceId=${encodeURIComponent(serviceId)}`);
export const getAvailability = (specialistId: string, serviceId: string, date: string) =>
  request<{ slots: Array<{ startsAt: string; endsAt: string }>; timeZone: string }>(
    `/availability?specialistId=${encodeURIComponent(specialistId)}&serviceId=${encodeURIComponent(serviceId)}&date=${encodeURIComponent(date)}`,
  );
export const getMyAppointments = (token: string) => {
  const cached = appointmentCache.get(token);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value);
  const activeRequest = appointmentRequests.get(token);
  if (activeRequest) return activeRequest;
  const requestVersion = appointmentCacheVersions.get(token) ?? 0;
  const nextRequest = request<AppointmentsResponse>("/appointments/me", undefined, token)
    .then((value) => {
      if ((appointmentCacheVersions.get(token) ?? 0) === requestVersion) {
        appointmentCache.set(token, { value, expiresAt: Date.now() + appointmentCacheLifetimeMs });
      }
      return value;
    })
    .finally(() => appointmentRequests.delete(token));
  appointmentRequests.set(token, nextRequest);
  return nextRequest;
};
export const createAppointment = async (token: string, input: { specialistId: string; serviceId: string; startsAt: string; clientNote?: string }) => {
  const result = await request<{ appointment: Appointment }>("/appointments", { method: "POST", body: JSON.stringify(input) }, token);
  invalidateAppointmentsCache(token);
  return result;
};
export const cancelAppointment = async (token: string, appointmentId: string) => {
  const result = await request<{ appointment: Appointment }>(`/appointments/${appointmentId}/cancel`, { method: "PATCH" }, token);
  invalidateAppointmentsCache(token);
  return result;
};

export type SpecialistDashboardData = {
  profile: { id: string; slotStepMin: number; specializationUk: string; specializationEn: string | null; descriptionUk: string | null; descriptionEn: string | null; photoUrl: string | null; experienceStartYear: number | null; languages: string[]; services: Array<{ priceCents: number | null; durationMin: number | null; service: Service }> };
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
export const saveSpecialistProfile = (token: string, input: { specializationUk: string; specializationEn: string | null; descriptionUk: string; descriptionEn: string | null; experienceStartYear: number; languages: string[] }) =>
  request(`/specialist/profile`, { method: "PATCH", body: JSON.stringify(input) }, token);
export const createReview = (token: string, specialistId: string, input: { appointmentId: string; rating: number; comment: string }) =>
  request<{ review: Review }>(`/specialists/${specialistId}/reviews`, { method: "POST", body: JSON.stringify(input) }, token);
export const updateReview = (token: string, reviewId: string, input: { rating: number; comment: string }) =>
  request<{ review: Review }>(`/reviews/${reviewId}`, { method: "PATCH", body: JSON.stringify(input) }, token);
export const deleteReview = (token: string, reviewId: string) =>
  request<void>(`/reviews/${reviewId}`, { method: "DELETE" }, token);
export const createScheduleException = (token: string, input: { startsAt: string; endsAt: string; isAvailable: boolean; note?: string }) =>
  request("/specialist/exceptions", { method: "POST", body: JSON.stringify(input) }, token);
export const deleteScheduleException = (token: string, exceptionId: string) =>
  request(`/specialist/exceptions/${exceptionId}`, { method: "DELETE" }, token);
export const updateSpecialistAppointment = async (token: string, appointmentId: string, status: "CONFIRMED" | "CANCELLED" | "COMPLETED") => {
  const result = await request(`/specialist/appointments/${appointmentId}/status`, { method: "PATCH", body: JSON.stringify({ status }) }, token);
  invalidateAppointmentsCache(token);
  specialistRequestCache.delete(token);
  specialistRequestPromises.delete(token);
  return result;
};

export type SpecialistRequest = Pick<Appointment, "id" | "startsAt" | "endsAt" | "status" | "clientNote" | "priceCents" | "client" | "service">;
export type SpecialistRequests = { specialistId: string; pending: SpecialistRequest[]; processed: SpecialistRequest[]; pendingCount: number };
export const getSpecialistRequests = (token: string) => {
  const cached = specialistRequestCache.get(token);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value);
  const activeRequest = specialistRequestPromises.get(token);
  if (activeRequest) return activeRequest;
  const nextRequest = request<SpecialistRequests>("/specialist/requests", undefined, token)
    .then((value) => {
      specialistRequestCache.set(token, { value, expiresAt: Date.now() + specialistRequestCacheLifetimeMs });
      return value;
    })
    .finally(() => specialistRequestPromises.delete(token));
  specialistRequestPromises.set(token, nextRequest);
  return nextRequest;
};

export type Notification = {
  id: string;
  type: "BOOKING_REQUEST" | "BOOKING_CONFIRMED" | "BOOKING_REJECTED" | "REVIEW_RECEIVED";
  titleUk: string;
  titleEn: string;
  bodyUk: string;
  bodyEn: string;
  href: string;
  readAt: string | null;
  createdAt: string;
};
export const getNotifications = (token: string) => request<{ notifications: Notification[]; unreadCount: number }>("/notifications", undefined, token);
export const readNotification = (token: string, notificationId: string) => request<void>(`/notifications/${notificationId}/read`, { method: "PATCH" }, token);
export const readAllNotifications = (token: string) => request<void>("/notifications/read-all", { method: "PATCH" }, token);
