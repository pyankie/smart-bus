/*
  Warnings:

  - The `description` column on the `routes` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `description` column on the `wallet_transactions` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `name` on the `routes` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `name` on the `stops` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "routes" DROP COLUMN "name",
ADD COLUMN     "name" JSONB NOT NULL,
DROP COLUMN "description",
ADD COLUMN     "description" JSONB;

-- AlterTable
ALTER TABLE "stops" DROP COLUMN "name",
ADD COLUMN     "name" JSONB NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "preferred_locale" TEXT NOT NULL DEFAULT 'en';

-- AlterTable
ALTER TABLE "wallet_transactions" DROP COLUMN "description",
ADD COLUMN     "description" JSONB;
