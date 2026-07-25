import { randomUUID } from "node:crypto";
import type { Character } from "@xstellar/shared";

export interface QueuedPlayer {
  socketId: string;
  userId: string;
  character: Character;
}

export interface MatchedPair {
  battleId: string;
  players: [QueuedPlayer, QueuedPlayer];
}

const queue: QueuedPlayer[] = [];

export function enqueue(player: QueuedPlayer): MatchedPair | null {
  removeBySocketId(player.socketId);
  queue.push(player);

  if (queue.length < 2) {
    return null;
  }

  const [a, b] = queue.splice(0, 2) as [QueuedPlayer, QueuedPlayer];
  return { battleId: randomUUID(), players: [a, b] };
}

export function removeBySocketId(socketId: string): void {
  const index = queue.findIndex((p) => p.socketId === socketId);
  if (index !== -1) {
    queue.splice(index, 1);
  }
}
