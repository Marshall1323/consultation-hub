ALTER TABLE "SpecialistService" ADD COLUMN "durationMin" INTEGER;

UPDATE "SpecialistService" AS assignment
SET "durationMin" = service."durationMin"
FROM "Service" AS service
WHERE assignment."serviceId" = service.id;

ALTER TABLE "SpecialistService"
ADD CONSTRAINT "SpecialistService_durationMin_range" CHECK (
  "durationMin" IS NULL OR ("durationMin" >= 15 AND "durationMin" <= 480)
);
