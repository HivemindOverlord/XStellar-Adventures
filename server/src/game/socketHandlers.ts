import type { Server, Socket } from "socket.io";
import type {
  BattleState,
  ClientToServerEvents,
  Combatant,
  ServerToClientEvents,
} from "@xstellar/shared";
import { verifyToken } from "../auth/jwt.js";
import { getOrCreateStarterCharacter } from "./starterCharacter.js";
import { applyAction, createBattle, IllegalActionError } from "./battleEngine.js";
import { enqueue, removeBySocketId } from "./matchmaking.js";

interface SocketData {
  userId: string;
  username: string;
}

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const battleRoomOf = new Map<string, string>();
const battleStates = new Map<string, BattleState>();

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
    socket.on("queue:join", () => void handleQueueJoin(io, socket));
    socket.on("queue:leave", () => removeBySocketId(socket.id));
    socket.on("battle:action", (action) => handleBattleAction(io, socket, action));
    socket.on("disconnect", () => removeBySocketId(socket.id));
  });
}

async function handleQueueJoin(io: AppServer, socket: AppSocket): Promise<void> {
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
    battleStates.set(battleId, nextState);

    if (nextState.phase === "in-progress") {
      io.to(battleId).emit("battle:state", nextState);
    } else {
      io.to(battleId).emit("battle:end", nextState);
      battleStates.delete(battleId);
      for (const [socketId, roomId] of battleRoomOf) {
        if (roomId === battleId) battleRoomOf.delete(socketId);
      }
    }
  } catch (err) {
    const message = err instanceof IllegalActionError ? err.message : "Unexpected battle error";
    socket.emit("error", message);
  }
}
