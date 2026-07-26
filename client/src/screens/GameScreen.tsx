import { useEffect, useMemo, useRef, useState } from "react";
import type { BattleAction, BattleState, Character, EquipmentInstance } from "@xstellar/shared";
import { useAuth } from "../state/AuthContext.js";
import { createGameSocket, type GameSocket } from "../net/socket.js";
import { eventBus } from "../game/EventBus.js";
import { PhaserGame } from "../game/PhaserGame.js";
import { BattleUI } from "../ui/BattleUI.js";
import { EquipmentPanel } from "../ui/EquipmentPanel.js";
import { ShopPanel } from "../ui/ShopPanel.js";
import { StatAllocationPanel } from "../ui/StatAllocationPanel.js";
import { CampaignPanel } from "../ui/CampaignPanel.js";
import { fetchMyCharacter, setBotMatchPreference } from "../api/character.js";

type Status = "idle" | "queued" | "in-battle" | "ended";

interface GameScreenProps {
  onChangeCharacter: () => void;
}

export function GameScreen({ onChangeCharacter }: GameScreenProps) {
  const { auth, logout } = useAuth();
  const socketRef = useRef<GameSocket | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [battleState, setBattleState] = useState<BattleState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [character, setCharacter] = useState<Character | null>(null);
  const [equipmentInstances, setEquipmentInstances] = useState<EquipmentInstance[]>([]);
  const [showEquipment, setShowEquipment] = useState(false);
  const [showShop, setShowShop] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showCampaign, setShowCampaign] = useState(false);

  useEffect(() => {
    if (!auth || status !== "idle") return;
    fetchMyCharacter(auth.token)
      .then((profile) => {
        setCharacter(profile.character);
        setEquipmentInstances(profile.equipmentInstances);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load character"));
  }, [auth, status]);

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

  function toggleBotMatches(allow: boolean) {
    if (!character || !auth) return;
    setCharacter({ ...character, allowBotMatches: allow });
    setBotMatchPreference(auth.token, allow).catch((err) =>
      setError(err instanceof Error ? err.message : "Failed to update preference"),
    );
  }

  function startChapter(chapterId: string) {
    setError(null);
    setShowCampaign(false);
    socketRef.current?.emit("campaign:start", chapterId);
  }

  function handleAction(type: BattleAction["type"], extra?: { skillId?: string; itemId?: string }) {
    if (!myCombatant) return;
    const targetsEnemy = type === "attack" || type === "skill" || type === "item";
    const action: BattleAction = {
      type,
      actorId: myCombatant.id,
      targetId: targetsEnemy ? opponent?.id : undefined,
      skillId: extra?.skillId,
      itemId: extra?.itemId,
    };
    socketRef.current?.emit("battle:action", action);
  }

  return (
    <div className="game-screen">
      <header className="game-header">
        <span>Welcome, {auth.user.username}</span>
        <span>{character?.currency ?? 0} Driftmetal</span>
        {status === "idle" && <button onClick={onChangeCharacter}>Change Character</button>}
        <button onClick={logout}>Log out</button>
      </header>

      {error && <p className="auth-error">{error}</p>}

      {status === "idle" && (
        <div className="find-match">
          <button onClick={findMatch}>Find Match</button>
          <button onClick={() => setShowCampaign((v) => !v)}>{showCampaign ? "Hide Campaign" : "Campaign"}</button>
          <button onClick={() => setShowEquipment((v) => !v)}>
            {showEquipment ? "Hide Equipment" : "View Equipment"}
          </button>
          <button onClick={() => setShowShop((v) => !v)}>{showShop ? "Hide Shop" : "Shop"}</button>
          <button onClick={() => setShowStats((v) => !v)}>{showStats ? "Hide Stats" : "Stats"}</button>
          {character && (
            <label className="bot-opt-out">
              <input
                type="checkbox"
                checked={character.allowBotMatches}
                onChange={(e) => toggleBotMatches(e.target.checked)}
              />
              Match with a training bot if no opponent is found
            </label>
          )}
        </div>
      )}

      {status === "idle" && showCampaign && character && (
        <CampaignPanel character={character} onStartChapter={startChapter} />
      )}

      {status === "idle" && showStats && character && (
        <StatAllocationPanel token={auth.token} character={character} onCharacterChange={setCharacter} />
      )}

      {status === "idle" && showEquipment && character && (
        <EquipmentPanel
          token={auth.token}
          character={character}
          equipmentInstances={equipmentInstances}
          onCharacterChange={setCharacter}
        />
      )}

      {status === "idle" && showShop && character && (
        <ShopPanel token={auth.token} character={character} onCharacterChange={setCharacter} />
      )}

      {status === "queued" && <p>Searching for an opponent…</p>}

      {(status === "in-battle" || status === "ended") && battleState && myCombatant && (
        <div className="battle-view">
          <PhaserGame myUserId={auth.user.id} />
          {battleState.isBotMatch && (
            <p className="bot-match-notice">No opponent found — matched with a training bot</p>
          )}
          <BattleUI
            state={battleState}
            isMyTurn={battleState.activeCombatantId === myCombatant.id}
            myCharacter={myCombatant.character}
            reward={battleState.rewards?.[myCombatant.id]}
            onAction={handleAction}
          />
          {status === "ended" && <button onClick={() => setStatus("idle")}>Back to Lobby</button>}
        </div>
      )}
    </div>
  );
}
