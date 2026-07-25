import type { NextFunction, Request, Response } from "express";
import type { AuthUser } from "@xstellar/shared";
import { verifyToken } from "./jwt.js";

export interface AuthedRequest extends Request {
  user: AuthUser;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
  if (!token) {
    res.status(401).json({ error: "Missing auth token" });
    return;
  }

  try {
    (req as AuthedRequest).user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: "Invalid auth token" });
  }
}
