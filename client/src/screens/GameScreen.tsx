import { useEffect, useMemo, useRef, useState } from "react";
import type { BattleAction, BattleState } from "@xstellar/shared";
import { useAuth } from "../state/AuthContext.js";
import { createGameSocket, type GameSocket } from "../net/socket.js";
import { eventBus } from "../game/EventBus.js";
import { PhaserGame } from "../game/PhaserGame.js";
import { BattleUI } from "../ui/BattleUI.js";

type Status = "idle" | "queued" | "in-battle" | "ended";

export function GameScreen() {
  const { auth, logout } = useAuth();
  const socketRef = useRef<GameSocket | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [battleState, setBattleState] = useState<BattleState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) return;
    const socket = createGameSocket(auth.token);
    socketRef.current = socket;

    socket.on("queue:joined", () => setStatus("queued"));
    socket.on("battle:start", (state) => {
      setBattleState(state);
      eventBus.emit("battle-state", state);
      setStatus("in-battle");
    });
    socket.on("battle:state", (state) => {
      setBattleState(state);
      eventBus.emit("battle-state", state);
    });
    socket.on("battle:end", (state) => {
      setBattleState(state);
      eventBus.emit("battle-state", state);
      setStatus("ended");
    });
    socket.on("error", (message) => setError(message));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [auth]);

  const myCombatant = useMemo(
    () => battleState?.combatants.find((c) => c.character.ownerId === auth?.user.id) ?? null,
    [battleState, auth],
  );
  const opponent = useMemo(
    () => battleState?.combatants.find((c) => c.character.ownerId !== auth?.user.id) ?? null,
    [battleState, auth],
  );

  if (!auth) return null;

  function findMatch() {
    setError(null);
    socketRef.current?.emit("queue:join");
  }

  function handleAction(type: BattleAction["type"]) {
    if (!myCombatant) return;
    const action: BattleAction = {
      type,
      actorId: myCombatant.id,
      targetId: type === "attack" ? opponent?.id : undefined,
    };
    socketRef.current?.emit("battle:action", action);
  }

  return (
    <div className="game-screen">
      <header className="game-header">
        <span>Welcome, {auth.user.username}</span>
        <button onClick={logout}>Log out</button>
      </header>

      {error && <p className="auth-error">{error}</p>}

      {status === "idle" && (
        <div className="find-match">
          <button onClick={findMatch}>Find Match</button>
        </div>
      )}

      {status === "queued" && <p>Searching for an opponent…</p>}

      {(status === "in-battle" || status === "ended") && battleState && myCombatant && (
        <div className="battle-view">
          <PhaserGame myUserId={auth.user.id} />
          <BattleUI state={battleState} isMyTurn={battleState.activeCombatantId === myCombatant.id} onAction={handleAction} />
          {status === "ended" && <button onClick={() => setStatus("idle")}>Back to Lobby</button>}
        </div>
      )}
    </div>
  );
}
