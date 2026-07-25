import type { Character } from "@xstellar/shared";
import { prisma } from "../db/prisma.js";

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
      ...STARTER_STATS,
    },
  });

  return toSharedCharacter(created);
}

function toSharedCharacter(row: {
  id: string;
  ownerId: string;
  name: string;
  jobClass: string;
  level: number;
  xp: number;
  maxHp: number;
  hp: number;
  maxMp: number;
  mp: number;
  attack: number;
  defense: number;
  magic: number;
  speed: number;
  spriteKey: string;
}): Character {
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    jobClass: row.jobClass as Character["jobClass"],
    level: row.level,
    xp: row.xp,
    spriteKey: row.spriteKey,
    skillIds: [],
    stats: {
      maxHp: row.maxHp,
      hp: row.hp,
      maxMp: row.maxMp,
      mp: row.mp,
      attack: row.attack,
      defense: row.defense,
      magic: row.magic,
      speed: row.speed,
    },
  };
}
