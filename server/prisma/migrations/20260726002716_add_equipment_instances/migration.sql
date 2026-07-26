-- CreateTable
CREATE TABLE "CharacterEquipmentInstance" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "enhancementLevel" INTEGER NOT NULL DEFAULT 0,
    "acquiredVia" TEXT NOT NULL,
    "purchasedDate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharacterEquipmentInstance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CharacterEquipmentInstance_characterId_idx" ON "CharacterEquipmentInstance"("characterId");

-- AddForeignKey
ALTER TABLE "CharacterEquipmentInstance" ADD CONSTRAINT "CharacterEquipmentInstance_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
