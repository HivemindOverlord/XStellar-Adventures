import type { Character } from "./character.js";
import { EQUIPMENT } from "./content.js";
import type { EquipmentItem, EquipmentSlot, Rarity } from "./equipment.js";

// These are the exact knobs server/src/game/progression.ts's rollItemDrops resolves a real
// drop with. Keeping them here (rather than duplicated in progression.ts) is what lets the
// live odds preview and the real roll share one computation — tune a number here and both
// move together, instead of the preview silently drifting out of sync.
export const EQUIPMENT_DROP_SLOTS: EquipmentSlot[] = ["weapon", "armor", "accessory"];

export const DRY_STREAK_FIELD: Record<EquipmentSlot, "dryStreakWeapon" | "dryStreakArmor" | "dryStreakAccessory"> = {
  weapon: "dryStreakWeapon",
  armor: "dryStreakArmor",
  accessory: "dryStreakAccessory",
};

export const BASE_DROP_CHANCE = 0.12;
export const DRY_STREAK_PITY_STEP = 0.03;
export const MAX_DROP_CHANCE = 0.6;

export const WIN_STREAK_CAP = 20;

export const RARITY_ORDER: Rarity[] = ["white", "green", "blue", "purple", "orange", "red"];
export const BASE_RARITY_WEIGHT: Record<Rarity, number> = {
  white: 100,
  green: 35,
  blue: 12,
  purple: 4,
  orange: 1,
  red: 0.15,
};

// Higher opponent level and win streak shift weight toward the rarer tiers.
export function rarityWeight(rarity: Rarity, opponentLevel: number, winStreak: number): number {
  const tierIndex = RARITY_ORDER.indexOf(rarity);
  const scale = 1 + opponentLevel * 0.04 + Math.min(winStreak, WIN_STREAK_CAP) * 0.03;
  return BASE_RARITY_WEIGHT[rarity] * scale ** tierIndex;
}

export interface LootDropOddsFactors {
  dryStreakFights: number;
  dryStreakBonus: number; // additional dropChance contributed by the pity counter, already folded into dropChance
  winStreak: number;
  winStreakCapped: number; // the value actually used in the calc, after WIN_STREAK_CAP
  opponentLevel: number;
}

export interface LootDropOdds {
  category: EquipmentSlot;
  // Probability that *anything* drops in this category this fight.
  dropChance: number;
  // Unconditional probability of landing exactly at each tier this fight — these six
  // numbers sum to dropChance (the remainder, 1 - dropChance, is "nothing dropped").
  tierProbabilities: Record<Rarity, number>;
  factors: LootDropOddsFactors;
}

// Carries the per-item weights alongside the public odds so a real roll can pick a concrete
// item using the *exact* same weights the preview was computed from, rather than recomputing
// them a second time (the thing that would let preview and resolution drift apart).
export interface ResolvableLootDropOdds extends LootDropOdds {
  candidates: { item: EquipmentItem; weight: number }[];
}

export function computeEquipmentDropOdds(
  character: Character,
  category: EquipmentSlot,
  opponentLevel: number,
): ResolvableLootDropOdds {
  const dryStreakFights = character[DRY_STREAK_FIELD[category]];
  const dryStreakBonus = Math.min(dryStreakFights * DRY_STREAK_PITY_STEP, MAX_DROP_CHANCE - BASE_DROP_CHANCE);
  const dropChance = Math.min(BASE_DROP_CHANCE + dryStreakFights * DRY_STREAK_PITY_STEP, MAX_DROP_CHANCE);
  const winStreakCapped = Math.min(character.currentWinStreak, WIN_STREAK_CAP);

  const candidates = Object.values(EQUIPMENT)
    .filter((item) => item.slot === category && (!item.classLock || character.unlockedClasses.includes(item.classLock)))
    .map((item) => ({ item, weight: rarityWeight(item.rarity, opponentLevel, character.currentWinStreak) }));
  const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);

  const tierProbabilities = RARITY_ORDER.reduce<Record<Rarity, number>>(
    (acc, rarity) => {
      const tierWeight = candidates.filter((c) => c.item.rarity === rarity).reduce((sum, c) => sum + c.weight, 0);
      acc[rarity] = totalWeight > 0 ? dropChance * (tierWeight / totalWeight) : 0;
      return acc;
    },
    { white: 0, green: 0, blue: 0, purple: 0, orange: 0, red: 0 },
  );

  return {
    category,
    dropChance,
    tierProbabilities,
    factors: { dryStreakFights, dryStreakBonus, winStreak: character.currentWinStreak, winStreakCapped, opponentLevel },
    candidates,
  };
}

export function pickFromDropOdds(odds: ResolvableLootDropOdds): EquipmentItem | undefined {
  if (odds.candidates.length === 0) return undefined;
  const total = odds.candidates.reduce((sum, c) => sum + c.weight, 0);
  let roll = Math.random() * total;
  for (const c of odds.candidates) {
    roll -= c.weight;
    if (roll <= 0) return c.item;
  }
  return odds.candidates[odds.candidates.length - 1].item;
}

// Consumables have no live drop mechanic in the current build — rollItemDrops (in
// server/src/game/progression.ts) never rolls this category. It's still listed in the
// /api/loot/odds response (zeroed out, available: false) so the client's odds panel can
// show all four categories honestly rather than silently omitting one, per the project's
// full-transparency requirement.
export type LootOddsCategory = EquipmentSlot | "consumable";

export interface LootOddsResponseEntry {
  category: LootOddsCategory;
  available: boolean;
  dropChance: number;
  tierProbabilities: Record<Rarity, number>;
  factors: LootDropOddsFactors | null;
  note?: string;
}

export interface LootOddsResponse {
  opponentLevel: number;
  // true when no specific opponent was known yet (e.g. previewing before matchmaking) and a
  // same-level opponent was assumed instead of a real one.
  opponentLevelIsAssumed: boolean;
  categories: LootOddsResponseEntry[];
}
