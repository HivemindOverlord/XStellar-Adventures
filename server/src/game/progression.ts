import type { BattleReward, BattleState, Character, EquipmentItem, EquipmentSlot, Rarity } from "@xstellar/shared";
import { applyXp, EQUIPMENT } from "@xstellar/shared";

function xpForVictory(opponentLevel: number): number {
  return 30 + opponentLevel * 10;
}

function xpForDefeat(opponentLevel: number): number {
  return 10 + opponentLevel * 3;
}

function xpForOpponentFled(opponentLevel: number): number {
  return 20 + opponentLevel * 6;
}

function xpForFleeing(): number {
  return 5;
}

const WIN_STREAK_CAP = 20;

function driftmetalForVictory(opponentLevel: number, winStreak: number): number {
  return 20 + opponentLevel * 8 + Math.min(winStreak, WIN_STREAK_CAP) * 4;
}

function driftmetalForDefeat(opponentLevel: number): number {
  return 5 + opponentLevel * 2;
}

const EQUIPMENT_SLOTS: EquipmentSlot[] = ["weapon", "armor", "accessory"];
const DRY_STREAK_FIELD: Record<EquipmentSlot, "dryStreakWeapon" | "dryStreakArmor" | "dryStreakAccessory"> = {
  weapon: "dryStreakWeapon",
  armor: "dryStreakArmor",
  accessory: "dryStreakAccessory",
};

const BASE_DROP_CHANCE = 0.12;
const DRY_STREAK_PITY_STEP = 0.03;
const MAX_DROP_CHANCE = 0.6;

const RARITY_ORDER: Rarity[] = ["white", "green", "blue", "purple", "orange", "red"];
const BASE_RARITY_WEIGHT: Record<Rarity, number> = {
  white: 100,
  green: 35,
  blue: 12,
  purple: 4,
  orange: 1,
  red: 0.15,
};

// Higher opponent level and win streak shift weight toward the rarer tiers,
// mirroring the same scaling knobs used for Driftmetal and XP above.
function rarityWeight(rarity: Rarity, opponentLevel: number, winStreak: number): number {
  const tierIndex = RARITY_ORDER.indexOf(rarity);
  const scale = 1 + opponentLevel * 0.04 + Math.min(winStreak, WIN_STREAK_CAP) * 0.03;
  return BASE_RARITY_WEIGHT[rarity] * scale ** tierIndex;
}

function weightedPick<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1];
}

function pickEquipmentDrop(character: Character, slot: EquipmentSlot, opponentLevel: number): EquipmentItem | undefined {
  const candidates = Object.values(EQUIPMENT).filter(
    (item) => item.slot === slot && (!item.classLock || item.classLock === character.jobClass),
  );
  if (candidates.length === 0) return undefined;

  const weights = candidates.map((item) => rarityWeight(item.rarity, opponentLevel, character.currentWinStreak));
  return weightedPick(candidates, weights);
}

// Rolls one loot chance per equipment slot for the winner. Dry streaks act as a
// pity counter: the longer a slot goes without a drop, the more likely the next
// battle grants one; a successful drop resets that slot's counter to zero.
function rollItemDrops(character: Character, opponentLevel: number): string[] {
  const dropped: string[] = [];

  for (const slot of EQUIPMENT_SLOTS) {
    const field = DRY_STREAK_FIELD[slot];
    const chance = Math.min(BASE_DROP_CHANCE + character[field] * DRY_STREAK_PITY_STEP, MAX_DROP_CHANCE);

    if (Math.random() < chance) {
      const item = pickEquipmentDrop(character, slot, opponentLevel);
      if (item) {
        character.inventory[item.id] = (character.inventory[item.id] ?? 0) + 1;
        character[field] = 0;
        dropped.push(item.id);
        continue;
      }
    }

    character[field] += 1;
  }

  return dropped;
}

export function grantBattleRewards(state: BattleState): Record<string, BattleReward> {
  const rewards: Record<string, BattleReward> = {};

  if (state.phase === "victory" || state.phase === "defeat") {
    const partyWon = state.phase === "victory";
    for (const c of state.combatants) {
      const opponent = state.combatants.find((o) => o.id !== c.id);
      const opponentLevel = opponent?.character.level ?? 1;
      const won = (c.side === "party") === partyWon;

      const xpAmount = won ? xpForVictory(opponentLevel) : xpForDefeat(opponentLevel);
      const currencyAmount = won
        ? driftmetalForVictory(opponentLevel, c.character.currentWinStreak)
        : driftmetalForDefeat(opponentLevel);
      const itemsDropped = won ? rollItemDrops(c.character, opponentLevel) : [];

      const xpReward = applyXp(c.character, xpAmount);
      c.character.currency += currencyAmount;
      c.character.currentWinStreak = won ? c.character.currentWinStreak + 1 : 0;

      rewards[c.id] = { ...xpReward, currencyGained: currencyAmount, itemsDropped };
    }
  } else if (state.phase === "fled") {
    const fledId = state.log[state.log.length - 1]?.actorId;
    for (const c of state.combatants) {
      const opponent = state.combatants.find((o) => o.id !== c.id);
      const opponentLevel = opponent?.character.level ?? 1;
      const amount = c.id === fledId ? xpForFleeing() : xpForOpponentFled(opponentLevel);
      const xpReward = applyXp(c.character, amount);
      rewards[c.id] = { ...xpReward, currencyGained: 0, itemsDropped: [] };
    }
  }

  return rewards;
}
