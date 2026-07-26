import type { Character, JobClass, Stats } from "./character.js";

export type EquipmentSlot = "weapon" | "armor" | "accessory";

// Ascending power order: white < green < blue < purple < orange < red.
export type Rarity = "white" | "green" | "blue" | "purple" | "orange" | "red";

export interface EquipmentItem {
  id: string;
  name: string;
  slot: EquipmentSlot;
  rarity: Rarity;
  classLock?: JobClass;
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

// One tracked, ownable copy of a catalog item. enhancementLevel is reserved for a future
// Enhancement/Fusion phase — it exists on the record but has no effect on stats yet.
// purchasedDate (UTC "YYYY-MM-DD", set only when acquiredVia is "shop") is what the Shop
// system uses for same-day refund eligibility, in place of a separate tracking map.
export type EquipmentAcquisitionSource = "loot" | "shop";

export interface EquipmentInstance {
  id: string;
  characterId: string;
  catalogItemId: string;
  enhancementLevel: number;
  acquiredVia: EquipmentAcquisitionSource;
  purchasedDate?: string;
  createdAt: string;
}

// equippedWeaponId/equippedArmorId/equippedAccessoryId on Character hold a
// CharacterEquipmentInstance id, not a catalog item id — resolve through `instances` to
// reach the EquipmentItem catalog entry for stat bonuses.
export function computeEffectiveStats(
  character: Character,
  equipmentCatalog: Record<string, EquipmentItem>,
  instances: EquipmentInstance[],
): Stats {
  const instanceById = new Map(instances.map((instance) => [instance.id, instance]));
  const effective: Stats = { ...character.stats };

  for (const slot of Object.keys(EQUIPPED_ID_FIELD) as EquipmentSlot[]) {
    const equippedInstanceId = equippedIdForSlot(character, slot);
    const instance = equippedInstanceId ? instanceById.get(equippedInstanceId) : undefined;
    const item = instance ? equipmentCatalog[instance.catalogItemId] : undefined;
    if (!item) continue;

    for (const [stat, bonus] of Object.entries(item.statBonuses) as [keyof Stats, number][]) {
      effective[stat] += bonus;
    }
  }

  return effective;
}
