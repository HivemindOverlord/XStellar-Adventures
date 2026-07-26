-- AlterTable
ALTER TABLE "Character" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "unallocatedStatPoints" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "unlockedClasses" JSONB NOT NULL DEFAULT '[]',
ALTER COLUMN "jobClass" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "activeCharacterId" TEXT,
ADD COLUMN     "unlockedCharacterSlots" INTEGER NOT NULL DEFAULT 1;
