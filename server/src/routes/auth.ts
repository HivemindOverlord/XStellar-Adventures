import { Router } from "express";
import { z } from "zod";
import type { AuthResponse } from "@xstellar/shared";
import { prisma } from "../db/prisma.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { signToken } from "../auth/jwt.js";

const credentialsSchema = z.object({
  username: z.string().min(3).max(24),
  password: z.string().min(8).max(128),
});

export const authRouter = Router();

authRouter.post("/register", async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { username, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    res.status(409).json({ error: "Username already taken" });
    return;
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { username, passwordHash },
  });

  const token = signToken({ id: user.id, username: user.username });
  const response: AuthResponse = { token, user: { id: user.id, username: user.username } };
  res.status(201).json(response);
});

authRouter.post("/login", async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { username, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  const token = signToken({ id: user.id, username: user.username });
  const response: AuthResponse = { token, user: { id: user.id, username: user.username } };
  res.status(200).json(response);
});
