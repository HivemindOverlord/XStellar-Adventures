import type { Character, EquipmentInstance, Stats } from "@xstellar/shared";
import { computeEffectiveStats, EQUIPMENT } from "@xstellar/shared";

// Tunable starting formula for matchmaking fairness — NOT final PvP balance. Level is
// weighted heavily since it's the strongest signal for how far into progression a character
// is; the four core stats count at full weight; HP/MP pools count at a tenth of their value
// since raw health/mana swings a fight less decisively than attack/defense/magic/speed do.
// Adjust freely once real matchmaking data suggests a better shape.
export function computePowerScore(character: Pick<Character, "level">, effectiveStats: Stats): number {
  const { attack, defense, magic, speed, maxHp, maxMp } = effectiveStats;
  return character.level * 10 + (attack + defense + magic + speed) + (maxHp + maxMp) / 10;
}

// Convenience wrapper that resolves equipped-gear bonuses (if any) before scoring, so callers
// don't need to import computeEffectiveStats/EQUIPMENT themselves.
export function computeEffectivePowerScore(character: Character, equipmentInstances: EquipmentInstance[]): number {
  return computePowerScore(character, computeEffectiveStats(character, EQUIPMENT, equipmentInstances));
}
