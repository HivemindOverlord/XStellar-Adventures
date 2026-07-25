import jwt from "jsonwebtoken";
import type { AuthUser } from "@xstellar/shared";

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is not set");
}
const JWT_SECRET: string = process.env.JWT_SECRET;

const EXPIRES_IN = "7d";

export function signToken(user: AuthUser): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: EXPIRES_IN });
}

export function verifyToken(token: string): AuthUser {
  const decoded = jwt.verify(token, JWT_SECRET);
  if (typeof decoded === "string" || !("id" in decoded) || !("username" in decoded)) {
    throw new Error("Invalid token payload");
  }
  return { id: decoded.id as string, username: decoded.username as string };
}
