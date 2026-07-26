import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import {
  CharacterSlotError,
  createCharacter,
  getOrCreateStarterCharacter,
  listCharacters,
  persistCharacterProgress,
  selectCharacter,
} from "../game/starterCharacter.js";
import { EquipError, equipItem, listEquipmentInstances, unequipSlot } from "../game/equipment.js";
import { allocateStatPoint, StatAllocationError, type AllocatableStat } from "../game/statAllocation.js";

export const characterRouter = Router();

characterRouter.use(requireAuth);

characterRouter.get("/me", async (req, res) => {
  const { user } = req as AuthedRequest;
  const character = await getOrCreateStarterCharacter(user.id, user.username);
  const equipmentInstances = await listEquipmentInstances(character.id);
  res.json({ character, equipmentInstances });
});

characterRouter.get("/list", async (req, res) => {
  const { user } = req as AuthedRequest;
  const summary = await listCharacters(user.id);
  res.json(summary);
});

const createCharacterSchema = z.object({ name: z.string().min(1).max(40) });

characterRouter.post("/create", async (req, res) => {
  const parsed = createCharacterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { user } = req as AuthedRequest;
  try {
    const character = await createCharacter(user.id, parsed.data.name);
    res.status(201).json(character);
  } catch (err) {
    if (err instanceof CharacterSlotError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

const selectCharacterSchema = z.object({ characterId: z.string().min(1) });

characterRouter.post("/select", async (req, res) => {
  const parsed = selectCharacterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { user } = req as AuthedRequest;
  try {
    const character = await selectCharacter(user.id, parsed.data.characterId);
    res.json(character);
  } catch (err) {
    if (err instanceof CharacterSlotError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

const allocateStatSchema = z.object({
  stat: z.enum(["maxHp", "maxMp", "attack", "defense", "magic", "speed"]),
});

characterRouter.post("/allocate-stat", async (req, res) => {
  const parsed = allocateStatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { user } = req as AuthedRequest;
  const character = await getOrCreateStarterCharacter(user.id, user.username);

  try {
    const updated = allocateStatPoint(character, parsed.data.stat as AllocatableStat);
    await persistCharacterProgress(updated);
    res.json(updated);
  } catch (err) {
    if (err instanceof StatAllocationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

const equipSchema = z.object({ instanceId: z.string().min(1) });

characterRouter.post("/equip", async (req, res) => {
  const parsed = equipSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { user } = req as AuthedRequest;
  const character = await getOrCreateStarterCharacter(user.id, user.username);

  try {
    const updated = await equipItem(character, parsed.data.instanceId);
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
