import type { Character, EquipmentAcquisitionSource, EquipmentInstance, EquipmentSlot } from "@xstellar/shared";
import { EQUIPMENT } from "@xstellar/shared";
import { prisma } from "../db/prisma.js";

export class EquipError extends Error {}

type EquippedIdField = "equippedWeaponId" | "equippedArmorId" | "equippedAccessoryId";

const EQUIPPED_ID_FIELD: Record<EquipmentSlot, EquippedIdField> = {
  weapon: "equippedWeaponId",
  armor: "equippedArmorId",
  accessory: "equippedAccessoryId",
};

export async function equipItem(character: Character, instanceId: string): Promise<Character> {
  const instance = await prisma.characterEquipmentInstance.findUnique({ where: { id: instanceId } });
  if (!instance || instance.characterId !== character.id) {
    throw new EquipError("You don't own that equipment");
  }

  const item = EQUIPMENT[instance.catalogItemId];
  if (!item) {
    throw new EquipError("Unknown equipment item");
  }
  if (item.classLock && item.classLock !== character.jobClass) {
    throw new EquipError(`${item.name} can only be equipped by a ${item.classLock}`);
  }

  const field = EQUIPPED_ID_FIELD[item.slot];
  await persistEquippedField(character.id, field, instance.id);
  return { ...character, [field]: instance.id };
}

export async function unequipSlot(character: Character, slot: EquipmentSlot): Promise<Character> {
  const field = EQUIPPED_ID_FIELD[slot];
  await persistEquippedField(character.id, field, null);
  return { ...character, [field]: undefined };
}

export async function listEquipmentInstances(characterId: string): Promise<EquipmentInstance[]> {
  const rows = await prisma.characterEquipmentInstance.findMany({ where: { characterId } });
  return rows.map(toSharedEquipmentInstance);
}

// Battle needs the resolved instances behind whichever ids are currently equipped, to
// compute effective stats without a DB round-trip mid-battle.
export async function getEquippedInstances(character: Character): Promise<EquipmentInstance[]> {
  const equippedIds = [character.equippedWeaponId, character.equippedArmorId, character.equippedAccessoryId].filter(
    (id): id is string => Boolean(id),
  );
  if (equippedIds.length === 0) return [];

  const rows = await prisma.characterEquipmentInstance.findMany({
    where: { id: { in: equippedIds }, characterId: character.id },
  });
  return rows.map(toSharedEquipmentInstance);
}

async function persistEquippedField(characterId: string, field: EquippedIdField, value: string | null): Promise<void> {
  await prisma.character.update({
    where: { id: characterId },
    data: { [field]: value },
  });
}

type EquipmentInstanceRow = {
  id: string;
  characterId: string;
  catalogItemId: string;
  enhancementLevel: number;
  acquiredVia: string;
  purchasedDate: string | null;
  createdAt: Date;
};

function toSharedEquipmentInstance(row: EquipmentInstanceRow): EquipmentInstance {
  return {
    id: row.id,
    characterId: row.characterId,
    catalogItemId: row.catalogItemId,
    enhancementLevel: row.enhancementLevel,
    acquiredVia: row.acquiredVia as EquipmentAcquisitionSource,
    purchasedDate: row.purchasedDate ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}
