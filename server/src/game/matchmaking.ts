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

export const BOT_MATCH_TIMEOUT_MS = 10_000;

const queue: QueuedPlayer[] = [];
const botTimers = new Map<string, ReturnType<typeof setTimeout>>(); // socketId -> pending bot fallback

export function enqueue(player: QueuedPlayer, onBotTimeout: (player: QueuedPlayer) => void): MatchedPair | null {
  removeBySocketId(player.socketId);
  queue.push(player);

  if (queue.length < 2) {
    botTimers.set(
      player.socketId,
      setTimeout(() => {
        botTimers.delete(player.socketId);
        removeBySocketId(player.socketId);
        onBotTimeout(player);
      }, BOT_MATCH_TIMEOUT_MS),
    );
    return null;
  }

  const [a, b] = queue.splice(0, 2) as [QueuedPlayer, QueuedPlayer];
  clearBotTimer(a.socketId);
  clearBotTimer(b.socketId);
  return { battleId: randomUUID(), players: [a, b] };
}

export function removeBySocketId(socketId: string): void {
  const index = queue.findIndex((p) => p.socketId === socketId);
  if (index !== -1) {
    queue.splice(index, 1);
  }
  clearBotTimer(socketId);
}

function clearBotTimer(socketId: string): void {
  const timer = botTimers.get(socketId);
  if (timer) {
    clearTimeout(timer);
    botTimers.delete(socketId);
  }
}
