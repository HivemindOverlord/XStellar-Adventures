-- AlterTable
ALTER TABLE "Character" ADD COLUMN     "currency" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "purchasesToday" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "purchasesTodayDate" TEXT;
