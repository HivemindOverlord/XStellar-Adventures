import { randomUUID } from "node:crypto";
import type { BattleState, Character, Combatant, Stats } from "@xstellar/shared";
import { CAMPAIGN_CHAPTERS } from "@xstellar/shared";
import { grantBattleRewards } from "./progression.js";
import { grantCharacterSlot, persistCharacterProgress } from "./starterCharacter.js";

export class CampaignChapterError extends Error {}

const CAMPAIGN_REPLAY_MULTIPLIER = 0.4;
const CAMPAIGN_BOSS_OWNER_PREFIX = "campaign-boss:";

// Adaptive-defense rule: a character that has leaned physical against this specific chapter's
// boss (across every attempt, not just the current fight) faces a tougher-defended boss next
// time. Deterministic, not randomized — see campaignAi.ts for the sibling within-fight rule.
const BOSS_LEAN_DEFENSE_SCALE = 1.25;

export function isCampaignBossCharacter(character: Pick<Character, "ownerId">): boolean {
  return character.ownerId.startsWith(CAMPAIGN_BOSS_OWNER_PREFIX);
}

export function buildCampaignBossCombatant(chapterId: string, playerCharacter: Character): Combatant {
  const chapter = CAMPAIGN_CHAPTERS[chapterId];
  if (!chapter) {
    throw new CampaignChapterError(`Unknown chapter "${chapterId}"`);
  }

  const memory = playerCharacter.campaignBossMemory[chapterId];
  const stats = scaleBossDefenseForPlayerLean(chapter.boss.stats, memory);

  const bossCharacter: Character = {
    id: randomUUID(),
    ownerId: `${CAMPAIGN_BOSS_OWNER_PREFIX}${chapter.id}:${randomUUID()}`,
    name: chapter.boss.name,
    jobClass: null,
    level: chapter.boss.level,
    xp: 0,
    unallocatedStatPoints: 0,
    unlockedClasses: [],
    completedChapterIds: [],
    campaignBossMemory: {},
    currentWinStreak: 0,
    allowBotMatches: true,
    dryStreakWeapon: 0,
    dryStreakArmor: 0,
    dryStreakAccessory: 0,
    currency: 0,
    purchasesToday: {},
    spriteKey: chapter.boss.spriteKey,
    skillIds: chapter.boss.skillIds,
    inventory: {},
    stats,
  };

  return {
    id: bossCharacter.id,
    character: bossCharacter,
    side: "enemy",
    isDefending: false,
    isDefeated: false,
    equipmentInstances: [],
  };
}

function scaleBossDefenseForPlayerLean(stats: Stats, memory?: { physical: number; magical: number }): Stats {
  if (!memory || memory.physical <= memory.magical) return stats;
  return { ...stats, defense: Math.round(stats.defense * BOSS_LEAN_DEFENSE_SCALE) };
}

// Applies campaign-specific victory handling on top of the shared reward logic: full reward on
// a chapter's first clear, 40% on a replay, completedChapterIds updated on first clear, and a
// character-slot grant for chapters designated as milestones. Persists the player's character
// (XP/currency/completedChapterIds/campaignBossMemory) regardless of outcome; the campaign
// boss is synthetic and is never persisted.
export async function resolveCampaignBattle(state: BattleState, chapterId: string): Promise<BattleState> {
  const chapter = CAMPAIGN_CHAPTERS[chapterId];
  const playerCombatant = state.combatants.find((c) => !isCampaignBossCharacter(c.character));
  if (!playerCombatant) {
    return { ...state, rewards: {} };
  }

  const character = playerCombatant.character;
  const alreadyCleared = character.completedChapterIds.includes(chapterId);
  const isReplayVictory = state.phase === "victory" && alreadyCleared;

  const rewards = await grantBattleRewards(state, isReplayVictory ? CAMPAIGN_REPLAY_MULTIPLIER : 1);

  if (state.phase === "victory" && !alreadyCleared) {
    character.completedChapterIds = [...character.completedChapterIds, chapterId];
    if (chapter?.isMilestone) {
      await grantCharacterSlot(character.ownerId);
    }
  }

  await persistCharacterProgress(character);

  return { ...state, rewards };
}
