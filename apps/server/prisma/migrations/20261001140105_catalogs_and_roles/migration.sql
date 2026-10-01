/*
  Warnings:

  - Added the required column `nameEn` to the `Service` table without a default value. This is not possible if the table is not empty.
  - Added the required column `nameUk` to the `Service` table without a default value. This is not possible if the table is not empty.
  - Added the required column `specializationUk` to the `SpecialistProfile` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "descriptionEn" TEXT,
ADD COLUMN     "descriptionUk" TEXT,
ADD COLUMN     "nameEn" TEXT NOT NULL,
ADD COLUMN     "nameUk" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "SpecialistProfile" ADD COLUMN     "descriptionEn" TEXT,
ADD COLUMN     "descriptionUk" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "specializationEn" TEXT,
ADD COLUMN     "specializationUk" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;
