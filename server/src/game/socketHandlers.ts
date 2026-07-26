import { randomUUID } from "node:crypto";
import type { Server, Socket } from "socket.io";
import type {
  BattleActionType,
  BattleState,
  ClientToServerEvents,
  Combatant,
  ServerToClientEvents,
} from "@xstellar/shared";
import { CAMPAIGN_CHAPTERS, computeEffectiveStats, EQUIPMENT } from "@xstellar/shared";
import { verifyToken } from "../auth/jwt.js";
import { getOrCreateStarterCharacter, persistCharacterProgress } from "./starterCharacter.js";
import { appendNote, applyAction, createBattle, forfeitBattle, IllegalActionError } from "./battleEngine.js";
import { enqueue, removeBySocketId, type MatchedPair, type QueuedPlayer } from "./matchmaking.js";
import { grantBattleRewards } from "./progression.js";
import { createBotOpponent, isBotCharacter } from "./botCharacter.js";
import { computeEffectivePowerScore } from "./powerScore.js";
import { getEquippedInstances } from "./equipment.js";
import {
  buildCampaignBossCombatant,
  CampaignChapterError,
  isCampaignBossCharacter,
  resolveCampaignBattle,
} from "./campaignEngine.js";
import { chooseCampaignAiAction, classifyPlayerActionLean } from "./campaignAi.js";

interface SocketData {
  userId: string;
  username: string;
}

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const FORFEIT_GRACE_MS = 45_000;
const AI_TURN_DELAY_MS = 1_200;

const battleRoomOf = new Map<string, string>(); // socketId -> battleId
const battleRoomOfUser = new Map<string, string>(); // userId -> battleId, survives socket reconnects
const battleStates = new Map<string, BattleState>();
const forfeitTimers = new Map<string, ReturnType<typeof setTimeout>>(); // userId -> pending forfeit

// Shared tracking for any AI-controlled opponent (Story & PvE Campaign boss or a PvP
// matchmaking bot fallback) — both are driven by campaignAi's chooseCampaignAiAction, so both
// need the same rolling window of the player's recent action types. campaignChapterId is set
// only for genuine campaign battles, gating the chapter-specific reward/memory handling below.
interface AiOpponentMeta {
  recentPlayerActionTypes: BattleActionType[];
  campaignChapterId?: string;
}
const aiOpponentMeta = new Map<string, AiOpponentMeta>(); // battleId -> ai opponent metadata
const AI_HISTORY_WINDOW = 3;

export function registerSocketHandlers(io: AppServer): void {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== "string") {
      next(new Error("Missing auth token"));
      return;
    }
    try {
      const user = verifyToken(token);
      socket.data.userId = user.id;
      socket.data.username = user.username;
      next();
    } catch {
      next(new Error("Invalid auth token"));
    }
  });

  io.on("connection", (socket: AppSocket) => {
    handleReconnect(io, socket);

    socket.on("queue:join", () => void handleQueueJoin(io, socket));
    socket.on("queue:leave", () => removeBySocketId(socket.id));
    socket.on("battle:action", (action) => handleBattleAction(io, socket, action));
    socket.on("campaign:start", (chapterId) => void handleCampaignStart(io, socket, chapterId));
    socket.on("disconnect", () => handleDisconnect(io, socket));
  });
}

function handleReconnect(io: AppServer, socket: AppSocket): void {
  const battleId = battleRoomOfUser.get(socket.data.userId);
  const state = battleId ? battleStates.get(battleId) : undefined;
  if (!battleId || !state || state.phase !== "in-progress") {
    return;
  }

  const timer = forfeitTimers.get(socket.data.userId);
  if (timer) {
    clearTimeout(timer);
    forfeitTimers.delete(socket.data.userId);
  }

  battleRoomOf.set(socket.id, battleId);
  void socket.join(battleId);

  const combatant = state.combatants.find((c) => c.character.ownerId === socket.data.userId);
  const nextState = combatant ? appendNote(state, combatant.id, `${combatant.character.name} reconnected`) : state;
  battleStates.set(battleId, nextState);

  socket.emit("battle:start", nextState);
  socket.to(battleId).emit("battle:state", nextState);
}

async function handleQueueJoin(io: AppServer, socket: AppSocket): Promise<void> {
  if (battleRoomOfUser.has(socket.data.userId)) {
    socket.emit("error", "You are already in a battle");
    return;
  }

  const character = await getOrCreateStarterCharacter(socket.data.userId, socket.data.username);
  const equipmentInstances = await getEquippedInstances(character);
  const powerScore = computeEffectivePowerScore(character, equipmentInstances);
  socket.emit("queue:joined");

  enqueue(
    {
      socketId: socket.id,
      userId: socket.data.userId,
      character,
      powerScore,
      allowBotMatches: character.allowBotMatches,
      equipmentInstances,
    },
    (lonePlayer) => void startBotBattle(io, lonePlayer),
    (match) => void startHumanBattle(io, match),
  );
}

async function startHumanBattle(io: AppServer, match: MatchedPair): Promise<void> {
  const [playerA, playerB] = match.players;

  // Side is a fixed slot for this battle instance ("party" = first queued), not an
  // ownership label — each client renders its own character by matching ownerId.
  const combatants: Combatant[] = [
    {
      id: playerA.character.id,
      character: playerA.character,
      side: "party",
      isDefending: false,
      isDefeated: false,
      equipmentInstances: playerA.equipmentInstances,
    },
    {
      id: playerB.character.id,
      character: playerB.character,
      side: "enemy",
      isDefending: false,
      isDefeated: false,
      equipmentInstances: playerB.equipmentInstances,
    },
  ];

  for (const player of match.players) {
    battleRoomOf.set(player.socketId, match.battleId);
    battleRoomOfUser.set(player.userId, match.battleId);
    io.sockets.sockets.get(player.socketId)?.join(match.battleId);
  }

  beginBattle(io, match.battleId, combatants);
}

async function startBotBattle(io: AppServer, player: QueuedPlayer): Promise<void> {
  const socket = io.sockets.sockets.get(player.socketId);
  if (!socket || battleRoomOfUser.has(player.userId)) return;

  const battleId = randomUUID();
  const playerEffectiveStats = computeEffectiveStats(player.character, EQUIPMENT, player.equipmentInstances);
  const bot = createBotOpponent(player.character, playerEffectiveStats);
  const combatants: Combatant[] = [
    {
      id: player.character.id,
      character: player.character,
      side: "party",
      isDefending: false,
      isDefeated: false,
      equipmentInstances: player.equipmentInstances,
    },
    {
      id: bot.id,
      character: bot,
      side: "enemy",
      isDefending: false,
      isDefeated: false,
      equipmentInstances: [],
    },
  ];

  battleRoomOf.set(player.socketId, battleId);
  battleRoomOfUser.set(player.userId, battleId);
  void socket.join(battleId);
  aiOpponentMeta.set(battleId, { recentPlayerActionTypes: [] });

  beginBattle(io, battleId, combatants, { isBotMatch: true });
  maybeTakeAiOpponentTurn(io, battleId);
}

async function handleCampaignStart(io: AppServer, socket: AppSocket, chapterId: string): Promise<void> {
  if (battleRoomOfUser.has(socket.data.userId)) {
    socket.emit("error", "You are already in a battle");
    return;
  }
  if (!CAMPAIGN_CHAPTERS[chapterId]) {
    socket.emit("error", "Unknown chapter");
    return;
  }

  const character = await getOrCreateStarterCharacter(socket.data.userId, socket.data.username);
  const playerInstances = await getEquippedInstances(character);

  let bossCombatant: Combatant;
  try {
    bossCombatant = buildCampaignBossCombatant(chapterId, character);
  } catch (err) {
    if (err instanceof CampaignChapterError) {
      socket.emit("error", err.message);
      return;
    }
    throw err;
  }

  const combatants: Combatant[] = [
    {
      id: character.id,
      character,
      side: "party",
      isDefending: false,
      isDefeated: false,
      equipmentInstances: playerInstances,
    },
    bossCombatant,
  ];

  const battleId = randomUUID();
  battleRoomOf.set(socket.id, battleId);
  battleRoomOfUser.set(socket.data.userId, battleId);
  void socket.join(battleId);
  aiOpponentMeta.set(battleId, { recentPlayerActionTypes: [], campaignChapterId: chapterId });

  beginBattle(io, battleId, combatants);
  maybeTakeAiOpponentTurn(io, battleId);
}

function beginBattle(io: AppServer, battleId: string, combatants: Combatant[], options: { isBotMatch?: boolean } = {}): void {
  const state: BattleState = { ...createBattle(battleId, combatants), isBotMatch: options.isBotMatch ?? false };
  battleStates.set(battleId, state);
  io.to(battleId).emit("battle:start", state);
}

// Drives the active combatant's turn whenever it belongs to an AI-controlled opponent —
// either a Story & PvE Campaign boss or a PvP matchmaking bot fallback. Both use the same
// campaignAi module (no separate bot AI implementation).
function maybeTakeAiOpponentTurn(io: AppServer, battleId: string): void {
  const state = battleStates.get(battleId);
  const meta = aiOpponentMeta.get(battleId);
  if (!state || !meta || state.phase !== "in-progress") return;

  const active = state.combatants.find((c) => c.id === state.activeCombatantId);
  if (!active || !(isCampaignBossCharacter(active.character) || isBotCharacter(active.character))) return;

  setTimeout(() => {
    const current = battleStates.get(battleId);
    const currentMeta = aiOpponentMeta.get(battleId);
    if (!current || !currentMeta || current.phase !== "in-progress" || current.activeCombatantId !== active.id) return;

    const action = chooseCampaignAiAction(current, active, currentMeta.recentPlayerActionTypes);
    const nextState = applyAction(current, action);

    if (nextState.phase === "in-progress") {
      battleStates.set(battleId, nextState);
      io.to(battleId).emit("battle:state", nextState);
      maybeTakeAiOpponentTurn(io, battleId);
      return;
    }

    void finishAnyBattle(io, battleId, nextState);
  }, AI_TURN_DELAY_MS);
}

// Records a just-succeeded player action into this fight's rolling defend-watch window (read
// by campaignAi's "punish turtling" rule) and, for genuine campaign battles only, into the
// character's cross-attempt physical/magical lean tally for that chapter's boss.
function recordAiOpponentPlayerAction(nextState: BattleState, action: Parameters<ClientToServerEvents["battle:action"]>[0], meta: AiOpponentMeta): void {
  const actor = nextState.combatants.find((c) => c.id === action.actorId);
  if (!actor || isCampaignBossCharacter(actor.character) || isBotCharacter(actor.character)) return;

  meta.recentPlayerActionTypes.push(action.type);
  if (meta.recentPlayerActionTypes.length > AI_HISTORY_WINDOW) {
    meta.recentPlayerActionTypes.shift();
  }

  if (!meta.campaignChapterId) return;

  const lean = classifyPlayerActionLean(action);
  if (lean === "other") return;

  const existing = actor.character.campaignBossMemory[meta.campaignChapterId] ?? { physical: 0, magical: 0 };
  actor.character.campaignBossMemory = {
    ...actor.character.campaignBossMemory,
    [meta.campaignChapterId]: { ...existing, [lean]: existing[lean] + 1 },
  };
}

async function finishAnyBattle(io: AppServer, battleId: string, state: BattleState): Promise<void> {
  const meta = aiOpponentMeta.get(battleId);
  if (meta?.campaignChapterId) {
    await finishCampaignBattle(io, battleId, state, meta.campaignChapterId);
    return;
  }
  await finishBattle(io, battleId, state);
}

async function finishCampaignBattle(io: AppServer, battleId: string, state: BattleState, chapterId: string): Promise<void> {
  const finalState = await resolveCampaignBattle(state, chapterId);
  io.to(battleId).emit("battle:end", finalState);
  cleanupBattle(battleId);
}

function handleBattleAction(io: AppServer, socket: AppSocket, action: Parameters<ClientToServerEvents["battle:action"]>[0]): void {
  const battleId = battleRoomOf.get(socket.id);
  const state = battleId ? battleStates.get(battleId) : undefined;
  if (!battleId || !state) {
    socket.emit("error", "You are not currently in a battle");
    return;
  }

  try {
    const nextState = applyAction(state, action);

    const meta = aiOpponentMeta.get(battleId);
    if (meta) {
      recordAiOpponentPlayerAction(nextState, action, meta);
    }

    if (nextState.phase === "in-progress") {
      battleStates.set(battleId, nextState);
      io.to(battleId).emit("battle:state", nextState);
      maybeTakeAiOpponentTurn(io, battleId);
      return;
    }

    void finishAnyBattle(io, battleId, nextState);
  } catch (err) {
    const message = err instanceof IllegalActionError ? err.message : "Unexpected battle error";
    socket.emit("error", message);
  }
}

function handleDisconnect(io: AppServer, socket: AppSocket): void {
  removeBySocketId(socket.id);

  const battleId = battleRoomOf.get(socket.id);
  battleRoomOf.delete(socket.id);

  const state = battleId ? battleStates.get(battleId) : undefined;
  if (!battleId || !state || state.phase !== "in-progress") {
    return;
  }

  const userId = socket.data.userId;
  const combatant = state.combatants.find((c) => c.character.ownerId === userId);
  if (!combatant) return;

  const notedState = appendNote(
    state,
    combatant.id,
    `${combatant.character.name} disconnected. They have ${FORFEIT_GRACE_MS / 1000}s to reconnect before forfeiting.`,
  );
  battleStates.set(battleId, notedState);
  io.to(battleId).emit("battle:state", notedState);

  const timer = setTimeout(() => {
    forfeitTimers.delete(userId);
    const current = battleStates.get(battleId);
    if (!current || current.phase !== "in-progress") return;

    const forfeited = forfeitBattle(current, combatant.id);
    void finishAnyBattle(io, battleId, forfeited);
  }, FORFEIT_GRACE_MS);
  forfeitTimers.set(userId, timer);
}

async function finishBattle(io: AppServer, battleId: string, state: BattleState): Promise<void> {
  const rewards = await grantBattleRewards(state);
  const finalState: BattleState = { ...state, rewards };

  await Promise.all(
    finalState.combatants
      .filter((c) => !isBotCharacter(c.character))
      .map((c) => persistCharacterProgress(c.character)),
  );

  io.to(battleId).emit("battle:end", finalState);
  cleanupBattle(battleId);
}

function cleanupBattle(battleId: string): void {
  battleStates.delete(battleId);
  aiOpponentMeta.delete(battleId);

  for (const [socketId, roomId] of battleRoomOf) {
    if (roomId === battleId) battleRoomOf.delete(socketId);
  }

  for (const [userId, roomId] of battleRoomOfUser) {
    if (roomId !== battleId) continue;
    battleRoomOfUser.delete(userId);
    const timer = forfeitTimers.get(userId);
    if (timer) {
      clearTimeout(timer);
      forfeitTimers.delete(userId);
    }
  }
}
