import { useState } from "react";

// Independent, short entries so new sections can be appended as other systems land —
// see CLARITY.md. Only document mechanics that actually exist in the codebase today.
interface HowToPlayEntry {
  id: string;
  title: string;
  body: string[];
}

const ENTRIES: HowToPlayEntry[] = [
  {
    id: "battle-actions",
    title: "Battle actions & turn order",
    body: [
      "Each battle, you can Attack, Defend, use a Skill, use an Item, or Flee. Turn order is decided by Speed — the faster combatant acts first, then turns alternate as each side becomes ready again.",
      "Defend reduces the damage you take next turn. Fleeing ends the battle immediately but forfeits most of the rewards you'd otherwise earn.",
    ],
  },
  {
    id: "classes",
    title: "Classes & stat points",
    body: [
      "New characters start classless with no skills. Every time you level up (earned from XP in battle) you get one stat point to spend on Max HP, Max MP, Attack, Defense, Magic, or Speed from the Stats panel.",
      "Crossing certain stat thresholds automatically unlocks a class and its skill — you can unlock more than one class over time, and all their skills stay available at once.",
    ],
  },
  {
    id: "equipment",
    title: "Equipment & loot",
    body: [
      "Weapon, Armor, and Accessory slots can be filled from equipment you own, in the Equipment panel. Some rare gear is locked to a specific class you must unlock first.",
      "Winning battles has a chance to drop equipment. The longer a slot goes without a drop, the better your odds get for that slot next time — so dry spells self-correct.",
    ],
  },
  {
    id: "shop",
    title: "Shop & Driftmetal",
    body: [
      "Driftmetal is the currency you earn from battles. The Shop sells general consumables plus a daily-rotating equipment selection, and lets you sell items and gear back for Driftmetal.",
      "Items you buy today can usually be sold back for a full refund the same day; older stock and loot drops sell for a smaller cut instead.",
    ],
  },
  {
    id: "campaign",
    title: "Story campaign",
    body: [
      "The Campaign panel lists story chapters you can play solo against a boss. Chapters unlock in order as you clear the one before them, and a few milestone chapters grant an extra character slot on first clear.",
    ],
  },
  {
    id: "matchmaking",
    title: "Matchmaking & training bots",
    body: [
      "Find Match queues you for PvP, matched against opponents of similar power (level and stats combined) — the pool of acceptable opponents widens the longer you wait.",
      "If no human opponent turns up quickly and you've left the training-bot option on, you'll be matched with a synthetic bot instead. Bot matches are always clearly labeled in the battle so you're never left guessing whether it was a real player.",
    ],
  },
];

export function HowToPlayPanel() {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="how-to-play-panel">
      <h3>How to Play</h3>
      <p className="how-to-play-intro">
        A quick reference, not a tutorial — open whatever you're curious about.
      </p>
      <ul className="how-to-play-list">
        {ENTRIES.map((entry) => {
          const isOpen = openId === entry.id;
          return (
            <li key={entry.id} className="how-to-play-entry">
              <button
                type="button"
                className="how-to-play-entry-toggle"
                aria-expanded={isOpen}
                onClick={() => setOpenId(isOpen ? null : entry.id)}
              >
                {entry.title}
                <span aria-hidden="true">{isOpen ? "−" : "+"}</span>
              </button>
              {isOpen && (
                <div className="how-to-play-entry-body">
                  {entry.body.map((paragraph, i) => (
                    <p key={i}>{paragraph}</p>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
