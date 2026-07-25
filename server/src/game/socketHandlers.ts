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
import { enqueue, removeBySocketId } from "./matchmaking.js";
import { grantBattleRewards } from "./progression.js";

interface SocketData {
  userId: string;
  username: string;
}

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const FORFEIT_GRACE_MS = 45_000;

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

  const match = enqueue({ socketId: socket.id, userId: socket.data.userId, character });
  if (!match) return;

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
    },
    {
      id: playerB.character.id,
      character: playerB.character,
      side: "enemy",
      isDefending: false,
      isDefeated: false,
    },
  ];

  const state = createBattle(match.battleId, combatants);
  battleStates.set(match.battleId, state);

  for (const player of match.players) {
    battleRoomOf.set(player.socketId, match.battleId);
    battleRoomOfUser.set(player.userId, match.battleId);
    io.sockets.sockets.get(player.socketId)?.join(match.battleId);
  }

  io.to(match.battleId).emit("battle:start", state);
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
  const rewards = grantBattleRewards(state);
  const finalState: BattleState = { ...state, rewards };

  await Promise.all(finalState.combatants.map((c) => persistCharacterProgress(c.character)));

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
