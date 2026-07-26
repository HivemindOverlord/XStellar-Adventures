import { randomUUID } from "node:crypto";
import type { Character } from "@xstellar/shared";

export interface QueuedPlayer {
  socketId: string;
  userId: string;
  character: Character;
  // Computed by the caller via computePowerScore() from EFFECTIVE stats (base + equipped
  // gear), since resolving equipment is an async DB lookup this module shouldn't own.
  powerScore: number;
}

interface InternalQueuedPlayer extends QueuedPlayer {
  enqueuedAt: number;
}

export interface MatchedPair {
  battleId: string;
  players: [QueuedPlayer, QueuedPlayer];
}

export const BOT_MATCH_TIMEOUT_MS = 10_000;

// Widening-bracket matchmaking: a newly queued player is first willing to match within
// +/-15% of their own power score. For every second either side of a potential pairing has
// waited, the acceptable band widens by another 5% (of that side's own power score), so a
// thin population still converges on a match instead of waiting forever. Tunable starting
// values, not final balance — revisit alongside shared/src/matchmaking.ts's power-score
// formula once real PvP population data exists.
const BASE_BAND_PCT = 0.15;
const WIDEN_PCT_PER_SECOND = 0.05;
// How often we re-scan the whole queue for pairings that have become acceptable purely
// because the band widened, independent of any new player joining.
const SWEEP_INTERVAL_MS = 1_000;

const queue: InternalQueuedPlayer[] = [];
const botTimers = new Map<string, ReturnType<typeof setTimeout>>(); // socketId -> pending bot fallback
let sweepTimer: ReturnType<typeof setInterval> | null = null;
let matchCallback: ((match: MatchedPair) => void) | null = null;

export function enqueue(
  player: QueuedPlayer,
  onBotTimeout: (player: QueuedPlayer) => void,
  onMatch: (match: MatchedPair) => void,
): void {
  removeBySocketId(player.socketId);
  matchCallback = onMatch;

  const candidate: InternalQueuedPlayer = { ...player, enqueuedAt: Date.now() };
  const opponentIndex = findBestOpponentIndex(candidate, candidate.enqueuedAt, -1);
  if (opponentIndex !== -1) {
    const opponent = queue.splice(opponentIndex, 1)[0];
    clearBotTimer(opponent.socketId);
    onMatch({ battleId: randomUUID(), players: [candidate, opponent] });
    stopSweepTimerIfIdle();
    return;
  }

  queue.push(candidate);

  if (player.character.allowBotMatches) {
    botTimers.set(
      player.socketId,
      setTimeout(() => {
        botTimers.delete(player.socketId);
        removeBySocketId(player.socketId);
        onBotTimeout(player);
      }, BOT_MATCH_TIMEOUT_MS),
    );
  }

  ensureSweepTimer();
}

export function removeBySocketId(socketId: string): void {
  const index = queue.findIndex((p) => p.socketId === socketId);
  if (index !== -1) {
    queue.splice(index, 1);
  }
  clearBotTimer(socketId);
  stopSweepTimerIfIdle();
}

// Finds the closest-power-score queued player within the acceptable band for `target`,
// excluding queue[excludeIndex] (used when target is itself already queued, e.g. from sweepQueue).
function findBestOpponentIndex(target: InternalQueuedPlayer, now: number, excludeIndex: number): number {
  let bestIndex = -1;
  let bestDiff = Infinity;
  for (let i = 0; i < queue.length; i++) {
    if (i === excludeIndex) continue;
    const candidate = queue[i];
    const diff = Math.abs(candidate.powerScore - target.powerScore);
    if (diff <= acceptableBandWidth(candidate, target, now) && diff < bestDiff) {
      bestDiff = diff;
      bestIndex = i;
    }
  }
  return bestIndex;
}

function acceptableBandWidth(a: InternalQueuedPlayer, b: InternalQueuedPlayer, now: number): number {
  const bandOf = (p: InternalQueuedPlayer) =>
    p.powerScore * (BASE_BAND_PCT + WIDEN_PCT_PER_SECOND * ((now - p.enqueuedAt) / 1000));
  return Math.max(bandOf(a), bandOf(b));
}

function ensureSweepTimer(): void {
  if (sweepTimer || queue.length < 2) return;
  sweepTimer = setInterval(sweepQueue, SWEEP_INTERVAL_MS);
}

function stopSweepTimerIfIdle(): void {
  if (sweepTimer && queue.length < 2) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}

function sweepQueue(): void {
  if (!matchCallback) return;
  const now = Date.now();

  let i = 0;
  while (i < queue.length) {
    const opponentIndex = findBestOpponentIndex(queue[i], now, i);
    if (opponentIndex === -1) {
      i++;
      continue;
    }

    const [lowIndex, highIndex] = i < opponentIndex ? [i, opponentIndex] : [opponentIndex, i];
    const second = queue.splice(highIndex, 1)[0];
    const first = queue.splice(lowIndex, 1)[0];
    clearBotTimer(first.socketId);
    clearBotTimer(second.socketId);
    matchCallback({ battleId: randomUUID(), players: [first, second] });
    // Don't advance i: the element that shifted into this slot hasn't been checked yet.
  }

  stopSweepTimerIfIdle();
}

function clearBotTimer(socketId: string): void {
  const timer = botTimers.get(socketId);
  if (timer) {
    clearTimeout(timer);
    botTimers.delete(socketId);
  }
}
