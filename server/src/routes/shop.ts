import { Router } from "express";
import { z } from "zod";
import type { ShopSellResponse, ShopStateResponse } from "@xstellar/shared";
import { getUtcDateString } from "@xstellar/shared";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { getOrCreateStarterCharacter } from "../game/starterCharacter.js";
import { buyItem, getShopCatalog, refundEligibility, sellItems, ShopError } from "../game/shop.js";

export const shopRouter = Router();

shopRouter.use(requireAuth);

shopRouter.get("/", async (req, res) => {
  const { user } = req as AuthedRequest;
  const character = await getOrCreateStarterCharacter(user.id, user.username);
  const today = getUtcDateString();

  const response: ShopStateResponse = {
    catalog: getShopCatalog(today),
    currency: character.currency,
    refundEligible: refundEligibility(character, today),
  };
  res.json(response);
});

const buySchema = z.object({ itemId: z.string().min(1), quantity: z.number().int().positive() });

shopRouter.post("/buy", async (req, res) => {
  const parsed = buySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { user } = req as AuthedRequest;
  const character = await getOrCreateStarterCharacter(user.id, user.username);

  try {
    await buyItem(character, parsed.data.itemId, parsed.data.quantity);
    res.json(character);
  } catch (err) {
    if (err instanceof ShopError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

const sellSchema = z.object({
  items: z.array(z.object({ itemId: z.string().min(1), quantity: z.number().int().positive() })).min(1),
});

shopRouter.post("/sell", async (req, res) => {
  const parsed = sellSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { user } = req as AuthedRequest;
  const character = await getOrCreateStarterCharacter(user.id, user.username);

  try {
    const currencyGained = await sellItems(character, parsed.data.items);
    const response: ShopSellResponse = { character, currencyGained };
    res.json(response);
  } catch (err) {
    if (err instanceof ShopError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});
