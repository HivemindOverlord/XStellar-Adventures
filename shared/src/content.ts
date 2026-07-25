import type { Item, JobClass, Skill } from "./character.js";

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

export const STARTER_INVENTORY: Record<string, number> = {
  willows_tonic: 2,
  quix_ember: 1,
  bruces_whetstone: 1,
};
