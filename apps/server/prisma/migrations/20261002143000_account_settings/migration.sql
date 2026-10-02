ALTER TABLE "User" ADD COLUMN "username" TEXT;
ALTER TABLE "User" ADD COLUMN "avatarUrl" TEXT;

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

UPDATE "User" AS u
SET "avatarUrl" = sp."photoUrl"
FROM "SpecialistProfile" AS sp
WHERE sp."userId" = u."id" AND sp."photoUrl" IS NOT NULL;
