import { randomUUID } from "node:crypto";
import type { Character, JobClass, Stats } from "@xstellar/shared";
import { skillIdsForClasses, STARTER_INVENTORY } from "@xstellar/shared";

const JOB_CLASSES: JobClass[] = ["warrior", "mage", "cleric", "rogue"];

// Tunable knobs for bot toughness — matchmaking fairness is the goal here, not a deliberately
// hard boss: the bot's stats are scaled off the waiting player's own EFFECTIVE stats (base +
// equipped gear), centered on roughly matching their power score, with a small streak-based
// edge on top so repeat winners keep facing a slightly tougher fallback opponent.
const BASE_MULTIPLIER_MIN = 1.0;
const BASE_MULTIPLIER_MAX = 1.1;
const STREAK_MULTIPLIER_STEP = 0.02;
const STREAK_MULTIPLIER_CAP_STREAK = 15;
const MAX_MULTIPLIER = 1.4;
const MIN_BONUS_LEVELS = 1;
const MAX_BONUS_LEVELS = 3;

export const BOT_OWNER_ID_PREFIX = "bot:";

export function isBotCharacter(character: Pick<Character, "ownerId">): boolean {
  return character.ownerId.startsWith(BOT_OWNER_ID_PREFIX);
}

// playerEffectiveStats should already include the waiting player's equipped-gear bonuses
// (see computeEffectiveStats) so a heavily-geared player doesn't get an easy bot.
export function createBotOpponent(player: Character, playerEffectiveStats: Stats): Character {
  const jobClass = JOB_CLASSES[Math.floor(Math.random() * JOB_CLASSES.length)];
  const multiplier = difficultyMultiplier(player.currentWinStreak);
  const bonusLevels = MIN_BONUS_LEVELS + Math.floor(Math.random() * (MAX_BONUS_LEVELS - MIN_BONUS_LEVELS + 1));

  return {
    id: randomUUID(),
    ownerId: `${BOT_OWNER_ID_PREFIX}${randomUUID()}`,
    name: `${capitalize(jobClass)} Sparring Bot`,
    jobClass,
    level: player.level + bonusLevels,
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
    stats: scaleStats(playerEffectiveStats, multiplier),
  };
}

function difficultyMultiplier(winStreak: number): number {
  const base = BASE_MULTIPLIER_MIN + Math.random() * (BASE_MULTIPLIER_MAX - BASE_MULTIPLIER_MIN);
  const streakBonus = Math.min(winStreak, STREAK_MULTIPLIER_CAP_STREAK) * STREAK_MULTIPLIER_STEP;
  return Math.min(base + streakBonus, MAX_MULTIPLIER);
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
