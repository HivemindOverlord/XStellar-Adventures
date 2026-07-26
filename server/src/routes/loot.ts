import { Router } from "express";
import { z } from "zod";
import type { LootOddsResponse, LootOddsResponseEntry, Rarity } from "@xstellar/shared";
import { computeEquipmentDropOdds, EQUIPMENT_DROP_SLOTS } from "@xstellar/shared";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { getOrCreateStarterCharacter } from "../game/starterCharacter.js";

export const lootRouter = Router();

lootRouter.use(requireAuth);

const ZERO_TIER_PROBABILITIES: Record<Rarity, number> = {
  white: 0,
  green: 0,
  blue: 0,
  purple: 0,
  orange: 0,
  red: 0,
};

const oddsQuerySchema = z.object({
  opponentLevel: z.coerce.number().int().positive().optional(),
});

// Read-only preview of the exact odds rollItemDrops (server/src/game/progression.ts) would
// resolve a real drop with right now — both call the same computeEquipmentDropOdds, so this
// number can never drift from what a battle actually does.
lootRouter.get("/odds", async (req, res) => {
  const parsed = oddsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { user } = req as AuthedRequest;
  const character = await getOrCreateStarterCharacter(user.id, user.username);

  const opponentLevelIsAssumed = parsed.data.opponentLevel === undefined;
  // No specific opponent known yet outside of an active battle — assume a same-level
  // opponent, the case the power-score matchmaker aims for most often.
  const opponentLevel = parsed.data.opponentLevel ?? character.level;

  const categories: LootOddsResponseEntry[] = EQUIPMENT_DROP_SLOTS.map((category) => {
    const odds = computeEquipmentDropOdds(character, category, opponentLevel);
    return {
      category,
      available: true,
      dropChance: odds.dropChance,
      tierProbabilities: odds.tierProbabilities,
      factors: odds.factors,
    };
  });

  categories.push({
    category: "consumable",
    available: false,
    dropChance: 0,
    tierProbabilities: ZERO_TIER_PROBABILITIES,
    factors: null,
    note: "Consumables don't drop from battles in the current build.",
  });

  const response: LootOddsResponse = { opponentLevel, opponentLevelIsAssumed, categories };
  res.json(response);
});
