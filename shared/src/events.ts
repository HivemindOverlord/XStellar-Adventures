import type { BattleAction, BattleState } from "./battle.js";

export interface ServerToClientEvents {
  "queue:joined": () => void;
  "battle:start": (state: BattleState) => void;
  "battle:state": (state: BattleState) => void;
  "battle:end": (state: BattleState) => void;
  "error": (message: string) => void;
}

export interface ClientToServerEvents {
  "queue:join": () => void;
  "queue:leave": () => void;
  "battle:action": (action: BattleAction) => void;
  "campaign:start": (chapterId: string) => void;
}

export interface SocketAuth {
  token: string;
}
