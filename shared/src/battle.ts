import type { Character } from "./character.js";
import type { EquipmentInstance } from "./equipment.js";

export type CombatantSide = "party" | "enemy";

export interface Combatant {
  id: string;
  character: Character;
  side: CombatantSide;
  isDefending: boolean;
  isDefeated: boolean;
  attackBuff?: { amount: number; turnsRemaining: number };
  // Snapshot of the character's equipped-instance rows at battle start, resolved once since
  // equipment can't be swapped mid-battle (Phase 1 scope) — lets computeEffectiveStats
  // resolve equippedWeaponId/ArmorId/AccessoryId (instance ids) without a DB round-trip.
  equipmentInstances: EquipmentInstance[];
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

export interface XpGainResult {
  xpGained: number;
  leveledUp: boolean;
  newLevel: number;
}

export interface BattleReward extends XpGainResult {
  currencyGained: number;
  itemsDropped: string[];
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
