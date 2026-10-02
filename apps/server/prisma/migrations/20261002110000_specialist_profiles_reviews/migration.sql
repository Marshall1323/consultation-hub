ALTER TABLE "SpecialistProfile"
ADD COLUMN "photoUrl" TEXT,
ADD COLUMN "experienceStartYear" INTEGER,
ADD COLUMN "languages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "SpecialistProfile"
SET "experienceStartYear" = EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER - 5
WHERE "experienceStartYear" IS NULL;

UPDATE "SpecialistProfile"
SET "languages" = ARRAY['Українська']::TEXT[]
WHERE cardinality("languages") = 0;

ALTER TABLE "SpecialistProfile"
ADD CONSTRAINT "SpecialistProfile_experienceStartYear_range"
CHECK ("experienceStartYear" IS NULL OR ("experienceStartYear" >= 1950 AND "experienceStartYear" <= 2100));

CREATE TABLE "Review" (
  "id" TEXT NOT NULL,
  "appointmentId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "specialistId" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "comment" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Review_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Review_rating_range" CHECK ("rating" >= 1 AND "rating" <= 5)
);

CREATE UNIQUE INDEX "Review_appointmentId_key" ON "Review"("appointmentId");
CREATE INDEX "Review_specialistId_createdAt_idx" ON "Review"("specialistId", "createdAt");
CREATE INDEX "Review_clientId_idx" ON "Review"("clientId");

ALTER TABLE "Review" ADD CONSTRAINT "Review_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_specialistId_fkey" FOREIGN KEY ("specialistId") REFERENCES "SpecialistProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
