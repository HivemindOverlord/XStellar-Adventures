import type { Character } from "./character.js";
import type { XpGainResult } from "./battle.js";

export function xpToNextLevel(level: number): number {
  return Math.round(20 * level ** 1.6);
}

// Level-ups grant a player-directed stat point instead of auto-growing stats — see
// allocateStatPoint (server/src/game/statAllocation.ts) for how points get spent.
export function applyXp(character: Character, amount: number): XpGainResult {
  character.xp += amount;
  let leveledUp = false;

  while (character.xp >= xpToNextLevel(character.level)) {
    character.xp -= xpToNextLevel(character.level);
    character.level += 1;
    leveledUp = true;
    character.unallocatedStatPoints += 1;
  }

  return { xpGained: amount, leveledUp, newLevel: character.level };
}
