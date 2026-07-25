import type { Character } from "@xstellar/shared";
import { CLASS_SKILLS, STARTER_INVENTORY } from "@xstellar/shared";
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

export async function getOrCreateStarterCharacter(userId: string, username: string): Promise<Character> {
  const existing = await prisma.character.findFirst({ where: { ownerId: userId } });
  if (existing) {
    return toSharedCharacter(existing);
  }

  const created = await prisma.character.create({
    data: {
      ownerId: userId,
      name: `${username}'s Hero`,
      jobClass: "warrior",
      level: 1,
      xp: 0,
      spriteKey: "hero_warrior",
      inventory: STARTER_INVENTORY as Prisma.InputJsonValue,
      ...STARTER_STATS,
    },
  });

  return toSharedCharacter(created);
}

export async function persistCharacterProgress(character: Character): Promise<void> {
  await prisma.character.update({
    where: { id: character.id },
    data: {
      level: character.level,
      xp: character.xp,
      winStreak: character.winStreak,
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
  jobClass: string;
  level: number;
  xp: number;
  winStreak: number;
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
  const jobClass = row.jobClass as Character["jobClass"];
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    jobClass,
    level: row.level,
    xp: row.xp,
    winStreak: row.winStreak,
    spriteKey: row.spriteKey,
    skillIds: CLASS_SKILLS[jobClass] ?? [],
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
