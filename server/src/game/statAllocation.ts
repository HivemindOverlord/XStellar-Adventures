import type { Character, JobClass, Stats } from "@xstellar/shared";

export type AllocatableStat = "maxHp" | "maxMp" | "attack" | "defense" | "magic" | "speed";

// Per-point magnitudes match the old auto-growStats() increments, just spent one stat
// at a time by the player instead of applied to every stat on every level.
const STAT_POINT_VALUE: Record<AllocatableStat, number> = {
  maxHp: 8,
  maxMp: 3,
  attack: 2,
  defense: 2,
  magic: 2,
  speed: 1,
};

// Starting values, not final balance — tune later. A character can cross multiple
// thresholds over time and hold several unlocked classes simultaneously; that's
// intentional, not a bug.
const CLASS_UNLOCK_THRESHOLDS: Array<{ jobClass: JobClass; isMet: (stats: Stats) => boolean }> = [
  { jobClass: "warrior", isMet: (stats) => stats.attack + stats.defense >= 30 },
  { jobClass: "rogue", isMet: (stats) => stats.attack + stats.speed >= 28 },
  { jobClass: "mage", isMet: (stats) => stats.magic >= 20 },
  { jobClass: "cleric", isMet: (stats) => stats.magic + stats.maxHp >= 90 },
];

export class StatAllocationError extends Error {}

export function allocateStatPoint(character: Character, stat: AllocatableStat): Character {
  if (character.unallocatedStatPoints <= 0) {
    throw new StatAllocationError("No stat points available to allocate");
  }

  character.unallocatedStatPoints -= 1;
  character.stats[stat] += STAT_POINT_VALUE[stat];

  applyClassUnlocks(character);

  return character;
}

function applyClassUnlocks(character: Character): void {
  for (const threshold of CLASS_UNLOCK_THRESHOLDS) {
    if (character.unlockedClasses.includes(threshold.jobClass)) continue;
    if (!threshold.isMet(character.stats)) continue;

    character.unlockedClasses = [...character.unlockedClasses, threshold.jobClass];
    if (!character.jobClass) character.jobClass = threshold.jobClass;
  }
}
