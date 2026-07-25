import type { Character, EquipmentSlot } from "@xstellar/shared";
import { EQUIPMENT } from "@xstellar/shared";
import { prisma } from "../db/prisma.js";

export class EquipError extends Error {}

type EquippedIdField = "equippedWeaponId" | "equippedArmorId" | "equippedAccessoryId";

const EQUIPPED_ID_FIELD: Record<EquipmentSlot, EquippedIdField> = {
  weapon: "equippedWeaponId",
  armor: "equippedArmorId",
  accessory: "equippedAccessoryId",
};

export async function equipItem(character: Character, itemId: string): Promise<Character> {
  const item = EQUIPMENT[itemId];
  if (!item) {
    throw new EquipError("Unknown equipment item");
  }
  if ((character.inventory[itemId] ?? 0) < 1) {
    throw new EquipError("You don't own that item");
  }
  if (item.classLock && item.classLock !== character.jobClass) {
    throw new EquipError(`${item.name} can only be equipped by a ${item.classLock}`);
  }

  const field = EQUIPPED_ID_FIELD[item.slot];
  await persistEquippedField(character.id, field, item.id);
  return { ...character, [field]: item.id };
}

export async function unequipSlot(character: Character, slot: EquipmentSlot): Promise<Character> {
  const field = EQUIPPED_ID_FIELD[slot];
  await persistEquippedField(character.id, field, null);
  return { ...character, [field]: undefined };
}

async function persistEquippedField(characterId: string, field: EquippedIdField, value: string | null): Promise<void> {
  await prisma.character.update({
    where: { id: characterId },
    data: { [field]: value },
  });
}
