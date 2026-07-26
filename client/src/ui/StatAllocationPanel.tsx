import { useState } from "react";
import type { Character } from "@xstellar/shared";
import { allocateStat, type AllocatableStat } from "../api/character.js";

interface StatAllocationPanelProps {
  token: string;
  character: Character;
  onCharacterChange: (character: Character) => void;
}

const ALLOCATABLE_STATS: Array<{ stat: AllocatableStat; label: string; perPoint: number }> = [
  { stat: "maxHp", label: "Max HP", perPoint: 8 },
  { stat: "maxMp", label: "Max MP", perPoint: 3 },
  { stat: "attack", label: "Attack", perPoint: 2 },
  { stat: "defense", label: "Defense", perPoint: 2 },
  { stat: "magic", label: "Magic", perPoint: 2 },
  { stat: "speed", label: "Speed", perPoint: 1 },
];

export function StatAllocationPanel({ token, character, onCharacterChange }: StatAllocationPanelProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleAllocate(stat: AllocatableStat) {
    setError(null);
    setBusy(true);
    try {
      onCharacterChange(await allocateStat(token, stat));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to allocate stat point");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stat-allocation-panel">
      <h3>Stats</h3>
      {error && <p className="auth-error">{error}</p>}

      <p>Unspent points: {character.unallocatedStatPoints}</p>

      <ul className="stat-list">
        {ALLOCATABLE_STATS.map(({ stat, label, perPoint }) => (
          <li key={stat}>
            <span>
              {label}: {character.stats[stat]}
            </span>
            <button disabled={busy || character.unallocatedStatPoints <= 0} onClick={() => handleAllocate(stat)}>
              +{perPoint}
            </button>
          </li>
        ))}
      </ul>

      <p>
        Class: {character.jobClass ?? "Classless"}
        {character.unlockedClasses.length > 0 && ` — Unlocked: ${character.unlockedClasses.join(", ")}`}
      </p>
    </div>
  );
}
