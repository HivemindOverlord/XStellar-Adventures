import type { Stats } from "./character.js";
import type { EquipmentItem } from "./equipment.js";

// Chapter/boss content sourced from "The XStellar: The Book Bible" — chapters 1-2, 5-7, and 17
// of "The ACTUAL Outline" (Golem's early clashes with the Hive Guardian). Only these three are
// built out as a proof of concept; chapters 4-33 follow the same shape and are pure
// content-authoring work once this pattern exists — add an entry to CAMPAIGN_CHAPTERS below.

export interface CampaignChapterBoss {
  name: string;
  level: number;
  spriteKey: string;
  stats: Stats;
  skillIds: string[];
  // Flavor only, shown on the chapter-select/lore screen. The boss's `stats` above already
  // bake in whatever combat effect a signature weapon/armor would grant, so this is never
  // applied to the boss's stats a second time.
  signatureEquipment: EquipmentItem;
}

export interface CampaignChapterDefinition {
  id: string;
  sequence: number;
  title: string;
  subtitle: string;
  loreIntro: string;
  bossQuote: string;
  loreOutro: string;
  // First-clear grants an extra character slot via Character Progression's grantCharacterSlot().
  isMilestone: boolean;
  boss: CampaignChapterBoss;
}

const GUARDIAN_STATS_CH1: Stats = { maxHp: 70, hp: 70, maxMp: 10, mp: 10, attack: 14, defense: 10, magic: 4, speed: 7 };
const GUARDIAN_STATS_CH2: Stats = { maxHp: 110, hp: 110, maxMp: 15, mp: 15, attack: 18, defense: 13, magic: 6, speed: 8 };
const GUARDIAN_STATS_CH3: Stats = { maxHp: 160, hp: 160, maxMp: 20, mp: 20, attack: 24, defense: 18, magic: 8, speed: 10 };

export const CAMPAIGN_CHAPTERS: Record<string, CampaignChapterDefinition> = {
  ch01_first_encounter: {
    id: "ch01_first_encounter",
    sequence: 1,
    title: "Chapter 1: First Encounter",
    subtitle: "Golem makes planetfall against the Swarm",
    loreIntro:
      "Golem arrives at the Bug landing site and surveys the enemy's forces: a Guardian, Patrols, Drones, and the pupae-stage Hive at their center. He transforms into his tri-ped war form, dual curved blades forming from sandstone-dense flesh, and closes the distance before the Guardian's armor can fully form.",
    bossQuote:
      "\"The Hive Guardian stumbles my way, its long, jointed legs striking the ground with a metallic clink, readying its bladed appendages.\"",
    loreOutro:
      "With the Guardian beheaded and the Drones scattered, Golem shifts to Plasma form and incinerates every scrap of Bug biomatter, leaving only piled metallic bones and ash. The landing site is clean — for now. Somewhere, a new pod is already cracking through the sky.",
    isMilestone: false,
    boss: {
      name: "Hive Guardian",
      level: 3,
      spriteKey: "boss_hive_guardian",
      stats: GUARDIAN_STATS_CH1,
      skillIds: ["guardian_blade_sweep"],
      signatureEquipment: {
        id: "guardian_bladed_forelimbs",
        name: "Bladed Forelimbs",
        slot: "weapon",
        rarity: "blue",
        statBonuses: { attack: 4 },
      },
    },
  },
  ch02_battle_for_the_village: {
    id: "ch02_battle_for_the_village",
    sequence: 2,
    title: "Chapter 2: The Battle for the Village",
    subtitle: "A Hive Lander crushes half the town",
    loreIntro:
      "A Hive Lander crashes into town, crushing buildings across the street from where Joel and Leo stand. Golem and Marina race back from the woods as the first Guardian claws its way out of the wreckage. Smoke rises over the village as the fight for the town begins in earnest — and somewhere in the chaos, Kendra is being pulled toward the Lander by something not entirely her own.",
    bossQuote:
      "\"Must Go. Enemy. Danger. Near.\" Golem calculates the trajectory and rushes toward the smoke with Marina close behind.",
    loreOutro:
      "The Guardian falls, its Hive shriveling and dying the instant Golem lands the killing blow. But inside the wreckage he finds a passed-out child who looks like Marina — Kendra, touched by something the Guardian was never meant to protect. The village survives the night. Not everyone in it does.",
    isMilestone: true,
    boss: {
      name: "Hive Guardian, Breaker of the Village",
      level: 6,
      spriteKey: "boss_hive_guardian_village",
      stats: GUARDIAN_STATS_CH2,
      skillIds: ["guardian_blade_sweep"],
      signatureEquipment: {
        id: "guardian_reinforced_carapace",
        name: "Reinforced Carapace",
        slot: "armor",
        rarity: "purple",
        statBonuses: { maxHp: 20, defense: 5 },
      },
    },
  },
  ch03_rearguard: {
    id: "ch03_rearguard",
    sequence: 3,
    title: "Chapter 3: Rearguard",
    subtitle: "Golem holds the city's edge alone",
    loreIntro:
      "The party flees south as the city falls behind them. Golem holds the rear, and for the first time faces more than one Guardian at once — the Hive's coordination has grown sharper, more deliberate, as if something now directs it. His plasma form can't incinerate fast enough to keep pace, so he fights a strategic retreat, drawing the Swarm's attention away from the road south and buying the family every second he can before dawn forces him to break contact and race to catch up.",
    bossQuote: "He notes the Hive's increased coordination. Something is directing them now.",
    loreOutro:
      "Golem breaks off at first light, dimmer than the party has ever seen him, and races south. The city is lost. The road to the Quix lands is open. He catches up to the wagon at dusk, and says nothing about what it cost him to get there.",
    isMilestone: true,
    boss: {
      name: "Hive Guardian Vanguard",
      level: 10,
      spriteKey: "boss_hive_guardian_vanguard",
      stats: GUARDIAN_STATS_CH3,
      skillIds: ["guardian_blade_sweep"],
      signatureEquipment: {
        id: "guardian_vanguard_plating",
        name: "Vanguard Plating",
        slot: "armor",
        rarity: "orange",
        statBonuses: { maxHp: 35, defense: 9 },
      },
    },
  },
};

export const CAMPAIGN_CHAPTER_ORDER: string[] = Object.values(CAMPAIGN_CHAPTERS)
  .sort((a, b) => a.sequence - b.sequence)
  .map((chapter) => chapter.id);
