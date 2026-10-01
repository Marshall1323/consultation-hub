import "dotenv/config";
import { UserRole } from "@prisma/client";
import { hash } from "bcryptjs";
import { prisma } from "../lib/prisma.js";

const demoPassword = "Consultant123!";

const categories = [
  { key: "demo-psychology", nameUk: "Психологічна підтримка", nameEn: "Psychological support", descriptionUk: "Індивідуальні консультації з психологом: стрес, тривога, стосунки та особисті зміни.", descriptionEn: "Individual sessions with a psychologist: stress, anxiety, relationships and personal change.", durationMin: 50, priceCents: 100_000 },
  { key: "demo-career", nameUk: "Кар’єра та професійний розвиток", nameEn: "Career and professional development", descriptionUk: "Пошук професійного напряму, підготовка до співбесіди та планування кар’єри.", descriptionEn: "Career direction, interview preparation and professional growth planning.", durationMin: 60, priceCents: 120_000 },
  { key: "demo-legal", nameUk: "Юридична консультація", nameEn: "Legal consultation", descriptionUk: "Первинна консультація з цивільних, трудових і договірних питань.", descriptionEn: "Initial advice on civil, employment and contract matters.", durationMin: 45, priceCents: 150_000 },
  { key: "demo-finance", nameUk: "Фінанси та особистий бюджет", nameEn: "Finance and personal budgeting", descriptionUk: "Особистий бюджет, фінансові цілі, заощадження та базове планування.", descriptionEn: "Personal budgeting, financial goals, savings and basic planning.", durationMin: 60, priceCents: 140_000 },
  { key: "demo-it", nameUk: "IT та цифрові технології", nameEn: "IT and digital technology", descriptionUk: "Допомога з вибором технологій, цифрових інструментів і розвитком в IT.", descriptionEn: "Technology selection, digital tools and guidance for an IT career.", durationMin: 45, priceCents: 130_000 },
  { key: "demo-education", nameUk: "Освіта та навчання", nameEn: "Education and learning", descriptionUk: "Побудова навчального плану, вибір програми та розвиток навичок навчання.", descriptionEn: "Study planning, programme selection and development of learning skills.", durationMin: 60, priceCents: 90_000 },
  { key: "demo-nutrition", nameUk: "Харчування та здоровий спосіб життя", nameEn: "Nutrition and healthy lifestyle", descriptionUk: "Збалансований раціон, харчові звички та реалістичний план здорового способу життя.", descriptionEn: "Balanced nutrition, eating habits and a realistic healthy lifestyle plan.", durationMin: 45, priceCents: 110_000 },
] as const;

const consultants = [
  ["Олена", "Коваль", "Психологиня, когнітивно-поведінкова терапія", "Psychologist, cognitive behavioural therapy", [0]],
  ["Андрій", "Мельник", "Психолог, робота зі стресом і вигоранням", "Psychologist, stress and burnout support", [0]],
  ["Ірина", "Бондаренко", "Сімейна психологиня та консультантка зі стосунків", "Family psychologist and relationship counsellor", [0]],
  ["Максим", "Шевченко", "Кар’єрний консультант та HR-ментор", "Career consultant and HR mentor", [1]],
  ["Наталія", "Ткаченко", "Кар’єрна консультантка, резюме та співбесіди", "Career consultant, CV and interview preparation", [1]],
  ["Владислав", "Кравченко", "Ментор з розвитку кар’єри в IT", "IT career development mentor", [1, 4]],
  ["Марія", "Олійник", "Юристка з цивільного та сімейного права", "Civil and family law adviser", [2]],
  ["Богдан", "Поліщук", "Юрист з трудового та договірного права", "Employment and contract law adviser", [2]],
  ["Софія", "Лисенко", "Юристка для ФОП і малого бізнесу", "Legal adviser for entrepreneurs and small businesses", [2, 3]],
  ["Дмитро", "Мороз", "Консультант з особистих фінансів", "Personal finance consultant", [3]],
  ["Катерина", "Романенко", "Фінансова консультантка з планування бюджету", "Financial planning and budgeting consultant", [3]],
  ["Олексій", "Савченко", "Фінансовий аналітик та консультант для підприємців", "Financial analyst and entrepreneur adviser", [3]],
  ["Анна", "Козак", "Frontend-менторка та консультантка з веброзробки", "Frontend mentor and web development consultant", [4]],
  ["Роман", "Іваненко", "Backend-розробник та системний консультант", "Backend developer and systems consultant", [4]],
  ["Юлія", "Марченко", "Консультантка з UX/UI та цифрових продуктів", "UX/UI and digital product consultant", [4]],
  ["Тарас", "Петренко", "Освітній консультант і викладач математики", "Education consultant and mathematics tutor", [5]],
  ["Вікторія", "Сидоренко", "Консультантка з іноземних мов і навчальних стратегій", "Language and learning strategies consultant", [5]],
  ["Михайло", "Гриценко", "Ментор з академічного письма та досліджень", "Academic writing and research mentor", [5]],
  ["Дарина", "Левченко", "Консультантка зі збалансованого харчування", "Balanced nutrition consultant", [6]],
  ["Євген", "Клименко", "Консультант зі здорових звичок і способу життя", "Healthy habits and lifestyle consultant", [6]],
] as const;

const main = async () => {
  const passwordHash = await hash(demoPassword, 12);
  const serviceIds: string[] = [];

  for (const category of categories) {
    const { key, ...serviceData } = category;
    const existing = await prisma.service.findFirst({ where: { name: category.key } });
    const service = existing
      ? await prisma.service.update({ where: { id: existing.id }, data: { ...serviceData, name: key, isActive: true } })
      : await prisma.service.create({ data: { ...serviceData, name: key } });
    serviceIds.push(service.id);
  }

  for (const [index, consultant] of consultants.entries()) {
    const [firstName, lastName, specializationUk, specializationEn, categoryIndexes] = consultant;
    const assignedServices = categoryIndexes.map((categoryIndex) => {
      const serviceId = serviceIds[categoryIndex];
      if (!serviceId) throw new Error(`Unknown category index: ${categoryIndex}`);
      const category = categories[categoryIndex];
      if (!category) throw new Error(`Unknown category index: ${categoryIndex}`);
      const adjustment = ((index * 3 + categoryIndex * 2) % 5 - 2) * 10_000;
      return { serviceId, priceCents: Math.max(0, category.priceCents + adjustment), durationMin: category.durationMin };
    });
    const email = `consultant${String(index + 1).padStart(2, "0")}@example.test`;
    const user = await prisma.user.upsert({
      where: { email },
      update: { firstName, lastName, role: UserRole.SPECIALIST, isActive: true },
      create: { email, passwordHash, firstName, lastName, role: UserRole.SPECIALIST },
    });

    await prisma.specialistProfile.upsert({
      where: { userId: user.id },
      update: {
        specializationUk,
        specializationEn,
        descriptionUk: `${specializationUk}. Онлайн-консультації за попереднім записом.`,
        descriptionEn: `${specializationEn}. Online sessions by appointment.`,
        isActive: true,
        slotStepMin: 15,
        services: { deleteMany: {}, create: assignedServices },
        schedules: {
          deleteMany: {},
          create: Array.from({ length: 5 }, (_, weekdayIndex) => [
            { weekday: weekdayIndex + 1, startMinute: 9 * 60, endMinute: 13 * 60 },
            { weekday: weekdayIndex + 1, startMinute: 14 * 60, endMinute: 18 * 60 },
          ]).flat(),
        },
      },
      create: {
        userId: user.id,
        specializationUk,
        specializationEn,
        descriptionUk: `${specializationUk}. Онлайн-консультації за попереднім записом.`,
        descriptionEn: `${specializationEn}. Online sessions by appointment.`,
        slotStepMin: 15,
        services: { create: assignedServices },
        schedules: {
          create: Array.from({ length: 5 }, (_, weekdayIndex) => [
            { weekday: weekdayIndex + 1, startMinute: 9 * 60, endMinute: 13 * 60 },
            { weekday: weekdayIndex + 1, startMinute: 14 * 60, endMinute: 18 * 60 },
          ]).flat(),
        },
      },
    });
  }

  console.log(`Demo catalog ready: ${categories.length} categories and ${consultants.length} consultants.`);
  console.log(`Consultant accounts: consultant01@example.test … consultant20@example.test; password: ${demoPassword}`);
};

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
