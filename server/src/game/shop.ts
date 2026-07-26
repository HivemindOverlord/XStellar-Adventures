import type { Character, Rarity, ShopCatalog, ShopSellLine } from "@xstellar/shared";
import {
  EQUIPMENT,
  EQUIPMENT_ROTATION_TIER_TARGETS,
  getUtcDateString,
  ITEMS,
  priceOfConsumable,
  priceOfEquipment,
} from "@xstellar/shared";
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

  ensureFreshPurchaseWindow(character, today);

  character.currency -= totalCost;
  character.inventory[itemId] = (character.inventory[itemId] ?? 0) + quantity;
  character.purchasesToday[itemId] = (character.purchasesToday[itemId] ?? 0) + quantity;

  await persistCharacterProgress(character);
}

// Sell-back rule per unit: today's purchases refund at 100% of catalog price
// first (consuming that day's purchasesToday count), then any remaining units
// — older stock or loot drops, which never have a purchasesToday entry — sell
// at 20%. Validates the whole batch before mutating anything so a bad line
// rejects the entire call instead of partially applying.
export async function sellItems(character: Character, lines: ShopSellLine[]): Promise<number> {
  for (const line of lines) {
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

  const today = getUtcDateString();
  ensureFreshPurchaseWindow(character, today);

  let currencyGained = 0;
  for (const line of lines) {
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

  character.currency += currencyGained;
  await persistCharacterProgress(character);
  return currencyGained;
}
