ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'RESCHEDULE_REQUEST';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'RESCHEDULE_ACCEPTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'RESCHEDULE_REJECTED';

CREATE TYPE "RescheduleRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

CREATE TABLE "AppointmentRescheduleRequest" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "proposedStartsAt" TIMESTAMP(3) NOT NULL,
    "proposedEndsAt" TIMESTAMP(3) NOT NULL,
    "status" "RescheduleRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppointmentRescheduleRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AppointmentRescheduleRequest_appointmentId_status_idx"
ON "AppointmentRescheduleRequest"("appointmentId", "status");

CREATE INDEX "AppointmentRescheduleRequest_requesterId_createdAt_idx"
ON "AppointmentRescheduleRequest"("requesterId", "createdAt");

CREATE UNIQUE INDEX "AppointmentRescheduleRequest_one_pending_per_appointment"
ON "AppointmentRescheduleRequest"("appointmentId") WHERE "status" = 'PENDING';

ALTER TABLE "AppointmentRescheduleRequest"
ADD CONSTRAINT "AppointmentRescheduleRequest_appointmentId_fkey"
FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AppointmentRescheduleRequest"
ADD CONSTRAINT "AppointmentRescheduleRequest_requesterId_fkey"
FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
