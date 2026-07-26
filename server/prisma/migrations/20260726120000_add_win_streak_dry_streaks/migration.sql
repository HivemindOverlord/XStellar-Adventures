-- RenameColumn
ALTER TABLE "Character" RENAME COLUMN "winStreak" TO "currentWinStreak";

-- AlterTable
ALTER TABLE "Character" ADD COLUMN     "dryStreakWeapon" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "dryStreakArmor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "dryStreakAccessory" INTEGER NOT NULL DEFAULT 0;
