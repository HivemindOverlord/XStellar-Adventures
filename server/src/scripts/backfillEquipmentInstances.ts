// One-time data migration: equipment ownership used to live as catalog-id counts in
// Character.inventory (and, if equipped, directly as the catalog id in
// equippedWeaponId/ArmorId/AccessoryId). Equipment ownership now lives in
// CharacterEquipmentInstance rows instead, so this converts any leftover inventory-based
// equipment into instances, reassigns equipped-id fields from catalog ids to the instance
// they now point at, and strips the equipment entries out of inventory (which is
// consumables-only going forward). Safe to re-run: it's a no-op once inventory holds no
// more equipment-catalog ids and equipped fields no longer hold catalog ids.
import "dotenv/config";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { EQUIPMENT } from "@xstellar/shared";
import { prisma } from "../db/prisma.js";

const EQUIPPED_FIELDS = ["equippedWeaponId", "equippedArmorId", "equippedAccessoryId"] as const;

async function main() {
  const characters = await prisma.character.findMany();
  let migratedCharacters = 0;
  let migratedInstances = 0;

  for (const character of characters) {
    const inventory = (character.inventory as Record<string, number>) ?? {};
    const equipmentEntries = Object.entries(inventory).filter(([catalogItemId]) => EQUIPMENT[catalogItemId] !== undefined);

    const equippedLegacyFields = EQUIPPED_FIELDS.filter((field) => {
      const value = character[field];
      return typeof value === "string" && EQUIPMENT[value] !== undefined;
    });

    if (equipmentEntries.length === 0 && equippedLegacyFields.length === 0) continue;

    const remainingInventory = { ...inventory };
    const firstInstanceIdByCatalogId = new Map<string, string>();
    const instancesToCreate: { id: string; catalogItemId: string }[] = [];

    for (const [catalogItemId, count] of equipmentEntries) {
      delete remainingInventory[catalogItemId];
      for (let i = 0; i < count; i++) {
        const id = randomUUID();
        instancesToCreate.push({ id, catalogItemId });
        if (!firstInstanceIdByCatalogId.has(catalogItemId)) {
          firstInstanceIdByCatalogId.set(catalogItemId, id);
        }
      }
    }

    const equippedUpdates: Record<string, string> = {};
    for (const field of equippedLegacyFields) {
      const catalogItemId = character[field] as string;
      let instanceId = firstInstanceIdByCatalogId.get(catalogItemId);
      if (!instanceId) {
        instanceId = randomUUID();
        instancesToCreate.push({ id: instanceId, catalogItemId });
        firstInstanceIdByCatalogId.set(catalogItemId, instanceId);
      }
      equippedUpdates[field] = instanceId;
    }

    await prisma.$transaction([
      prisma.characterEquipmentInstance.createMany({
        data: instancesToCreate.map((instance) => ({
          id: instance.id,
          characterId: character.id,
          catalogItemId: instance.catalogItemId,
          acquiredVia: "loot",
          purchasedDate: null,
        })),
      }),
      prisma.character.update({
        where: { id: character.id },
        data: {
          inventory: remainingInventory as Prisma.InputJsonValue,
          ...equippedUpdates,
        },
      }),
    ]);

    migratedCharacters += 1;
    migratedInstances += instancesToCreate.length;
  }

  console.log(`Backfilled ${migratedInstances} equipment instance(s) across ${migratedCharacters} character(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
