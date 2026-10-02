import "dotenv/config";
import { AppointmentStatus, NotificationType } from "@prisma/client";
import { hash } from "bcryptjs";
import { prisma } from "../lib/prisma.js";

const specialistEmail = "consultant01@example.test";
const demoEmailPrefix = "showcase.client.";
const cleanOnly = process.argv.includes("--clean");

const people = [
  ["Марія", "Бондар"], ["Андрій", "Кравець"], ["Софія", "Мельник"], ["Дмитро", "Ковальчук"],
  ["Ірина", "Савчук"], ["Олексій", "Бойко"], ["Катерина", "Лисенко"], ["Владислав", "Ткаченко"],
  ["Наталія", "Мороз"], ["Богдан", "Олійник"], ["Анна", "Поліщук"], ["Роман", "Шевченко"],
  ["Юлія", "Петренко"], ["Михайло", "Козак"], ["Дарина", "Сидоренко"], ["Євген", "Гриценко"],
  ["Вікторія", "Марченко"], ["Тарас", "Левченко"],
] as const;

const comments = [
  "Дуже уважна консультація. Отримала зрозумілий план подальших дій.",
  "Сподобався спокійний темп і конкретні поради без зайвої теорії.",
  "Після зустрічі стало значно легше структурувати свої думки.",
  "Корисна розмова, спеціалістка уважно вислухала і відповіла на всі питання.",
  "Усе пройшло вчасно та професійно. Обов’язково звернуся ще.",
  "Отримав практичні рекомендації, які можна застосувати одразу.",
  "Комфортна атмосфера й дуже зрозуміле пояснення складних речей.",
  "Консультація виправдала очікування, дякую за підтримку.",
  "Було легко говорити, а наприкінці з’явилося чітке розуміння наступного кроку.",
] as const;

const localDate = (date: string, time: string) => new Date(`${date}T${time}:00+03:00`);
const addMinutes = (value: Date, minutes: number) => new Date(value.getTime() + minutes * 60_000);

const clearShowcase = async () => {
  const demoUsers = await prisma.user.findMany({ where: { email: { startsWith: demoEmailPrefix } }, select: { id: true } });
  const userIds = demoUsers.map((item) => item.id);
  if (!userIds.length) return;
  const appointmentIds = (await prisma.appointment.findMany({ where: { clientId: { in: userIds } }, select: { id: true } })).map((item) => item.id);
  await prisma.$transaction([
    prisma.notification.deleteMany({ where: { OR: [{ bodyUk: { startsWith: "Демо-клієнт" } }, { bodyEn: { startsWith: "Demo client" } }] } }),
    prisma.review.deleteMany({ where: { appointmentId: { in: appointmentIds } } }),
    prisma.appointment.deleteMany({ where: { id: { in: appointmentIds } } }),
    prisma.user.deleteMany({ where: { id: { in: userIds } } }),
  ]);
};

const main = async () => {
  await clearShowcase();
  if (cleanOnly) { console.log("Showcase data removed."); return; }

  const specialist = await prisma.specialistProfile.findFirst({
    where: { user: { email: specialistEmail } },
    include: { user: true, services: { include: { service: true }, take: 1 } },
  });
  const assignment = specialist?.services[0];
  if (!specialist || !assignment) throw new Error(`Specialist ${specialistEmail} or assigned service was not found`);
  const durationMin = assignment.durationMin ?? assignment.service.durationMin;
  const priceCents = assignment.priceCents ?? assignment.service.priceCents;
  const passwordHash = await hash("ShowcaseClient123!", 6);

  const clients = await Promise.all(people.map(([firstName, lastName], index) => prisma.user.create({
    data: { email: `${demoEmailPrefix}${String(index + 1).padStart(2, "0")}@example.test`, passwordHash, firstName, lastName },
  })));

  const completedDates = ["2026-08-18", "2026-08-21", "2026-08-25", "2026-08-28", "2026-09-01", "2026-09-03", "2026-09-07", "2026-09-09", "2026-09-11", "2026-09-14", "2026-09-16", "2026-09-18", "2026-09-21", "2026-09-23", "2026-09-25", "2026-09-28", "2026-09-29", "2026-09-30"];
  for (const [index, client] of clients.entries()) {
    const startsAt = localDate(completedDates[index]!, index % 2 ? "15:00" : "16:00");
    const appointment = await prisma.appointment.create({ data: { clientId: client.id, specialistId: specialist.id, serviceId: assignment.serviceId, startsAt, endsAt: addMinutes(startsAt, durationMin), priceCents, status: AppointmentStatus.COMPLETED } });
    await prisma.review.create({ data: { appointmentId: appointment.id, clientId: client.id, specialistId: specialist.id, rating: [5, 5, 4, 5, 5, 4][index % 6]!, comment: comments[index % comments.length]!, createdAt: addMinutes(startsAt, durationMin + 30) } });
  }

  const candidates = [
    ["2026-10-05", "09:00"], ["2026-10-05", "10:00"], ["2026-10-05", "11:00"], ["2026-10-05", "14:00"],
    ["2026-10-06", "09:00"], ["2026-10-06", "10:00"], ["2026-10-06", "14:00"], ["2026-10-07", "09:00"],
    ["2026-10-07", "10:00"], ["2026-10-07", "14:00"], ["2026-10-08", "09:00"], ["2026-10-08", "10:00"],
  ] as const;
  let createdPending = 0;
  for (const [date, time] of candidates) {
    if (createdPending >= 8) break;
    const startsAt = localDate(date, time); const endsAt = addMinutes(startsAt, durationMin);
    const conflict = await prisma.appointment.findFirst({ where: { specialistId: specialist.id, status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } }, select: { id: true } });
    if (conflict) continue;
    const client = clients[createdPending]!;
    const appointment = await prisma.appointment.create({ data: { clientId: client.id, specialistId: specialist.id, serviceId: assignment.serviceId, startsAt, endsAt, priceCents, status: AppointmentStatus.PENDING, clientNote: createdPending % 3 === 0 ? "Хочу обговорити запит детальніше під час зустрічі." : null } });
    await prisma.notification.create({ data: { userId: specialist.userId, type: NotificationType.BOOKING_REQUEST, titleUk: "Нова заявка на консультацію", titleEn: "New consultation request", bodyUk: `Демо-клієнт ${client.firstName} ${client.lastName} очікує підтвердження`, bodyEn: `Demo client ${client.firstName} ${client.lastName} is waiting for confirmation`, href: `/specialist/requests?appointmentId=${appointment.id}`, createdAt: new Date(Date.now() - createdPending * 7 * 60_000) } });
    createdPending += 1;
  }

  console.log(`Showcase ready for ${specialistEmail}: ${clients.length} reviews, ${createdPending} pending requests and notifications.`);
  console.log("Remove later with: pnpm db:seed-showcase -- --clean");
};

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
