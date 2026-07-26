import type { Character } from "./character.js";
import type { EquipmentItem, Rarity } from "./equipment.js";

// Steep per-tier curve: roughly 5x the previous tier, so Red sits well out of
// reach in early gameplay while White stays approachable.
export const EQUIPMENT_PRICE_BY_RARITY: Record<Rarity, number> = {
  white: 50,
  green: 250,
  blue: 1250,
  purple: 6250,
  orange: 31250,
  red: 156250,
};

// Consumables have no rarity tier to scale from, so prices are flat and curated.
export const CONSUMABLE_PRICES: Record<string, number> = {
  willows_tonic: 40,
  quix_ember: 30,
  bruces_whetstone: 20,
};

export function priceOfEquipment(item: EquipmentItem): number {
  return EQUIPMENT_PRICE_BY_RARITY[item.rarity];
}

export function priceOfConsumable(itemId: string): number | undefined {
  return CONSUMABLE_PRICES[itemId];
}

// 1 Red, 2 Orange, 4 Purple, 8 Blue, 16 Green, 32 White = 63 rotation slots/day.
export const EQUIPMENT_ROTATION_TIER_TARGETS: Record<Rarity, number> = {
  red: 1,
  orange: 2,
  purple: 4,
  blue: 8,
  green: 16,
  white: 32,
};

export function getUtcDateString(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export interface ShopCatalogEntry {
  itemId: string;
  price: number;
}

export interface ShopCatalog {
  rotationDate: string;
  generalGoods: ShopCatalogEntry[];
  equipmentRotation: ShopCatalogEntry[];
}

export interface ShopStateResponse {
  catalog: ShopCatalog;
  currency: number;
  // itemId -> units still eligible for a 100%-refund sell-back today.
  refundEligible: Record<string, number>;
}

export interface ShopBuyRequestBody {
  itemId: string;
  quantity: number;
}

export interface ShopSellLine {
  itemId: string;
  quantity: number;
}

export interface ShopSellRequestBody {
  items: ShopSellLine[];
}

export interface ShopSellResponse {
  character: Character;
  currencyGained: number;
}
