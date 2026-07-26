import type { BattleAction, BattleReward, BattleState, Character } from "@xstellar/shared";
import { EQUIPMENT, ITEMS, SKILLS, xpToNextLevel } from "@xstellar/shared";

interface ActionExtra {
  skillId?: string;
  itemId?: string;
}

interface BattleUIProps {
  state: BattleState;
  isMyTurn: boolean;
  myCharacter: Character;
  reward?: BattleReward;
  onAction: (type: BattleAction["type"], extra?: ActionExtra) => void;
}

export function BattleUI({ state, isMyTurn, myCharacter, reward, onAction }: BattleUIProps) {
  const canAct = isMyTurn && state.phase === "in-progress";
  const knownSkills = myCharacter.skillIds.map((id) => SKILLS[id]).filter((skill) => skill !== undefined);
  const carriedItems = Object.entries(myCharacter.inventory)
    .filter(([, count]) => count > 0)
    .map(([id, count]) => ({ item: ITEMS[id], count }))
    .filter((entry): entry is { item: NonNullable<typeof entry.item>; count: number } => entry.item !== undefined);

  return (
    <div className="battle-ui">
      <div className="battle-status">
        Turn {state.turn} — {describePhase(state.phase)}
      </div>

      <div className="battle-level">
        Lv {myCharacter.level} · {myCharacter.xp}/{xpToNextLevel(myCharacter.level)} XP
      </div>

      <div className="battle-actions">
        <button disabled={!canAct} onClick={() => onAction("attack")}>
          Attack
        </button>
        <button disabled={!canAct} onClick={() => onAction("defend")}>
          Defend
        </button>
        {knownSkills.map((skill) => (
          <button
            key={skill.id}
            disabled={!canAct || myCharacter.stats.mp < skill.mpCost}
            onClick={() => onAction("skill", { skillId: skill.id })}
          >
            {skill.name} ({skill.mpCost} MP)
          </button>
        ))}
        {carriedItems.map(({ item, count }) => (
          <button key={item.id} disabled={!canAct} onClick={() => onAction("item", { itemId: item.id })}>
            {item.name} ×{count}
          </button>
        ))}
        <button disabled={!canAct} onClick={() => onAction("flee")}>
          Flee
        </button>
      </div>

      {reward && (
        <div className="battle-reward">
          <div>
            +{reward.xpGained} XP{reward.leveledUp ? ` — Level up! Now level ${reward.newLevel}` : ""}
          </div>
          {reward.currencyGained > 0 && <div>You found {reward.currencyGained} Driftmetal</div>}
          {reward.itemsDropped.length > 0 && (
            <div>
              You found: {reward.itemsDropped.map((id) => EQUIPMENT[id]?.name ?? id).join(", ")}
            </div>
          )}
        </div>
      )}

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
