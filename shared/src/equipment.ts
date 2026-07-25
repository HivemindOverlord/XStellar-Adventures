import type { Character, Stats } from "./character.js";

export type EquipmentSlot = "weapon" | "armor" | "accessory";

// Ascending power order: white < green < blue < purple < orange < red.
export type Rarity = "white" | "green" | "blue" | "purple" | "orange" | "red";

export interface EquipmentItem {
  id: string;
  name: string;
  slot: EquipmentSlot;
  rarity: Rarity;
  classLock?: Character["jobClass"];
  statBonuses: Partial<Stats>;
}

const EQUIPPED_ID_FIELD: Record<EquipmentSlot, "equippedWeaponId" | "equippedArmorId" | "equippedAccessoryId"> = {
  weapon: "equippedWeaponId",
  armor: "equippedArmorId",
  accessory: "equippedAccessoryId",
};

export function equippedIdForSlot(character: Character, slot: EquipmentSlot): string | undefined {
  return character[EQUIPPED_ID_FIELD[slot]];
}

export function computeEffectiveStats(
  character: Character,
  equipmentCatalog: Record<string, EquipmentItem>,
): Stats {
  const effective: Stats = { ...character.stats };

  for (const slot of Object.keys(EQUIPPED_ID_FIELD) as EquipmentSlot[]) {
    const equippedId = equippedIdForSlot(character, slot);
    const item = equippedId ? equipmentCatalog[equippedId] : undefined;
    if (!item) continue;

    for (const [stat, bonus] of Object.entries(item.statBonuses) as [keyof Stats, number][]) {
      effective[stat] += bonus;
    }
  }

  return effective;
}
