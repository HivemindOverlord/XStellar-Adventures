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
  jobClass: JobClass;
  level: number;
  xp: number;
  stats: Stats;
  skillIds: string[];
  inventory: Record<string, number>;
  spriteKey: string;
  equippedWeaponId?: string;
  equippedArmorId?: string;
  equippedAccessoryId?: string;
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
