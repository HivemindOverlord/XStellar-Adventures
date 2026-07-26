export type JobClass = "warrior" | "mage" | "cleric" | "rogue";

export interface Stats {
  maxHp: number;
  hp: number;
  maxMp: number;
  mp: number;
  attack: number;
  defense: number;
  magic: number;
  speed: number;
}

export interface Character {
  id: string;
  ownerId: string;
  name: string;
  // Informational only ("first class unlocked," for display) — skill access is driven
  // entirely by unlockedClasses, not this field. Null until the first threshold is crossed.
  jobClass: JobClass | null;
  level: number;
  xp: number;
  unallocatedStatPoints: number;
  unlockedClasses: JobClass[];
  currentWinStreak: number;
  stats: Stats;
  skillIds: string[];
  inventory: Record<string, number>;
  spriteKey: string;
  equippedWeaponId?: string;
  equippedArmorId?: string;
  equippedAccessoryId?: string;
  // Pity counters: consecutive victories since the character's last equipment
  // drop in that slot category, used to bias loot-drop odds back in their favor.
  dryStreakWeapon: number;
  dryStreakArmor: number;
  dryStreakAccessory: number;
  currency: number;
  purchasesToday: Record<string, number>;
  purchasesTodayDate?: string;
  // Chapter ids first-cleared by this character (Story & PvE Campaign). Per-character, not
  // per-account, since class/specialization progress is per-character too.
  completedChapterIds: string[];
  // Per-chapter tally of physical vs magical actions this character has thrown at that
  // chapter's boss across every attempt (win or loss) — the campaign AI's adaptive-defense
  // rule reads this when building the boss for the next attempt.
  campaignBossMemory: Record<string, { physical: number; magical: number }>;
  // Opt-out for PvP matchmaking's bot fallback. False means the queue never substitutes a
  // bot for this player — they keep waiting for a human match (widening bracket) only.
  allowBotMatches: boolean;
}

export interface Skill {
  id: string;
  name: string;
  mpCost: number;
  power: number;
  target: "single-enemy" | "all-enemies" | "single-ally" | "self";
  kind: "physical" | "magical" | "heal";
}

export interface Item {
  id: string;
  name: string;
  power: number;
  target: "single-enemy" | "self";
  kind: "damage" | "heal" | "buff";
}
