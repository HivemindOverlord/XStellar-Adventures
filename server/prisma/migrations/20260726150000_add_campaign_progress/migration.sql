-- AlterTable
ALTER TABLE "Character" ADD COLUMN     "completedChapterIds" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "campaignBossMemory" JSONB NOT NULL DEFAULT '{}';
