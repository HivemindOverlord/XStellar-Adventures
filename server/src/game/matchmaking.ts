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
// Brief hold before pairing off the queue so players close in win streak can
// be matched together instead of strict FIFO; kept well under the bot timeout.
export const STREAK_MATCH_HOLD_MS = 3_000;

const queue: QueuedPlayer[] = [];
const botTimers = new Map<string, ReturnType<typeof setTimeout>>(); // socketId -> pending bot fallback
let holdTimer: ReturnType<typeof setTimeout> | null = null;

export function enqueue(
  player: QueuedPlayer,
  onBotTimeout: (player: QueuedPlayer) => void,
  onMatch: (match: MatchedPair) => void,
): void {
  removeBySocketId(player.socketId);
  queue.push(player);

  botTimers.set(
    player.socketId,
    setTimeout(() => {
      botTimers.delete(player.socketId);
      removeBySocketId(player.socketId);
      onBotTimeout(player);
    }, BOT_MATCH_TIMEOUT_MS),
  );

  if (!holdTimer) {
    holdTimer = setTimeout(() => {
      holdTimer = null;
      pairQueuedPlayers(onMatch);
    }, STREAK_MATCH_HOLD_MS);
  }
}

export function removeBySocketId(socketId: string): void {
  const index = queue.findIndex((p) => p.socketId === socketId);
  if (index !== -1) {
    queue.splice(index, 1);
  }
  clearBotTimer(socketId);
}

function pairQueuedPlayers(onMatch: (match: MatchedPair) => void): void {
  while (queue.length >= 2) {
    const player = queue.shift() as QueuedPlayer;
    const opponent = queue.splice(closestStreakIndex(player.character.winStreak), 1)[0];
    clearBotTimer(player.socketId);
    clearBotTimer(opponent.socketId);
    onMatch({ battleId: randomUUID(), players: [player, opponent] });
  }
}

function closestStreakIndex(winStreak: number): number {
  let bestIndex = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < queue.length; i++) {
    const diff = Math.abs(queue[i].character.winStreak - winStreak);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = i;
    }
  }
  return bestIndex;
}

function clearBotTimer(socketId: string): void {
  const timer = botTimers.get(socketId);
  if (timer) {
    clearTimeout(timer);
    botTimers.delete(socketId);
  }
}
