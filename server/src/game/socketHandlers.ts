import { randomUUID } from "node:crypto";
import type { Server, Socket } from "socket.io";
import type {
  BattleState,
  ClientToServerEvents,
  Combatant,
  ServerToClientEvents,
} from "@xstellar/shared";
import { verifyToken } from "../auth/jwt.js";
import { getOrCreateStarterCharacter, persistCharacterProgress } from "./starterCharacter.js";
import { appendNote, applyAction, createBattle, forfeitBattle, IllegalActionError } from "./battleEngine.js";
import { enqueue, removeBySocketId, type MatchedPair, type QueuedPlayer } from "./matchmaking.js";
import { grantBattleRewards } from "./progression.js";
import { createBotOpponent, isBotCharacter } from "./botCharacter.js";
import { chooseBotAction } from "./botAi.js";
import { getEquippedInstances } from "./equipment.js";

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
  socket.emit("queue:joined");

  enqueue(
    { socketId: socket.id, userId: socket.data.userId, character },
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
  const bot = createBotOpponent(player.character);
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

  beginBattle(io, battleId, combatants);
  maybeTakeBotTurn(io, battleId);
}

function beginBattle(io: AppServer, battleId: string, combatants: Combatant[]): void {
  const state = createBattle(battleId, combatants);
  battleStates.set(battleId, state);
  io.to(battleId).emit("battle:start", state);
}

function maybeTakeBotTurn(io: AppServer, battleId: string): void {
  const state = battleStates.get(battleId);
  if (!state || state.phase !== "in-progress") return;

  const active = state.combatants.find((c) => c.id === state.activeCombatantId);
  if (!active || !isBotCharacter(active.character)) return;

  setTimeout(() => {
    const current = battleStates.get(battleId);
    if (!current || current.phase !== "in-progress" || current.activeCombatantId !== active.id) return;

    const action = chooseBotAction(current, active);
    const nextState = applyAction(current, action);

    if (nextState.phase === "in-progress") {
      battleStates.set(battleId, nextState);
      io.to(battleId).emit("battle:state", nextState);
      maybeTakeBotTurn(io, battleId);
      return;
    }

    void finishBattle(io, battleId, nextState);
  }, BOT_TURN_DELAY_MS);
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

    if (nextState.phase === "in-progress") {
      battleStates.set(battleId, nextState);
      io.to(battleId).emit("battle:state", nextState);
      maybeTakeBotTurn(io, battleId);
      return;
    }

    void finishBattle(io, battleId, nextState);
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
    void finishBattle(io, battleId, forfeited);
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
