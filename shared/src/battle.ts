import type { Character } from "./character.js";

export type CombatantSide = "party" | "enemy";

export interface Combatant {
  id: string;
  character: Character;
  side: CombatantSide;
  isDefending: boolean;
  isDefeated: boolean;
  attackBuff?: { amount: number; turnsRemaining: number };
}

export type BattleActionType = "attack" | "skill" | "item" | "defend" | "flee";

export interface BattleAction {
  type: BattleActionType;
  actorId: string;
  targetId?: string;
  skillId?: string;
  itemId?: string;
}

export interface BattleLogEntry {
  turn: number;
  actorId: string;
  action: BattleAction;
  result: string;
  damage?: number;
  healing?: number;
}

export type BattlePhase = "waiting-for-players" | "in-progress" | "victory" | "defeat" | "fled";

export interface BattleReward {
  xpGained: number;
  leveledUp: boolean;
  newLevel: number;
}

export interface BattleState {
  battleId: string;
  phase: BattlePhase;
  turn: number;
  turnOrder: string[];
  activeCombatantId: string | null;
  combatants: Combatant[];
  log: BattleLogEntry[];
  rewards?: Record<string, BattleReward>;
}
