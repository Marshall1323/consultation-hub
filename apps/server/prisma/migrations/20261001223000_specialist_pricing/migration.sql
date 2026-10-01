ALTER TABLE "SpecialistService" ADD COLUMN "priceCents" INTEGER;
ALTER TABLE "Appointment" ADD COLUMN "priceCents" INTEGER;

UPDATE "SpecialistService" AS assignment
SET "priceCents" = service."priceCents"
FROM "Service" AS service
WHERE assignment."serviceId" = service.id;

UPDATE "Appointment" AS appointment
SET "priceCents" = service."priceCents"
FROM "Service" AS service
WHERE appointment."serviceId" = service.id;

ALTER TABLE "SpecialistService"
ADD CONSTRAINT "SpecialistService_priceCents_nonnegative" CHECK ("priceCents" IS NULL OR "priceCents" >= 0);

ALTER TABLE "Appointment"
ADD CONSTRAINT "Appointment_priceCents_nonnegative" CHECK ("priceCents" IS NULL OR "priceCents" >= 0);
