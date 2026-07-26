import { randomUUID } from "node:crypto";
import type { Character, EquipmentInstance } from "@xstellar/shared";

export interface QueuedPlayer {
  socketId: string;
  userId: string;
  character: Character;
  powerScore: number;
  allowBotMatches: boolean;
  equipmentInstances: EquipmentInstance[];
}

interface QueueEntry extends QueuedPlayer {
  enqueuedAt: number;
}

export interface MatchedPair {
  battleId: string;
  players: [QueuedPlayer, QueuedPlayer];
}

export const BOT_MATCH_TIMEOUT_MS = 10_000;

// Widening-bracket matchmaking, tunable starting point — not final balance. A pair is
// acceptable once their power-score gap is within `bandWidth` of the higher of the two
// scores; bandWidth starts narrow and relaxes the longer either side has waited, bounded
// overall by BOT_MATCH_TIMEOUT_MS (a player who allows bot matches always gets an opponent
// by then regardless of how wide the bracket has grown).
const BASE_BAND_FRACTION = 0.15; // +/-15% at zero wait
const BAND_WIDENING_PER_SECOND = 0.05; // +5% band width per second either side has waited

const PAIRING_TICK_MS = 1_000;

const queue: QueueEntry[] = [];
const botTimers = new Map<string, ReturnType<typeof setTimeout>>(); // socketId -> pending bot fallback
let pairingTicker: ReturnType<typeof setInterval> | null = null;

export function enqueue(
  player: QueuedPlayer,
  onBotTimeout: (player: QueuedPlayer) => void,
  onMatch: (match: MatchedPair) => void,
): void {
  removeBySocketId(player.socketId);
  queue.push({ ...player, enqueuedAt: Date.now() });

  if (player.allowBotMatches) {
    botTimers.set(
      player.socketId,
      setTimeout(() => {
        botTimers.delete(player.socketId);
        removeBySocketId(player.socketId);
        onBotTimeout(player);
      }, BOT_MATCH_TIMEOUT_MS),
    );
  }

  attemptPairing(onMatch);
  ensurePairingTicker(onMatch);
}

export function removeBySocketId(socketId: string): void {
  const index = queue.findIndex((p) => p.socketId === socketId);
  if (index !== -1) {
    queue.splice(index, 1);
  }
  clearBotTimer(socketId);
  if (queue.length === 0) stopPairingTicker();
}

// Re-checks the bracket on a fixed cadence so two already-waiting players can still be
// paired purely because their band has widened over time, without needing a new join event.
function ensurePairingTicker(onMatch: (match: MatchedPair) => void): void {
  if (pairingTicker) return;
  pairingTicker = setInterval(() => attemptPairing(onMatch), PAIRING_TICK_MS);
}

function stopPairingTicker(): void {
  if (pairingTicker) {
    clearInterval(pairingTicker);
    pairingTicker = null;
  }
}

function attemptPairing(onMatch: (match: MatchedPair) => void): void {
  const now = Date.now();

  let match = findBestMatch(now);
  while (match) {
    const [a, b] = match;
    queue.splice(queue.indexOf(a), 1);
    queue.splice(queue.indexOf(b), 1);
    clearBotTimer(a.socketId);
    clearBotTimer(b.socketId);
    onMatch({ battleId: randomUUID(), players: [a, b] });
    match = findBestMatch(now);
  }

  if (queue.length === 0) stopPairingTicker();
}

// Queue order is join order, so scanning `a` from the front gives whoever has waited
// longest first pick of their best available opponent.
function findBestMatch(now: number): [QueueEntry, QueueEntry] | null {
  for (const a of queue) {
    let best: QueueEntry | null = null;
    let bestDiff = Infinity;
    for (const b of queue) {
      if (b === a || !isAcceptableMatch(a, b, now)) continue;
      const diff = Math.abs(a.powerScore - b.powerScore);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = b;
      }
    }
    if (best) return [a, best];
  }
  return null;
}

function isAcceptableMatch(a: QueueEntry, b: QueueEntry, now: number): boolean {
  const longestWaitSeconds = Math.max(now - a.enqueuedAt, now - b.enqueuedAt) / 1000;
  const bandWidth = BASE_BAND_FRACTION + longestWaitSeconds * BAND_WIDENING_PER_SECOND;
  const referenceScore = Math.max(a.powerScore, b.powerScore, 1);
  return Math.abs(a.powerScore - b.powerScore) <= referenceScore * bandWidth;
}

function clearBotTimer(socketId: string): void {
  const timer = botTimers.get(socketId);
  if (timer) {
    clearTimeout(timer);
    botTimers.delete(socketId);
  }
}
