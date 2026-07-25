import type { Character, Stats } from "./character.js";
import type { BattleReward } from "./battle.js";

export function xpToNextLevel(level: number): number {
  return Math.round(20 * level ** 1.6);
}

export function applyXp(character: Character, amount: number): BattleReward {
  character.xp += amount;
  let leveledUp = false;

  while (character.xp >= xpToNextLevel(character.level)) {
    character.xp -= xpToNextLevel(character.level);
    character.level += 1;
    leveledUp = true;
    growStats(character.stats);
  }

  return { xpGained: amount, leveledUp, newLevel: character.level };
}

function growStats(stats: Stats): void {
  stats.maxHp += 8;
  stats.maxMp += 3;
  stats.attack += 2;
  stats.defense += 2;
  stats.magic += 2;
  stats.speed += 1;
}
