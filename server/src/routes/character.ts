import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { getOrCreateStarterCharacter } from "../game/starterCharacter.js";
import { EquipError, equipItem, unequipSlot } from "../game/equipment.js";

export const characterRouter = Router();

characterRouter.use(requireAuth);

characterRouter.get("/me", async (req, res) => {
  const { user } = req as AuthedRequest;
  const character = await getOrCreateStarterCharacter(user.id, user.username);
  res.json(character);
});

const equipSchema = z.object({ itemId: z.string().min(1) });

characterRouter.post("/equip", async (req, res) => {
  const parsed = equipSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { user } = req as AuthedRequest;
  const character = await getOrCreateStarterCharacter(user.id, user.username);

  try {
    const updated = await equipItem(character, parsed.data.itemId);
    res.json(updated);
  } catch (err) {
    if (err instanceof EquipError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

const unequipSchema = z.object({ slot: z.enum(["weapon", "armor", "accessory"]) });

characterRouter.post("/unequip", async (req, res) => {
  const parsed = unequipSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { user } = req as AuthedRequest;
  const character = await getOrCreateStarterCharacter(user.id, user.username);
  const updated = await unequipSlot(character, parsed.data.slot);
  res.json(updated);
});
