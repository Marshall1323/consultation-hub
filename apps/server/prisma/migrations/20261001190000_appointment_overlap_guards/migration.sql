CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Appointment"
ADD CONSTRAINT "Appointment_specialist_no_overlap"
EXCLUDE USING gist (
  "specialistId" WITH =,
  tsrange("startsAt", "endsAt", '[)') WITH &&
)
WHERE ("status" IN ('PENDING', 'CONFIRMED'));

ALTER TABLE "Appointment"
ADD CONSTRAINT "Appointment_client_no_overlap"
EXCLUDE USING gist (
  "clientId" WITH =,
  tsrange("startsAt", "endsAt", '[)') WITH &&
)
WHERE ("status" IN ('PENDING', 'CONFIRMED'));
