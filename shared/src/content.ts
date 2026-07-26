import type { Item, JobClass, Skill } from "./character.js";
import type { EquipmentItem } from "./equipment.js";

// Names and flavor pull from the broader XStellar universe bible (the Human
// Cast and the Quix) so battle content reads as part of the same world
// rather than generic filler.
export const SKILLS: Record<string, Skill> = {
  shield_slam: {
    id: "shield_slam",
    name: "Shield Slam",
    mpCost: 6,
    power: 1.4,
    target: "single-enemy",
    kind: "physical",
  },
  twin_fang_strike: {
    id: "twin_fang_strike",
    name: "Twin Fang Strike",
    mpCost: 7,
    power: 1.3,
    target: "single-enemy",
    kind: "physical",
  },
  cinder_bolt: {
    id: "cinder_bolt",
    name: "Cinder Bolt",
    mpCost: 8,
    power: 1.6,
    target: "single-enemy",
    kind: "magical",
  },
  mending_light: {
    id: "mending_light",
    name: "Mending Light",
    mpCost: 10,
    power: 22,
    target: "self",
    kind: "heal",
  },
};

export const CLASS_SKILLS: Record<JobClass, string[]> = {
  warrior: ["shield_slam"],
  rogue: ["twin_fang_strike"],
  mage: ["cinder_bolt"],
  cleric: ["mending_light"],
};

// Multi-class stacking: a character's available skills are the union of every unlocked
// class's skill list, not just a single jobClass lookup.
export function skillIdsForClasses(unlockedClasses: JobClass[]): string[] {
  return [...new Set(unlockedClasses.flatMap((jobClass) => CLASS_SKILLS[jobClass] ?? []))];
}

export const ITEMS: Record<string, Item> = {
  willows_tonic: {
    id: "willows_tonic",
    name: "Willow's Tonic",
    power: 25,
    target: "self",
    kind: "heal",
  },
  quix_ember: {
    id: "quix_ember",
    name: "Quix Ember",
    power: 18,
    target: "single-enemy",
    kind: "damage",
  },
  bruces_whetstone: {
    id: "bruces_whetstone",
    name: "Bruce's Whetstone",
    power: 5,
    target: "self",
    kind: "buff",
  },
};

// Equipment catalog, seeded across all 6 rarity tiers. classLock design intent for
// Phase 2's weighted loot drops: white/green tiers should generally have no classLock
// (anyone can wear them); class-locked items start appearing rarely at blue, become
// more common through purple/orange, and every red-tier item must have a classLock.
// This catalog only seeds a handful of examples per tier reflecting that trend — actual
// drop-rate weighting is out of scope for Phase 1.
export const EQUIPMENT: Record<string, EquipmentItem> = {
  scouts_dagger: {
    id: "scouts_dagger",
    name: "Scout's Dagger",
    slot: "weapon",
    rarity: "white",
    statBonuses: { attack: 3 },
  },
  padded_vest: {
    id: "padded_vest",
    name: "Padded Vest",
    slot: "armor",
    rarity: "white",
    statBonuses: { maxHp: 15, defense: 2 },
  },
  hikers_charm: {
    id: "hikers_charm",
    name: "Hiker's Charm",
    slot: "accessory",
    rarity: "white",
    statBonuses: { speed: 1, maxMp: 5 },
  },
  iron_saber: {
    id: "iron_saber",
    name: "Iron Saber",
    slot: "weapon",
    rarity: "green",
    statBonuses: { attack: 6 },
  },
  chainlink_mail: {
    id: "chainlink_mail",
    name: "Chainlink Mail",
    slot: "armor",
    rarity: "green",
    statBonuses: { maxHp: 25, defense: 4 },
  },
  windward_band: {
    id: "windward_band",
    name: "Windward Band",
    slot: "accessory",
    rarity: "green",
    statBonuses: { speed: 2, maxMp: 8 },
  },
  twinstar_rapier: {
    id: "twinstar_rapier",
    name: "Twinstar Rapier",
    slot: "weapon",
    rarity: "blue",
    statBonuses: { attack: 10 },
  },
  cinderkin_wand: {
    id: "cinderkin_wand",
    name: "Cinderkin Wand",
    slot: "weapon",
    rarity: "blue",
    classLock: "mage",
    statBonuses: { magic: 10 },
  },
  korrs_bulwark: {
    id: "korrs_bulwark",
    name: "Korr's Bulwark",
    slot: "armor",
    rarity: "blue",
    statBonuses: { maxHp: 35, defense: 6 },
  },
  tidewalkers_anklet: {
    id: "tidewalkers_anklet",
    name: "Tidewalker's Anklet",
    slot: "accessory",
    rarity: "blue",
    statBonuses: { speed: 3, maxMp: 12 },
  },
  warlords_cleaver: {
    id: "warlords_cleaver",
    name: "Warlord's Cleaver",
    slot: "weapon",
    rarity: "purple",
    classLock: "warrior",
    statBonuses: { attack: 16 },
  },
  shadowveil_cowl: {
    id: "shadowveil_cowl",
    name: "Shadowveil Cowl",
    slot: "armor",
    rarity: "purple",
    classLock: "rogue",
    statBonuses: { maxHp: 40, defense: 8 },
  },
  starlit_pendant: {
    id: "starlit_pendant",
    name: "Starlit Pendant",
    slot: "accessory",
    rarity: "purple",
    statBonuses: { speed: 4, maxMp: 16 },
  },
  infernal_greatsword: {
    id: "infernal_greatsword",
    name: "Infernal Greatsword",
    slot: "weapon",
    rarity: "orange",
    classLock: "warrior",
    statBonuses: { attack: 22 },
  },
  auric_vestments: {
    id: "auric_vestments",
    name: "Auric Vestments",
    slot: "armor",
    rarity: "orange",
    classLock: "cleric",
    statBonuses: { maxHp: 60, defense: 12 },
  },
  tempests_signet: {
    id: "tempests_signet",
    name: "Tempest's Signet",
    slot: "accessory",
    rarity: "orange",
    classLock: "mage",
    statBonuses: { speed: 6, maxMp: 20 },
  },
  worldbreaker: {
    id: "worldbreaker",
    name: "Worldbreaker",
    slot: "weapon",
    rarity: "red",
    classLock: "warrior",
    statBonuses: { attack: 30, magic: 10 },
  },
  aegis_eternal: {
    id: "aegis_eternal",
    name: "Aegis Eternal",
    slot: "armor",
    rarity: "red",
    classLock: "cleric",
    statBonuses: { maxHp: 90, defense: 18 },
  },
  voidstep_crown: {
    id: "voidstep_crown",
    name: "Voidstep Crown",
    slot: "accessory",
    rarity: "red",
    classLock: "rogue",
    statBonuses: { speed: 10, maxMp: 30 },
  },
};

export const STARTER_INVENTORY: Record<string, number> = {
  willows_tonic: 2,
  quix_ember: 1,
  bruces_whetstone: 1,
};

// Catalog ids seeded as CharacterEquipmentInstance rows for a brand-new character (not
// inventory entries — equipment ownership is tracked as individual instances, not counts).
export const STARTER_EQUIPMENT: string[] = ["scouts_dagger", "padded_vest"];
