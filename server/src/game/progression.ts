import type { BattleReward, BattleState, Character } from "@xstellar/shared";
import {
  applyXp,
  computeEquipmentDropOdds,
  DRY_STREAK_FIELD,
  EQUIPMENT_DROP_SLOTS,
  pickFromDropOdds,
} from "@xstellar/shared";
import { prisma } from "../db/prisma.js";
import { isBotCharacter } from "./botCharacter.js";

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

const WIN_STREAK_CAP = 20;

function driftmetalForVictory(opponentLevel: number, winStreak: number): number {
  return 20 + opponentLevel * 8 + Math.min(winStreak, WIN_STREAK_CAP) * 4;
}

function driftmetalForDefeat(opponentLevel: number): number {
  return 5 + opponentLevel * 2;
}

// Rolls one loot chance per equipment slot for the winner. Both the odds themselves and the
// concrete item selection come from shared/src/lootOdds.ts's computeEquipmentDropOdds — the
// exact same function the /api/loot/odds preview endpoint calls — so a real roll can never
// disagree with what the player was shown beforehand.
async function rollItemDrops(character: Character, opponentLevel: number): Promise<string[]> {
  const dropped: string[] = [];

  for (const slot of EQUIPMENT_DROP_SLOTS) {
    const odds = computeEquipmentDropOdds(character, slot, opponentLevel);
    const field = DRY_STREAK_FIELD[slot];

    if (Math.random() < odds.dropChance) {
      const item = pickFromDropOdds(odds);
      if (item) {
        // Bot opponents have no Character row to satisfy the instance's FK, and their
        // rewards are never persisted anyway (see finishBattle's isBotCharacter filter).
        if (!isBotCharacter(character)) {
          await prisma.characterEquipmentInstance.create({
            data: {
              characterId: character.id,
              catalogItemId: item.id,
              acquiredVia: "loot",
              purchasedDate: null,
            },
          });
        }
        character[field] = 0;
        dropped.push(item.id);
        continue;
      }
    }

    character[field] += 1;
  }

  return dropped;
}

// victoryMultiplier scales only the winner's XP/Driftmetal — used by the Story & PvE Campaign
// flow to pay full reward on a chapter's first clear and a reduced reward on replays. PvP/bot
// battles omit it and get the unscaled amount, same as before this parameter existed.
export async function grantBattleRewards(
  state: BattleState,
  victoryMultiplier = 1,
): Promise<Record<string, BattleReward>> {
  const rewards: Record<string, BattleReward> = {};

  if (state.phase === "victory" || state.phase === "defeat") {
    const partyWon = state.phase === "victory";
    for (const c of state.combatants) {
      const opponent = state.combatants.find((o) => o.id !== c.id);
      const opponentLevel = opponent?.character.level ?? 1;
      const won = (c.side === "party") === partyWon;

      const xpAmount = won ? Math.round(xpForVictory(opponentLevel) * victoryMultiplier) : xpForDefeat(opponentLevel);
      const currencyAmount = won
        ? Math.round(driftmetalForVictory(opponentLevel, c.character.currentWinStreak) * victoryMultiplier)
        : driftmetalForDefeat(opponentLevel);
      const itemsDropped = won ? await rollItemDrops(c.character, opponentLevel) : [];

      const xpReward = applyXp(c.character, xpAmount);
      c.character.currency += currencyAmount;
      c.character.currentWinStreak = won ? c.character.currentWinStreak + 1 : 0;

      rewards[c.id] = { ...xpReward, currencyGained: currencyAmount, itemsDropped };
    }
  } else if (state.phase === "fled") {
    const fledId = state.log[state.log.length - 1]?.actorId;
    for (const c of state.combatants) {
      const opponent = state.combatants.find((o) => o.id !== c.id);
      const opponentLevel = opponent?.character.level ?? 1;
      const amount = c.id === fledId ? xpForFleeing() : xpForOpponentFled(opponentLevel);
      const xpReward = applyXp(c.character, amount);
      rewards[c.id] = { ...xpReward, currencyGained: 0, itemsDropped: [] };
    }
  }

  return rewards;
}
