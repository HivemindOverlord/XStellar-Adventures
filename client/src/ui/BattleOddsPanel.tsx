import { useEffect, useState } from "react";
import type { Character, LootOddsResponse, LootOddsResponseEntry, Rarity } from "@xstellar/shared";
import { WIN_STREAK_CAP } from "@xstellar/shared";
import { fetchLootOdds } from "../api/loot.js";

interface BattleOddsPanelProps {
  token: string;
  character: Character;
}

const CATEGORY_LABEL: Record<LootOddsResponseEntry["category"], string> = {
  weapon: "Weapon",
  armor: "Armor",
  accessory: "Accessory",
  consumable: "Consumable",
};

const GOOD_TIERS: Rarity[] = ["blue", "purple", "orange", "red"];

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function blueOrAboveChance(entry: LootOddsResponseEntry): number {
  return GOOD_TIERS.reduce((sum, tier) => sum + entry.tierProbabilities[tier], 0);
}

export function BattleOddsPanel({ token, character }: BattleOddsPanelProps) {
  const [odds, setOdds] = useState<LootOddsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refetch whenever the character reference changes (e.g. after a battle updates
  // dry-streak/win-streak counters) so the panel never shows stale odds.
  useEffect(() => {
    fetchLootOdds(token)
      .then(setOdds)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load loot odds"));
  }, [token, character]);

  return (
    <div className="battle-odds-panel">
      <h3>Battle Odds</h3>
      {error && <p className="auth-error">{error}</p>}
      {!odds && !error && <p>Loading current odds…</p>}

      {odds && (
        <>
          <p>
            Assuming an opponent around level {odds.opponentLevel}
            {odds.opponentLevelIsAssumed ? " (no specific opponent yet)" : ""} — tougher opponents shift odds toward
            rarer tiers too.
          </p>

          <ul className="battle-odds-list">
            {odds.categories.map((entry) => (
              <li key={entry.category}>
                <strong>{CATEGORY_LABEL[entry.category]}:</strong>{" "}
                {entry.available ? (
                  <>
                    {pct(blueOrAboveChance(entry))} chance of Blue+ this fight (rises the longer you go without one
                    — you're currently {entry.factors?.dryStreakFights ?? 0} fight
                    {entry.factors?.dryStreakFights === 1 ? "" : "s"} into your streak). Overall drop chance:{" "}
                    {pct(entry.dropChance)}.
                    <div className="battle-odds-breakdown">
                      {(Object.entries(entry.tierProbabilities) as [Rarity, number][])
                        .filter(([, probability]) => probability > 0)
                        .map(([tier, probability]) => (
                          <span key={tier} className={`odds-tier odds-tier-${tier}`}>
                            {tier}: {pct(probability)}
                          </span>
                        ))}
                    </div>
                  </>
                ) : (
                  entry.note
                )}
              </li>
            ))}
          </ul>

          <p>
            Win streak: {character.currentWinStreak} fight{character.currentWinStreak === 1 ? "" : "s"} in a row
            {character.currentWinStreak > 0
              ? ` adds a small bonus to rarity odds in every category (caps out at a ${WIN_STREAK_CAP}-fight streak).`
              : ` — win a fight to start building a streak bonus to rarity odds (caps out at ${WIN_STREAK_CAP} fights).`}
          </p>
        </>
      )}
    </div>
  );
}
