import { randomUUID } from "node:crypto";
import type { Character, JobClass, Stats } from "@xstellar/shared";
import { computePowerScore, skillIdsForClasses, STARTER_INVENTORY } from "@xstellar/shared";

const JOB_CLASSES: JobClass[] = ["warrior", "mage", "cleric", "rogue"];

// Bot toughness is anchored to the waiting player's own power score (shared/src/matchmaking.ts)
// rather than a fixed multiplier, so a bot synthesized for a low-power player and one
// synthesized for a high-power player are both roughly fair fights. A small random jitter
// keeps bots from being exact stat-for-stat mirrors of the player.
const JITTER_MIN = 0.95;
const JITTER_MAX = 1.1;

export const BOT_OWNER_ID_PREFIX = "bot:";

export function isBotCharacter(character: Pick<Character, "ownerId">): boolean {
  return character.ownerId.startsWith(BOT_OWNER_ID_PREFIX);
}

// Builds a synthetic in-memory Combatant-ready Character (never persisted) whose power score
// roughly matches targetPowerScore, by scaling the waiting player's own base stats. Mirrors
// how the Story & PvE Campaign agent builds boss Combatants from its chapter catalog, just
// without a catalog entry since PvP bots aren't hand-authored content.
export function createBotOpponent(player: Character, targetPowerScore: number): Character {
  const jobClass = JOB_CLASSES[Math.floor(Math.random() * JOB_CLASSES.length)];
  const level = player.level;
  const jitter = JITTER_MIN + Math.random() * (JITTER_MAX - JITTER_MIN);

  const baseStatBudget = computePowerScore(level, player.stats) - level * 10;
  const targetStatBudget = Math.max(1, (targetPowerScore - level * 10) * jitter);
  const multiplier = baseStatBudget > 0 ? targetStatBudget / baseStatBudget : 1;

  return {
    id: randomUUID(),
    ownerId: `${BOT_OWNER_ID_PREFIX}${randomUUID()}`,
    name: `${capitalize(jobClass)} Sparring Bot`,
    jobClass,
    level,
    xp: 0,
    unallocatedStatPoints: 0,
    unlockedClasses: [jobClass],
    completedChapterIds: [],
    campaignBossMemory: {},
    currentWinStreak: 0,
    allowBotMatches: true,
    dryStreakWeapon: 0,
    dryStreakArmor: 0,
    dryStreakAccessory: 0,
    currency: 0,
    purchasesToday: {},
    spriteKey: `hero_${jobClass}`,
    skillIds: skillIdsForClasses([jobClass]),
    inventory: { ...STARTER_INVENTORY },
    stats: scaleStats(player.stats, multiplier),
  };
}

function scaleStats(stats: Stats, multiplier: number): Stats {
  const scale = (value: number) => Math.max(1, Math.round(value * multiplier));
  return {
    maxHp: scale(stats.maxHp),
    hp: scale(stats.maxHp),
    maxMp: scale(stats.maxMp),
    mp: scale(stats.maxMp),
    attack: scale(stats.attack),
    defense: scale(stats.defense),
    magic: scale(stats.magic),
    speed: scale(stats.speed),
  };
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
