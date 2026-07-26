import type { BattleAction, BattleActionType, BattleState, Combatant } from "@xstellar/shared";
import { SKILLS } from "@xstellar/shared";

// Deterministic, legible rule set for campaign boss opponents — explicitly not machine
// learning. Two rules:
//
// 1. Within-fight: if the player defended on 2+ of their last 3 turns, the boss answers with
//    its highest-power usable skill instead of a plain attack (see chooseCampaignAiAction).
// 2. Across attempts: if a character has thrown more physical than magical actions at a given
//    chapter's boss (character.campaignBossMemory, tallied across every attempt), that boss's
//    defense stat starts higher on the next attempt (see campaignEngine.ts, which reads the
//    same memory this module's classifyPlayerAction feeds).

const DEFEND_WATCH_WINDOW = 3;
const DEFEND_TRIGGER_COUNT = 2;

export function chooseCampaignAiAction(
  state: BattleState,
  aiActor: Combatant,
  recentPlayerActionTypes: BattleActionType[],
): BattleAction {
  const target = state.combatants.find((c) => c.side !== aiActor.side && !c.isDefeated);
  if (!target) {
    return { type: "defend", actorId: aiActor.id };
  }

  const recentDefends = recentPlayerActionTypes.slice(-DEFEND_WATCH_WINDOW).filter((type) => type === "defend").length;
  if (recentDefends >= DEFEND_TRIGGER_COUNT) {
    const bestSkillId = strongestUsableSkillId(aiActor);
    if (bestSkillId) {
      return { type: "skill", actorId: aiActor.id, targetId: target.id, skillId: bestSkillId };
    }
  }

  return { type: "attack", actorId: aiActor.id, targetId: target.id };
}

function strongestUsableSkillId(actor: Combatant): string | undefined {
  const usable = actor.character.skillIds
    .map((id) => SKILLS[id])
    .filter(
      (skill): skill is NonNullable<typeof skill> =>
        Boolean(skill) && skill.kind !== "heal" && actor.character.stats.mp >= skill.mpCost,
    );
  if (usable.length === 0) return undefined;
  return usable.reduce((best, skill) => (skill.power > best.power ? skill : best)).id;
}

export type PlayerActionLean = "physical" | "magical" | "other";

// Classifies a just-taken player action for the persisted physical/magical lean tally.
// "attack" and physical/magical skills count; defends, items, and fleeing don't move the needle.
export function classifyPlayerActionLean(action: BattleAction): PlayerActionLean {
  if (action.type === "attack") return "physical";
  if (action.type === "skill" && action.skillId) {
    const skill = SKILLS[action.skillId];
    if (skill?.kind === "physical") return "physical";
    if (skill?.kind === "magical") return "magical";
  }
  return "other";
}
