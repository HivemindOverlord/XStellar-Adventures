import type { BattleAction, BattleState } from "@xstellar/shared";

interface BattleUIProps {
  state: BattleState;
  isMyTurn: boolean;
  onAction: (action: BattleAction["type"]) => void;
}

export function BattleUI({ state, isMyTurn, onAction }: BattleUIProps) {
  const canAct = isMyTurn && state.phase === "in-progress";

  return (
    <div className="battle-ui">
      <div className="battle-status">
        Turn {state.turn} — {describePhase(state.phase)}
      </div>

      <div className="battle-actions">
        <button disabled={!canAct} onClick={() => onAction("attack")}>
          Attack
        </button>
        <button disabled={!canAct} onClick={() => onAction("defend")}>
          Defend
        </button>
        <button disabled={!canAct} onClick={() => onAction("flee")}>
          Flee
        </button>
      </div>

      <ul className="battle-log">
        {state.log
          .slice(-6)
          .reverse()
          .map((entry, i) => (
            <li key={i}>{entry.result}</li>
          ))}
      </ul>
    </div>
  );
}

function describePhase(phase: BattleState["phase"]): string {
  switch (phase) {
    case "in-progress":
      return "Battle in progress";
    case "victory":
      return "Victory!";
    case "defeat":
      return "Defeat...";
    case "fled":
      return "You fled the battle";
    case "waiting-for-players":
      return "Waiting for players";
  }
}
