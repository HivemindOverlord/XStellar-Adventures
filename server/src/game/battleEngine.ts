import type { BattleAction, BattleLogEntry, BattleState, Combatant } from "@xstellar/shared";

export function createBattle(battleId: string, combatants: Combatant[]): BattleState {
  const turnOrder = [...combatants]
    .sort((a, b) => b.character.stats.speed - a.character.stats.speed)
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
    case "skill":
    case "item":
    default: {
      throw new IllegalActionError(`Action type "${action.type}" is not yet supported`);
    }
  }
}

function computeDamage(attacker: Combatant, defender: Combatant, kind: "physical" | "magical"): number {
  const offense = kind === "physical" ? attacker.character.stats.attack : attacker.character.stats.magic;
  const defense = defender.character.stats.defense;
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
