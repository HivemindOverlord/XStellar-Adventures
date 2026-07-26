import type {
  Character,
  Rarity,
  ShopCatalog,
  ShopEquipmentInstanceView,
  ShopSellConsumableLine,
  ShopSellEquipmentLine,
} from "@xstellar/shared";
import {
  EQUIPMENT,
  EQUIPMENT_ROTATION_TIER_TARGETS,
  getUtcDateString,
  ITEMS,
  priceOfConsumable,
  priceOfEquipment,
} from "@xstellar/shared";
import { prisma } from "../db/prisma.js";
import { listEquipmentInstances } from "./equipment.js";
import { persistCharacterProgress } from "./starterCharacter.js";

export class ShopError extends Error {}

function stringSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleDeterministic<T>(items: T[], rng: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Deterministic per UTC calendar day and identical for every player: seeded
// purely from the date string, so no "current rotation" DB table is needed.
// If a tier doesn't have enough distinct catalog entries, it fills with
// whatever is available instead of erroring or repeating items.
export function getEquipmentRotationIds(dateString: string): string[] {
  const byRarity = new Map<Rarity, string[]>();
  for (const item of Object.values(EQUIPMENT)) {
    const list = byRarity.get(item.rarity) ?? [];
    list.push(item.id);
    byRarity.set(item.rarity, list);
  }

  const rotation: string[] = [];
  for (const rarity of Object.keys(EQUIPMENT_ROTATION_TIER_TARGETS) as Rarity[]) {
    const target = EQUIPMENT_ROTATION_TIER_TARGETS[rarity];
    const pool = byRarity.get(rarity) ?? [];
    const rng = mulberry32(stringSeed(`${dateString}:${rarity}`));
    const shuffled = shuffleDeterministic(pool, rng);
    rotation.push(...shuffled.slice(0, target));
  }
  return rotation;
}

export function priceOf(itemId: string): number | undefined {
  const equipment = EQUIPMENT[itemId];
  if (equipment) return priceOfEquipment(equipment);
  return priceOfConsumable(itemId);
}

export function isItemInTodaysShop(itemId: string, today: string = getUtcDateString()): boolean {
  return ITEMS[itemId] !== undefined || getEquipmentRotationIds(today).includes(itemId);
}

export function getShopCatalog(dateString: string = getUtcDateString()): ShopCatalog {
  const generalGoods = Object.keys(ITEMS).map((itemId) => ({ itemId, price: priceOfConsumable(itemId) ?? 0 }));
  const equipmentRotation = getEquipmentRotationIds(dateString).map((itemId) => ({
    itemId,
    price: priceOfEquipment(EQUIPMENT[itemId]),
  }));
  return { rotationDate: dateString, generalGoods, equipmentRotation };
}

export function refundEligibility(character: Character, today: string = getUtcDateString()): Record<string, number> {
  return character.purchasesTodayDate === today ? { ...character.purchasesToday } : {};
}

function equipmentSellValue(
  instance: { catalogItemId: string; acquiredVia: string; purchasedDate?: string },
  today: string,
): { sellValue: number; fullRefundEligible: boolean } {
  const item = EQUIPMENT[instance.catalogItemId];
  const price = item ? priceOfEquipment(item) : 0;
  const fullRefundEligible = instance.acquiredVia === "shop" && instance.purchasedDate === today;
  return { sellValue: fullRefundEligible ? price : Math.floor(price * 0.2), fullRefundEligible };
}

export async function getOwnedEquipmentInstanceViews(
  characterId: string,
  today: string = getUtcDateString(),
): Promise<ShopEquipmentInstanceView[]> {
  const instances = await listEquipmentInstances(characterId);
  return instances.map((instance) => {
    const { sellValue, fullRefundEligible } = equipmentSellValue(instance, today);
    return {
      id: instance.id,
      catalogItemId: instance.catalogItemId,
      enhancementLevel: instance.enhancementLevel,
      acquiredVia: instance.acquiredVia,
      purchasedDate: instance.purchasedDate,
      sellValue,
      fullRefundEligible,
    };
  });
}

function ensureFreshPurchaseWindow(character: Character, today: string): void {
  if (character.purchasesTodayDate !== today) {
    character.purchasesToday = {};
    character.purchasesTodayDate = today;
  }
}

export async function buyItem(character: Character, itemId: string, quantity: number): Promise<void> {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new ShopError("Quantity must be a positive integer");
  }

  const today = getUtcDateString();
  if (!isItemInTodaysShop(itemId, today)) {
    throw new ShopError("That item is not currently available in the shop");
  }

  const price = priceOf(itemId);
  if (price === undefined) {
    throw new ShopError("Unknown item");
  }

  const totalCost = price * quantity;
  if (character.currency < totalCost) {
    throw new ShopError("Not enough Driftmetal");
  }

  character.currency -= totalCost;

  if (EQUIPMENT[itemId]) {
    // Equipment ownership lives in CharacterEquipmentInstance rows, not inventory counts —
    // each purchased unit becomes its own row so it can later be sold, equipped, or enhanced
    // independently. purchasedDate (not the character-level purchasesToday map) is what the
    // sell flow uses to decide same-day full-refund eligibility for these.
    await prisma.characterEquipmentInstance.createMany({
      data: Array.from({ length: quantity }, () => ({
        characterId: character.id,
        catalogItemId: itemId,
        acquiredVia: "shop",
        purchasedDate: today,
      })),
    });
  } else {
    ensureFreshPurchaseWindow(character, today);
    character.inventory[itemId] = (character.inventory[itemId] ?? 0) + quantity;
    character.purchasesToday[itemId] = (character.purchasesToday[itemId] ?? 0) + quantity;
  }

  await persistCharacterProgress(character);
}

// Sell-back rule per unit: today's purchases refund at 100% of catalog price, older/looted
// stock sells at 20%. Consumables track eligibility via the character-level purchasesToday
// map (keyed by itemId+quantity); equipment tracks it per CharacterEquipmentInstance row
// (acquiredVia/purchasedDate), since each unit is now its own sellable row. Validates the
// whole batch — both halves — before mutating anything, so a bad line in either list rejects
// the entire call instead of partially applying.
export async function sellItems(
  character: Character,
  request: { consumables: ShopSellConsumableLine[]; equipment: ShopSellEquipmentLine[] },
): Promise<number> {
  const { consumables, equipment } = request;

  for (const line of consumables) {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new ShopError(`Invalid quantity for ${line.itemId}`);
    }
    if (priceOf(line.itemId) === undefined) {
      throw new ShopError(`Unknown item ${line.itemId}`);
    }
    if ((character.inventory[line.itemId] ?? 0) < line.quantity) {
      throw new ShopError(`You don't own ${line.quantity} of that item`);
    }
  }

  const instanceIds = equipment.map((line) => line.instanceId);
  if (new Set(instanceIds).size !== instanceIds.length) {
    throw new ShopError("Duplicate equipment instance in sell request");
  }

  const ownedInstances = instanceIds.length ? await listEquipmentInstances(character.id) : [];
  const ownedInstanceById = new Map(ownedInstances.map((instance) => [instance.id, instance]));
  for (const instanceId of instanceIds) {
    if (!ownedInstanceById.has(instanceId)) {
      throw new ShopError("You don't own that equipment");
    }
  }

  const today = getUtcDateString();
  ensureFreshPurchaseWindow(character, today);

  let currencyGained = 0;

  for (const line of consumables) {
    const price = priceOf(line.itemId) as number;

    const refundEligibleUnits = character.purchasesToday[line.itemId] ?? 0;
    const fullRefundUnits = Math.min(line.quantity, refundEligibleUnits);
    const discountedUnits = line.quantity - fullRefundUnits;

    currencyGained += fullRefundUnits * price + Math.floor(discountedUnits * price * 0.2);
    character.purchasesToday[line.itemId] = refundEligibleUnits - fullRefundUnits;

    character.inventory[line.itemId] -= line.quantity;
    if (character.inventory[line.itemId] <= 0) {
      delete character.inventory[line.itemId];
    }
  }

  for (const instanceId of instanceIds) {
    const instance = ownedInstanceById.get(instanceId);
    if (!instance) continue;
    currencyGained += equipmentSellValue(instance, today).sellValue;

    if (character.equippedWeaponId === instanceId) character.equippedWeaponId = undefined;
    if (character.equippedArmorId === instanceId) character.equippedArmorId = undefined;
    if (character.equippedAccessoryId === instanceId) character.equippedAccessoryId = undefined;
  }

  if (instanceIds.length > 0) {
    await prisma.characterEquipmentInstance.deleteMany({
      where: { id: { in: instanceIds }, characterId: character.id },
    });
  }

  character.currency += currencyGained;
  await persistCharacterProgress(character);
  return currencyGained;
}
