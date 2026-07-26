import { randomUUID } from "node:crypto";
import type { Server, Socket } from "socket.io";
import type {
  BattleActionType,
  BattleState,
  ClientToServerEvents,
  Combatant,
  ServerToClientEvents,
} from "@xstellar/shared";
import { CAMPAIGN_CHAPTERS, computeEffectiveStats, computePowerScore, EQUIPMENT } from "@xstellar/shared";
import { verifyToken } from "../auth/jwt.js";
import { getOrCreateStarterCharacter, persistCharacterProgress } from "./starterCharacter.js";
import { appendNote, applyAction, createBattle, forfeitBattle, IllegalActionError } from "./battleEngine.js";
import { enqueue, removeBySocketId, type MatchedPair, type QueuedPlayer } from "./matchmaking.js";
import { grantBattleRewards } from "./progression.js";
import { createBotOpponent, isBotCharacter } from "./botCharacter.js";
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
const BOT_TURN_DELAY_MS = 1_200;

const battleRoomOf = new Map<string, string>(); // socketId -> battleId
const battleRoomOfUser = new Map<string, string>(); // userId -> battleId, survives socket reconnects
const battleStates = new Map<string, BattleState>();
const forfeitTimers = new Map<string, ReturnType<typeof setTimeout>>(); // userId -> pending forfeit

interface CampaignMeta {
  chapterId: string;
  // Rolling window of the player's own recent action types this fight, capped at 3 — read by
  // campaignAi's "punish turtling" rule.
  recentPlayerActionTypes: BattleActionType[];
}
const campaignMeta = new Map<string, CampaignMeta>(); // battleId -> campaign metadata
const CAMPAIGN_HISTORY_WINDOW = 3;

// PvP-queue bot fallback reuses the Story & PvE Campaign agent's adaptive AI module
// (campaignAi.ts) rather than a second AI implementation, so it needs the same rolling
// action-history window that module's "punish turtling" rule reads.
interface PvpBotMeta {
  recentPlayerActionTypes: BattleActionType[];
}
const pvpBotMeta = new Map<string, PvpBotMeta>(); // battleId -> pvp-bot metadata

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
  const instances = await getEquippedInstances(character);
  const powerScore = computePowerScore(character.level, computeEffectiveStats(character, EQUIPMENT, instances));
  socket.emit("queue:joined");

  enqueue(
    { socketId: socket.id, userId: socket.data.userId, character, powerScore },
    (lonePlayer) => void startBotBattle(io, lonePlayer),
    (match) => void startHumanBattle(io, match),
  );
}

async function startHumanBattle(io: AppServer, match: MatchedPair): Promise<void> {
  const [playerA, playerB] = match.players;
  const [instancesA, instancesB] = await Promise.all([
    getEquippedInstances(playerA.character),
    getEquippedInstances(playerB.character),
  ]);

  // Side is a fixed slot for this battle instance ("party" = first queued), not an
  // ownership label — each client renders its own character by matching ownerId.
  const combatants: Combatant[] = [
    {
      id: playerA.character.id,
      character: playerA.character,
      side: "party",
      isDefending: false,
      isDefeated: false,
      equipmentInstances: instancesA,
    },
    {
      id: playerB.character.id,
      character: playerB.character,
      side: "enemy",
      isDefending: false,
      isDefeated: false,
      equipmentInstances: instancesB,
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
  const bot = createBotOpponent(player.character, player.powerScore);
  const playerInstances = await getEquippedInstances(player.character);
  const combatants: Combatant[] = [
    {
      id: player.character.id,
      character: player.character,
      side: "party",
      isDefending: false,
      isDefeated: false,
      equipmentInstances: playerInstances,
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
  pvpBotMeta.set(battleId, { recentPlayerActionTypes: [] });

  beginBattle(io, battleId, combatants, true);
  maybeTakePvpBotTurn(io, battleId);
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
  campaignMeta.set(battleId, { chapterId, recentPlayerActionTypes: [] });

  beginBattle(io, battleId, combatants);
  maybeTakeCampaignAiTurn(io, battleId);
}

function beginBattle(io: AppServer, battleId: string, combatants: Combatant[], isBotMatch = false): void {
  const state = createBattle(battleId, combatants);
  const startState = isBotMatch ? { ...state, isBotMatch: true } : state;
  battleStates.set(battleId, startState);
  io.to(battleId).emit("battle:start", startState);
}

// PvP-queue bot fallback. Turn selection reuses the Story & PvE Campaign agent's adaptive AI
// module (chooseCampaignAiAction) rather than a separate implementation — see maybeTakeCampaignAiTurn
// below for the sibling campaign-boss version.
function maybeTakePvpBotTurn(io: AppServer, battleId: string): void {
  const meta = pvpBotMeta.get(battleId);
  const state = battleStates.get(battleId);
  if (!meta || !state || state.phase !== "in-progress") return;

  const active = state.combatants.find((c) => c.id === state.activeCombatantId);
  if (!active || !isBotCharacter(active.character)) return;

  setTimeout(() => {
    const current = battleStates.get(battleId);
    const currentMeta = pvpBotMeta.get(battleId);
    if (!current || !currentMeta || current.phase !== "in-progress" || current.activeCombatantId !== active.id) return;

    const action = chooseCampaignAiAction(current, active, currentMeta.recentPlayerActionTypes);
    const nextState = applyAction(current, action);

    if (nextState.phase === "in-progress") {
      battleStates.set(battleId, nextState);
      io.to(battleId).emit("battle:state", nextState);
      maybeTakePvpBotTurn(io, battleId);
      return;
    }

    void finishBattle(io, battleId, nextState);
  }, BOT_TURN_DELAY_MS);
}

function maybeTakeCampaignAiTurn(io: AppServer, battleId: string): void {
  const meta = campaignMeta.get(battleId);
  const state = battleStates.get(battleId);
  if (!meta || !state || state.phase !== "in-progress") return;

  const active = state.combatants.find((c) => c.id === state.activeCombatantId);
  if (!active || !isCampaignBossCharacter(active.character)) return;

  setTimeout(() => {
    const current = battleStates.get(battleId);
    const currentMeta = campaignMeta.get(battleId);
    if (!current || !currentMeta || current.phase !== "in-progress" || current.activeCombatantId !== active.id) return;

    const action = chooseCampaignAiAction(current, active, currentMeta.recentPlayerActionTypes);
    const nextState = applyAction(current, action);

    if (nextState.phase === "in-progress") {
      battleStates.set(battleId, nextState);
      io.to(battleId).emit("battle:state", nextState);
      maybeTakeCampaignAiTurn(io, battleId);
      return;
    }

    void finishCampaignBattle(io, battleId, nextState, currentMeta.chapterId);
  }, BOT_TURN_DELAY_MS);
}

// Records a just-succeeded player action into this fight's rolling defend-watch window and
// into the character's cross-attempt physical/magical lean tally for this chapter's boss.
function recordCampaignPlayerAction(nextState: BattleState, action: Parameters<ClientToServerEvents["battle:action"]>[0], meta: CampaignMeta): void {
  const actor = nextState.combatants.find((c) => c.id === action.actorId);
  if (!actor || isCampaignBossCharacter(actor.character)) return;

  meta.recentPlayerActionTypes.push(action.type);
  if (meta.recentPlayerActionTypes.length > CAMPAIGN_HISTORY_WINDOW) {
    meta.recentPlayerActionTypes.shift();
  }

  const lean = classifyPlayerActionLean(action);
  if (lean === "other") return;

  const existing = actor.character.campaignBossMemory[meta.chapterId] ?? { physical: 0, magical: 0 };
  actor.character.campaignBossMemory = {
    ...actor.character.campaignBossMemory,
    [meta.chapterId]: { ...existing, [lean]: existing[lean] + 1 },
  };
}

// Same rolling defend-watch window as recordCampaignPlayerAction, minus the campaign-specific
// boss-memory tally (PvP bots don't accrue campaignBossMemory).
function recordPvpBotPlayerAction(nextState: BattleState, action: Parameters<ClientToServerEvents["battle:action"]>[0], meta: PvpBotMeta): void {
  const actor = nextState.combatants.find((c) => c.id === action.actorId);
  if (!actor || isBotCharacter(actor.character)) return;

  meta.recentPlayerActionTypes.push(action.type);
  if (meta.recentPlayerActionTypes.length > CAMPAIGN_HISTORY_WINDOW) {
    meta.recentPlayerActionTypes.shift();
  }
}

async function finishAnyBattle(io: AppServer, battleId: string, state: BattleState): Promise<void> {
  const meta = campaignMeta.get(battleId);
  if (meta) {
    await finishCampaignBattle(io, battleId, state, meta.chapterId);
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

    const meta = campaignMeta.get(battleId);
    if (meta) {
      recordCampaignPlayerAction(nextState, action, meta);
    }
    const botMeta = pvpBotMeta.get(battleId);
    if (botMeta) {
      recordPvpBotPlayerAction(nextState, action, botMeta);
    }

    if (nextState.phase === "in-progress") {
      battleStates.set(battleId, nextState);
      io.to(battleId).emit("battle:state", nextState);
      maybeTakePvpBotTurn(io, battleId);
      maybeTakeCampaignAiTurn(io, battleId);
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
  campaignMeta.delete(battleId);
  pvpBotMeta.delete(battleId);

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
