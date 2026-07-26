import type { Character, JobClass } from "@xstellar/shared";
import { skillIdsForClasses, STARTER_EQUIPMENT, STARTER_INVENTORY } from "@xstellar/shared";
import { prisma } from "../db/prisma.js";
import type { Prisma } from "@prisma/client";

const STARTER_STATS = {
  maxHp: 60,
  hp: 60,
  maxMp: 20,
  mp: 20,
  attack: 12,
  defense: 8,
  magic: 10,
  speed: 9,
};

export class CharacterSlotError extends Error {}

// Returns the account's currently-active character, auto-selecting the first one found
// (or creating a brand-new blank character) if none is set yet. Existing single-character
// accounts keep working exactly as before; multi-character accounts pick whichever
// character was last selected via selectCharacter()/createCharacter().
export async function getOrCreateStarterCharacter(userId: string, username: string): Promise<Character> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  if (user.activeCharacterId) {
    const active = await prisma.character.findFirst({ where: { id: user.activeCharacterId, ownerId: userId } });
    if (active) return toSharedCharacter(active);
  }

  const existing = await prisma.character.findFirst({ where: { ownerId: userId }, orderBy: { createdAt: "asc" } });
  if (existing) {
    await prisma.user.update({ where: { id: userId }, data: { activeCharacterId: existing.id } });
    return toSharedCharacter(existing);
  }

  const created = await createBlankCharacter(userId, `${username}'s Hero`);
  await prisma.user.update({ where: { id: userId }, data: { activeCharacterId: created.id } });
  return toSharedCharacter(created);
}

export interface CharacterSlotSummary {
  characters: Character[];
  unlockedCharacterSlots: number;
}

export async function listCharacters(userId: string): Promise<CharacterSlotSummary> {
  const [user, rows] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.character.findMany({ where: { ownerId: userId }, orderBy: { createdAt: "asc" } }),
  ]);
  return { characters: rows.map(toSharedCharacter), unlockedCharacterSlots: user.unlockedCharacterSlots };
}

// Creates a new blank (classless) character if the account has a free slot, and makes it
// the active character. Slot cap is User.unlockedCharacterSlots, raised via grantCharacterSlot().
export async function createCharacter(userId: string, name: string): Promise<Character> {
  const [user, count] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.character.count({ where: { ownerId: userId } }),
  ]);
  if (count >= user.unlockedCharacterSlots) {
    throw new CharacterSlotError("No character slots available");
  }

  const created = await createBlankCharacter(userId, name);
  await prisma.user.update({ where: { id: userId }, data: { activeCharacterId: created.id } });
  return toSharedCharacter(created);
}

export async function selectCharacter(userId: string, characterId: string): Promise<Character> {
  const character = await prisma.character.findFirst({ where: { id: characterId, ownerId: userId } });
  if (!character) {
    throw new CharacterSlotError("You don't own that character");
  }
  await prisma.user.update({ where: { id: userId }, data: { activeCharacterId: character.id } });
  return toSharedCharacter(character);
}

// Increments the account's character-slot cap by one. Idempotency/dedup (e.g. not
// granting twice for the same cleared chapter) is the caller's problem — a future
// Story & PvE Campaign agent calls this when the player clears specific chapters.
export async function grantCharacterSlot(userId: string): Promise<number> {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { unlockedCharacterSlots: { increment: 1 } },
  });
  return updated.unlockedCharacterSlots;
}

// PvP matchmaking bot-fallback opt-out toggle. Player-facing setting, not battle progress —
// kept separate from persistCharacterProgress so it can be flipped outside a battle.
export async function setAllowBotMatches(character: Character, allow: boolean): Promise<Character> {
  await prisma.character.update({ where: { id: character.id }, data: { allowBotMatches: allow } });
  return { ...character, allowBotMatches: allow };
}

async function createBlankCharacter(userId: string, name: string) {
  const created = await prisma.character.create({
    data: {
      ownerId: userId,
      name,
      jobClass: null,
      level: 1,
      xp: 0,
      unallocatedStatPoints: 0,
      unlockedClasses: [] as Prisma.InputJsonValue,
      completedChapterIds: [] as Prisma.InputJsonValue,
      campaignBossMemory: {} as Prisma.InputJsonValue,
      spriteKey: "hero_blank",
      inventory: STARTER_INVENTORY as Prisma.InputJsonValue,
      ...STARTER_STATS,
    },
  });

  await prisma.characterEquipmentInstance.createMany({
    data: STARTER_EQUIPMENT.map((catalogItemId) => ({
      characterId: created.id,
      catalogItemId,
      acquiredVia: "loot",
      purchasedDate: null,
    })),
  });

  return created;
}

export async function persistCharacterProgress(character: Character): Promise<void> {
  await prisma.character.update({
    where: { id: character.id },
    data: {
      jobClass: character.jobClass,
      level: character.level,
      xp: character.xp,
      unallocatedStatPoints: character.unallocatedStatPoints,
      unlockedClasses: character.unlockedClasses as Prisma.InputJsonValue,
      completedChapterIds: character.completedChapterIds as Prisma.InputJsonValue,
      campaignBossMemory: character.campaignBossMemory as Prisma.InputJsonValue,
      currentWinStreak: character.currentWinStreak,
      allowBotMatches: character.allowBotMatches,
      dryStreakWeapon: character.dryStreakWeapon,
      dryStreakArmor: character.dryStreakArmor,
      dryStreakAccessory: character.dryStreakAccessory,
      currency: character.currency,
      purchasesToday: character.purchasesToday as Prisma.InputJsonValue,
      purchasesTodayDate: character.purchasesTodayDate ?? null,
      maxHp: character.stats.maxHp,
      hp: character.stats.maxHp,
      maxMp: character.stats.maxMp,
      mp: character.stats.maxMp,
      attack: character.stats.attack,
      defense: character.stats.defense,
      magic: character.stats.magic,
      speed: character.stats.speed,
      inventory: character.inventory as Prisma.InputJsonValue,
      equippedWeaponId: character.equippedWeaponId ?? null,
      equippedArmorId: character.equippedArmorId ?? null,
      equippedAccessoryId: character.equippedAccessoryId ?? null,
    },
  });
}

type CharacterRow = {
  id: string;
  ownerId: string;
  name: string;
  jobClass: string | null;
  level: number;
  xp: number;
  unallocatedStatPoints: number;
  unlockedClasses: Prisma.JsonValue;
  completedChapterIds: Prisma.JsonValue;
  campaignBossMemory: Prisma.JsonValue;
  currentWinStreak: number;
  allowBotMatches: boolean;
  dryStreakWeapon: number;
  dryStreakArmor: number;
  dryStreakAccessory: number;
  currency: number;
  purchasesToday: Prisma.JsonValue;
  purchasesTodayDate: string | null;
  maxHp: number;
  hp: number;
  maxMp: number;
  mp: number;
  attack: number;
  defense: number;
  magic: number;
  speed: number;
  spriteKey: string;
  inventory: Prisma.JsonValue;
  equippedWeaponId: string | null;
  equippedArmorId: string | null;
  equippedAccessoryId: string | null;
};

function toSharedCharacter(row: CharacterRow): Character {
  const jobClass = row.jobClass as JobClass | null;
  const unlockedClasses = (row.unlockedClasses as JobClass[]) ?? [];
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    jobClass,
    level: row.level,
    xp: row.xp,
    unallocatedStatPoints: row.unallocatedStatPoints,
    unlockedClasses,
    completedChapterIds: (row.completedChapterIds as string[]) ?? [],
    campaignBossMemory: (row.campaignBossMemory as Record<string, { physical: number; magical: number }>) ?? {},
    currentWinStreak: row.currentWinStreak,
    allowBotMatches: row.allowBotMatches,
    dryStreakWeapon: row.dryStreakWeapon,
    dryStreakArmor: row.dryStreakArmor,
    dryStreakAccessory: row.dryStreakAccessory,
    currency: row.currency,
    purchasesToday: (row.purchasesToday as Record<string, number>) ?? {},
    purchasesTodayDate: row.purchasesTodayDate ?? undefined,
    spriteKey: row.spriteKey,
    skillIds: skillIdsForClasses(unlockedClasses),
    inventory: (row.inventory as Record<string, number>) ?? {},
    equippedWeaponId: row.equippedWeaponId ?? undefined,
    equippedArmorId: row.equippedArmorId ?? undefined,
    equippedAccessoryId: row.equippedAccessoryId ?? undefined,
    stats: {
      maxHp: row.maxHp,
      hp: row.maxHp,
      maxMp: row.maxMp,
      mp: row.maxMp,
      attack: row.attack,
      defense: row.defense,
      magic: row.magic,
      speed: row.speed,
    },
  };
}
