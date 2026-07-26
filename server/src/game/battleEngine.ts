import type { BattleAction, BattleLogEntry, BattleState, Combatant, Item, Skill } from "@xstellar/shared";
import { computeEffectiveStats, EQUIPMENT, ITEMS, SKILLS } from "@xstellar/shared";

const BUFF_DURATION_TURNS = 3;

function effectiveStats(combatant: Combatant) {
  return computeEffectiveStats(combatant.character, EQUIPMENT, combatant.equipmentInstances);
}

export function createBattle(battleId: string, combatants: Combatant[]): BattleState {
  const turnOrder = [...combatants]
    .sort((a, b) => effectiveStats(b).speed - effectiveStats(a).speed)
    .map((c) => c.id);

  return {
    battleId,
    phase: "in-progress",
    turn: 1,
    turnOrder,
    activeCombatantId: turnOrder[0] ?? null,
    combatants,
    log: [],
  };
}

export class IllegalActionError extends Error {}

export function applyAction(state: BattleState, action: BattleAction): BattleState {
  if (state.phase !== "in-progress") {
    throw new IllegalActionError("Battle is not in progress");
  }
  if (action.actorId !== state.activeCombatantId) {
    throw new IllegalActionError("It is not this combatant's turn");
  }

  const actor = findCombatant(state, action.actorId);
  if (!actor || actor.isDefeated) {
    throw new IllegalActionError("Actor is not a valid combatant");
  }

  const entry = resolveAction(state, actor, action);
  const nextState: BattleState = {
    ...state,
    combatants: state.combatants.map((c) => (c.id === actor.id ? actor : c)),
    log: [...state.log, entry],
  };

  return advanceTurn(nextState);
}

function resolveAction(state: BattleState, actor: Combatant, action: BattleAction): BattleLogEntry {
  actor.isDefending = false;
  if (actor.attackBuff) {
    actor.attackBuff.turnsRemaining -= 1;
    if (actor.attackBuff.turnsRemaining <= 0) actor.attackBuff = undefined;
  }

  switch (action.type) {
    case "attack": {
      const target = requireTarget(state, action.targetId);
      const damage = computeDamage(actor, target, "physical");
      applyDamage(target, damage);
      return {
        turn: state.turn,
        actorId: actor.id,
        action,
        result: `${actor.character.name} attacks ${target.character.name} for ${damage} damage`,
        damage,
      };
    }
    case "defend": {
      actor.isDefending = true;
      return {
        turn: state.turn,
        actorId: actor.id,
        action,
        result: `${actor.character.name} braces for the next attack`,
      };
    }
    case "flee": {
      state.phase = "fled";
      return {
        turn: state.turn,
        actorId: actor.id,
        action,
        result: `${actor.character.name} flees from battle`,
      };
    }
    case "skill": {
      const skill = requireSkill(actor, action.skillId);
      return resolveSkill(state, actor, action, skill);
    }
    case "item": {
      return resolveItem(state, actor, action);
    }
    default: {
      throw new IllegalActionError(`Action type "${action.type}" is not supported`);
    }
  }
}

function requireSkill(actor: Combatant, skillId: string | undefined): Skill {
  const skill = skillId ? SKILLS[skillId] : undefined;
  if (!skill || !actor.character.skillIds.includes(skill.id)) {
    throw new IllegalActionError("You don't know that skill");
  }
  if (actor.character.stats.mp < skill.mpCost) {
    throw new IllegalActionError(`Not enough MP to use ${skill.name}`);
  }
  return skill;
}

function resolveSkill(state: BattleState, actor: Combatant, action: BattleAction, skill: Skill): BattleLogEntry {
  actor.character.stats.mp -= skill.mpCost;

  if (skill.kind === "heal") {
    const healing = applyHeal(actor, skill.power);
    return {
      turn: state.turn,
      actorId: actor.id,
      action,
      result: `${actor.character.name} casts ${skill.name}, healing ${healing} HP`,
      healing,
    };
  }

  const target = requireTarget(state, action.targetId);
  const damage = Math.round(computeDamage(actor, target, skill.kind) * skill.power);
  applyDamage(target, damage);
  return {
    turn: state.turn,
    actorId: actor.id,
    action,
    result: `${actor.character.name} uses ${skill.name} on ${target.character.name} for ${damage} damage`,
    damage,
  };
}

function resolveItem(state: BattleState, actor: Combatant, action: BattleAction): BattleLogEntry {
  const item = action.itemId ? ITEMS[action.itemId] : undefined;
  const owned = item ? (actor.character.inventory[item.id] ?? 0) : 0;
  if (!item || owned <= 0) {
    throw new IllegalActionError("You don't have that item");
  }
  actor.character.inventory[item.id] = owned - 1;

  if (item.kind === "heal") {
    const healing = applyHeal(actor, item.power);
    return {
      turn: state.turn,
      actorId: actor.id,
      action,
      result: `${actor.character.name} uses ${item.name}, healing ${healing} HP`,
      healing,
    };
  }

  if (item.kind === "buff") {
    actor.attackBuff = { amount: item.power, turnsRemaining: BUFF_DURATION_TURNS };
    return {
      turn: state.turn,
      actorId: actor.id,
      action,
      result: `${actor.character.name} uses ${item.name}, sharpening their next attacks`,
    };
  }

  return resolveDamageItem(state, actor, action, item);
}

function resolveDamageItem(state: BattleState, actor: Combatant, action: BattleAction, item: Item): BattleLogEntry {
  const target = requireTarget(state, action.targetId);
  const damage = Math.max(1, Math.round(item.power - effectiveStats(target).defense / 4));
  applyDamage(target, damage);
  return {
    turn: state.turn,
    actorId: actor.id,
    action,
    result: `${actor.character.name} throws ${item.name} at ${target.character.name} for ${damage} damage`,
    damage,
  };
}

function applyHeal(target: Combatant, amount: number): number {
  const before = target.character.stats.hp;
  target.character.stats.hp = Math.min(effectiveStats(target).maxHp, before + amount);
  return target.character.stats.hp - before;
}

function computeDamage(attacker: Combatant, defender: Combatant, kind: "physical" | "magical"): number {
  const attackerStats = effectiveStats(attacker);
  const defenderStats = effectiveStats(defender);
  const buff = kind === "physical" ? (attacker.attackBuff?.amount ?? 0) : 0;
  const offense = (kind === "physical" ? attackerStats.attack : attackerStats.magic) + buff;
  const defense = defenderStats.defense;
  const guardMultiplier = defender.isDefending ? 0.5 : 1;
  const raw = offense - defense / 2;
  return Math.max(1, Math.round(raw * guardMultiplier));
}

function applyDamage(target: Combatant, damage: number): void {
  target.character.stats.hp = Math.max(0, target.character.stats.hp - damage);
  target.isDefeated = target.character.stats.hp <= 0;
}

function requireTarget(state: BattleState, targetId: string | undefined): Combatant {
  const target = targetId ? findCombatant(state, targetId) : undefined;
  if (!target) {
    throw new IllegalActionError("A valid target is required for this action");
  }
  return target;
}

function findCombatant(state: BattleState, id: string): Combatant | undefined {
  return state.combatants.find((c) => c.id === id);
}

function advanceTurn(state: BattleState): BattleState {
  const outcome = checkOutcome(state);
  if (outcome) {
    return { ...state, phase: outcome, activeCombatantId: null };
  }
  if (state.phase === "fled") {
    return { ...state, activeCombatantId: null };
  }

  const alive = state.turnOrder.filter((id) => !findCombatant(state, id)?.isDefeated);
  const currentIndex = alive.indexOf(state.activeCombatantId ?? "");
  const nextIndex = (currentIndex + 1) % alive.length;
  const wrapped = nextIndex <= currentIndex;

  return {
    ...state,
    turn: wrapped ? state.turn + 1 : state.turn,
    activeCombatantId: alive[nextIndex] ?? null,
  };
}

function checkOutcome(state: BattleState): "victory" | "defeat" | null {
  const partyAlive = state.combatants.some((c) => c.side === "party" && !c.isDefeated);
  const enemyAlive = state.combatants.some((c) => c.side === "enemy" && !c.isDefeated);

  if (!enemyAlive) return "victory";
  if (!partyAlive) return "defeat";
  return null;
}

export function appendNote(state: BattleState, actorId: string, message: string): BattleState {
  const entry: BattleLogEntry = {
    turn: state.turn,
    actorId,
    action: { type: "defend", actorId },
    result: message,
  };
  return { ...state, log: [...state.log, entry] };
}

export function forfeitBattle(state: BattleState, actorId: string): BattleState {
  if (state.phase !== "in-progress") {
    return state;
  }
  const actor = findCombatant(state, actorId);
  if (!actor) {
    return state;
  }

  actor.isDefeated = true;
  actor.character.stats.hp = 0;

  const entry: BattleLogEntry = {
    turn: state.turn,
    actorId: actor.id,
    action: { type: "flee", actorId },
    result: `${actor.character.name} disconnected and forfeits the match`,
  };
  const nextState: BattleState = {
    ...state,
    combatants: state.combatants.map((c) => (c.id === actor.id ? actor : c)),
    log: [...state.log, entry],
  };

  const outcome = checkOutcome(nextState) ?? "defeat";
  return { ...nextState, phase: outcome, activeCombatantId: null };
}
