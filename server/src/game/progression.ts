import type { BattleReward, BattleState } from "@xstellar/shared";
import { applyXp } from "@xstellar/shared";

function xpForVictory(opponentLevel: number): number {
  return 30 + opponentLevel * 10;
}

function xpForDefeat(opponentLevel: number): number {
  return 10 + opponentLevel * 3;
}

function xpForOpponentFled(opponentLevel: number): number {
  return 20 + opponentLevel * 6;
}

function xpForFleeing(): number {
  return 5;
}

export function grantBattleRewards(state: BattleState): Record<string, BattleReward> {
  const rewards: Record<string, BattleReward> = {};

  if (state.phase === "victory" || state.phase === "defeat") {
    const partyWon = state.phase === "victory";
    for (const c of state.combatants) {
      const opponent = state.combatants.find((o) => o.id !== c.id);
      const opponentLevel = opponent?.character.level ?? 1;
      const won = (c.side === "party") === partyWon;
      const amount = won ? xpForVictory(opponentLevel) : xpForDefeat(opponentLevel);
      rewards[c.id] = applyXp(c.character, amount);
      c.character.winStreak = won ? c.character.winStreak + 1 : 0;
    }
  } else if (state.phase === "fled") {
    const fledId = state.log[state.log.length - 1]?.actorId;
    for (const c of state.combatants) {
      const opponent = state.combatants.find((o) => o.id !== c.id);
      const opponentLevel = opponent?.character.level ?? 1;
      const amount = c.id === fledId ? xpForFleeing() : xpForOpponentFled(opponentLevel);
      rewards[c.id] = applyXp(c.character, amount);
    }
  }

  return rewards;
}
