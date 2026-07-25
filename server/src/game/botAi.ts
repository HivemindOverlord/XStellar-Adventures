import type { BattleAction, BattleState, Combatant } from "@xstellar/shared";
import { ITEMS, SKILLS } from "@xstellar/shared";

const ATTACK_WEIGHT = 55;
const SKILL_WEIGHT = 25;
const DEFEND_WEIGHT = 12;
const ITEM_WEIGHT = 8;
const LOW_HP_RATIO = 0.35;

export function chooseBotAction(state: BattleState, actor: Combatant): BattleAction {
  const target = state.combatants.find((c) => c.side !== actor.side && !c.isDefeated);
  if (!target) {
    return { type: "defend", actorId: actor.id };
  }

  const usableSkillIds = actor.character.skillIds.filter((id) => {
    const skill = SKILLS[id];
    return skill && actor.character.stats.mp >= skill.mpCost;
  });
  const usableHealItemIds = Object.keys(actor.character.inventory).filter((id) => {
    const item = ITEMS[id];
    return item?.kind === "heal" && (actor.character.inventory[id] ?? 0) > 0;
  });

  const isLowHp = actor.character.stats.hp / actor.character.stats.maxHp < LOW_HP_RATIO;
  if (isLowHp && usableHealItemIds.length > 0) {
    return { type: "item", actorId: actor.id, itemId: usableHealItemIds[0] };
  }

  const choice = weightedPick([
    ["attack", ATTACK_WEIGHT],
    ["skill", usableSkillIds.length > 0 ? SKILL_WEIGHT : 0],
    ["defend", DEFEND_WEIGHT],
    ["item", usableHealItemIds.length > 0 ? ITEM_WEIGHT : 0],
  ]);

  switch (choice) {
    case "skill":
      return { type: "skill", actorId: actor.id, targetId: target.id, skillId: usableSkillIds[0] };
    case "defend":
      return { type: "defend", actorId: actor.id };
    case "item":
      return { type: "item", actorId: actor.id, itemId: usableHealItemIds[0] };
    default:
      return { type: "attack", actorId: actor.id, targetId: target.id };
  }
}

function weightedPick<T extends string>(options: Array<[T, number]>): T {
  const total = options.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = Math.random() * total;
  for (const [value, weight] of options) {
    if (roll < weight) return value;
    roll -= weight;
  }
  return options[options.length - 1][0];
}
