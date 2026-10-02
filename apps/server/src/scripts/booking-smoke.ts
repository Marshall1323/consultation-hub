import "dotenv/config";
import { hash } from "bcryptjs";
import { UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { addDays, localDate } from "../modules/appointments/availability.service.js";
import { completeExpiredAppointments } from "../modules/appointments/appointment-lifecycle.service.js";

const apiUrl = `http://localhost:${process.env.PORT ?? 4000}/api`;
const stamp = Date.now();
const password = "SmokeTest-123";
const emails = {
  first: `smoke-client-a-${stamp}@example.test`,
  second: `smoke-client-b-${stamp}@example.test`,
  specialist: `smoke-specialist-${stamp}@example.test`,
  secondSpecialist: `smoke-specialist-b-${stamp}@example.test`,
};

const request = async (path: string, options?: RequestInit, token?: string) => {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const body = await response.json().catch(() => null);
  return { response, body };
};

const login = async (email: string) => {
  const result = await request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  if (!result.response.ok) throw new Error(`Login failed: ${JSON.stringify(result.body)}`);
  return (result.body as { token: string }).token;
};

const main = async () => {
  const passwordHash = await hash(password, 4);
  const [first, second, specialistUser, secondSpecialistUser] = await Promise.all([
    prisma.user.create({ data: { email: emails.first, passwordHash, firstName: "Smoke", lastName: "ClientA" } }),
    prisma.user.create({ data: { email: emails.second, passwordHash, firstName: "Smoke", lastName: "ClientB" } }),
    prisma.user.create({ data: { email: emails.specialist, passwordHash, firstName: "Smoke", lastName: "Specialist", role: UserRole.SPECIALIST } }),
    prisma.user.create({ data: { email: emails.secondSpecialist, passwordHash, firstName: "Smoke", lastName: "SpecialistB", role: UserRole.SPECIALIST } }),
  ]);

  try {
    const service = await prisma.service.create({
      data: { name: "Smoke service", nameUk: "Тестова консультація", nameEn: "Smoke consultation", durationMin: 60, priceCents: 125_000 },
    });
    const specialist = await prisma.specialistProfile.create({
      data: { userId: specialistUser.id, specializationUk: "Тестовий спеціаліст", specializationEn: "Smoke specialist", slotStepMin: 30 },
    });
    const secondSpecialist = await prisma.specialistProfile.create({
      data: { userId: secondSpecialistUser.id, specializationUk: "Другий тестовий спеціаліст", specializationEn: "Second smoke specialist", slotStepMin: 30 },
    });
    await prisma.specialistService.createMany({ data: [
      { specialistId: specialist.id, serviceId: service.id, priceCents: 139_900, durationMin: 30 },
      { specialistId: secondSpecialist.id, serviceId: service.id, priceCents: 159_900, durationMin: 60 },
    ] });
    const date = addDays(localDate(new Date()), 3);
    const weekday = new Date(`${date}T12:00:00.000Z`).getUTCDay();
    await prisma.workSchedule.createMany({ data: [
      { specialistId: specialist.id, weekday, startMinute: 9 * 60, endMinute: 17 * 60 },
      { specialistId: secondSpecialist.id, weekday, startMinute: 9 * 60, endMinute: 17 * 60 },
    ] });

    const [firstToken, secondToken] = await Promise.all([login(first.email), login(second.email)]);
    const availability = await request(`/availability?specialistId=${specialist.id}&serviceId=${service.id}&date=${date}`);
    if (!availability.response.ok) throw new Error(`Availability failed: ${JSON.stringify(availability.body)}`);
    const firstSlot = (availability.body as { slots: Array<{ startsAt: string; endsAt: string }> }).slots[0];
    const startsAt = firstSlot?.startsAt;
    if (!startsAt) throw new Error("No slot generated");
    if (new Date(firstSlot.endsAt).getTime() - new Date(firstSlot.startsAt).getTime() !== 30 * 60_000) {
      throw new Error("Specialist-specific duration was not used for availability");
    }

    const payload = JSON.stringify({ specialistId: specialist.id, serviceId: service.id, startsAt });
    const results = await Promise.all([
      request("/appointments", { method: "POST", body: payload }, firstToken),
      request("/appointments", { method: "POST", body: payload }, secondToken),
    ]);
    const success = results.find((item) => item.response.status === 201);
    const conflict = results.find((item) => item.response.status === 409);
    if (!success || !conflict) throw new Error(`Concurrency guard failed: ${results.map((item) => item.response.status).join(",")}`);

    const appointment = (success.body as { appointment: { id: string; priceCents: number | null; status: string; client: { id: string } } }).appointment;
    if (appointment.status !== "PENDING") throw new Error(`New appointment should await confirmation, received: ${appointment.status}`);
    if (appointment.priceCents !== 139_900) throw new Error(`Appointment price snapshot is incorrect: ${appointment.priceCents}`);
    const ownerToken = appointment.client.id === first.id ? firstToken : secondToken;
    const otherToken = appointment.client.id === first.id ? secondToken : firstToken;
    const cancelled = await request(`/appointments/${appointment.id}/cancel`, { method: "PATCH" }, ownerToken);
    if (!cancelled.response.ok) throw new Error(`Cancellation failed: ${JSON.stringify(cancelled.body)}`);
    const rebooked = await request("/appointments", { method: "POST", body: payload }, otherToken);
    if (rebooked.response.status !== 201) throw new Error(`Released slot was not bookable: ${JSON.stringify(rebooked.body)}`);
    const rebookedAppointment = (rebooked.body as { appointment: { id: string } }).appointment;
    const overlappingClientBooking = await request("/appointments", {
      method: "POST",
      body: JSON.stringify({ specialistId: secondSpecialist.id, serviceId: service.id, startsAt }),
    }, otherToken);
    if (overlappingClientBooking.response.status !== 409) throw new Error("Client overlap guard did not reject a simultaneous booking");

    const specialistToken = await login(specialistUser.email);
    const requests = await request("/specialist/requests", undefined, specialistToken);
    if (!(requests.body as { pending: Array<{ id: string }> }).pending.some((item) => item.id === rebookedAppointment.id)) throw new Error("Pending booking is missing from specialist requests");
    const specialistNotifications = await request("/notifications", undefined, specialistToken);
    if (!(specialistNotifications.body as { notifications: Array<{ type: string }> }).notifications.some((item) => item.type === "BOOKING_REQUEST")) throw new Error("Specialist did not receive a booking notification");
    const confirmation = await request(`/specialist/appointments/${rebookedAppointment.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "CONFIRMED" }) }, specialistToken);
    if (!confirmation.response.ok) throw new Error(`Booking confirmation failed: ${JSON.stringify(confirmation.body)}`);
    const clientNotifications = await request("/notifications", undefined, otherToken);
    if (!(clientNotifications.body as { notifications: Array<{ type: string }> }).notifications.some((item) => item.type === "BOOKING_CONFIRMED")) throw new Error("Client did not receive a confirmation notification");
    const hosted = await request("/appointments/me", undefined, specialistToken);
    if (!(hosted.body as { appointments: unknown[] }).appointments.length) throw new Error("Hosted session is missing from specialist calendar");
    const secondAvailability = await request(`/availability?specialistId=${secondSpecialist.id}&serviceId=${service.id}&date=${date}`);
    const secondStartsAt = (secondAvailability.body as { slots: Array<{ startsAt: string }> }).slots[1]?.startsAt;
    const specialistBooking = await request("/appointments", {
      method: "POST",
      body: JSON.stringify({ specialistId: secondSpecialist.id, serviceId: service.id, startsAt: secondStartsAt }),
    }, specialistToken);
    if (specialistBooking.response.status !== 201) throw new Error(`Specialist could not book as a client: ${JSON.stringify(specialistBooking.body)}`);
    if ((specialistBooking.body as { appointment: { priceCents: number | null } }).appointment.priceCents !== 159_900) {
      throw new Error("Second specialist price snapshot is incorrect");
    }
    const combinedCalendar = await request("/appointments/me", undefined, specialistToken);
    if ((combinedCalendar.body as { appointments: unknown[] }).appointments.length < 2) throw new Error("Combined specialist calendar is incomplete");

    const now = Date.now();
    await prisma.appointment.update({ where: { id: rebookedAppointment.id }, data: { startsAt: new Date(now - 31 * 60_000), endsAt: new Date(now - 60_000) } });
    await completeExpiredAppointments();
    const automaticallyCompleted = await prisma.appointment.findUnique({ where: { id: rebookedAppointment.id }, select: { status: true } });
    if (automaticallyCompleted?.status !== "COMPLETED") throw new Error("Expired confirmed appointment was not completed automatically");
    const createdReview = await request(`/specialists/${specialist.id}/reviews`, {
      method: "POST",
      body: JSON.stringify({ appointmentId: rebookedAppointment.id, rating: 5, comment: "Дуже корисна тестова консультація." }),
    }, otherToken);
    if (createdReview.response.status !== 201) throw new Error(`Review creation failed: ${JSON.stringify(createdReview.body)}`);
    const reviewNotifications = await request("/notifications", undefined, specialistToken);
    if (!(reviewNotifications.body as { notifications: Array<{ type: string }> }).notifications.some((item) => item.type === "REVIEW_RECEIVED")) throw new Error("Specialist did not receive a review notification");
    const reviewId = (createdReview.body as { review: { id: string } }).review.id;
    const duplicateReview = await request(`/specialists/${specialist.id}/reviews`, {
      method: "POST",
      body: JSON.stringify({ appointmentId: rebookedAppointment.id, rating: 4, comment: "Повторний відгук не має створюватися." }),
    }, otherToken);
    if (duplicateReview.response.status !== 409) throw new Error("Duplicate review was not rejected");
    const publicProfile = await request(`/specialists/${specialist.id}/profile`);
    const profile = (publicProfile.body as { profile: { reviewCount: number; averageRating: number | null } }).profile;
    if (profile.reviewCount !== 1 || profile.averageRating !== 5) throw new Error("Public review statistics are incorrect");
    const editedReview = await request(`/reviews/${reviewId}`, {
      method: "PATCH",
      body: JSON.stringify({ rating: 4, comment: "Оновлений корисний тестовий відгук." }),
    }, otherToken);
    if (!editedReview.response.ok) throw new Error(`Review update failed: ${JSON.stringify(editedReview.body)}`);
    const deletedReview = await request(`/reviews/${reviewId}`, { method: "DELETE" }, otherToken);
    if (deletedReview.response.status !== 204) throw new Error("Review deletion failed");

    console.log("Booking smoke test passed: pending requests, notifications, scheduling, conflicts, combined calendar, public profiles and verified reviews.");
  } finally {
    await prisma.appointment.deleteMany({ where: { clientId: { in: [first.id, second.id, specialistUser.id, secondSpecialistUser.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [first.id, second.id, specialistUser.id, secondSpecialistUser.id] } } });
    await prisma.service.deleteMany({ where: { name: "Smoke service" } });
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
