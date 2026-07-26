import type { Stats } from "./character.js";

// PvP power score, shared by server/src/game/matchmaking.ts (bracket matching) and
// server/src/game/botCharacter.ts (scaling a synthetic bot to a waiting player).
//
// TUNABLE STARTING FORMULA — not final PvP balance. Level is weighted heavily as the
// strongest single signal of readiness; the four combat stats are summed at face value;
// HP/MP pools are folded in at 1/10th weight since they run much larger than the other
// stats. `stats` should be the character's EFFECTIVE stats (base + equipped gear bonuses,
// see computeEffectiveStats in ./equipment.js) so equipment quality factors into fairness.
// Revisit the weights once real PvP match data exists.
export function computePowerScore(level: number, stats: Stats): number {
  return level * 10 + (stats.attack + stats.defense + stats.magic + stats.speed) + (stats.maxHp + stats.maxMp) / 10;
}
