# UI clarity convention

XStellar Adventures deliberately has no forced tutorial or walkthrough wizard — the bet is
that the UI itself should make the game legible. That only works if every screen carries its
own weight. Two rules, for any agent building a new screen or panel:

## 1. Handle your own empty/zero/first-time state

If a list, panel, or section can legitimately render with nothing in it — a new character
with no equipment, no skills, an empty inventory, a shop tab with nothing to sell, a queue
with no matches yet — show a one- or two-sentence inline explanation of *why* it's empty and,
where relevant, what the player can do about it. Never leave a blank area, and never leave a
disabled button with no visible reason it's disabled.

Bad: an empty `<ul>` that just renders nothing.
Good: `<li>No equipment owned yet</li>` (already the pattern in `EquipmentPanel.tsx`) or
`<p className="battle-empty-note">No skills yet — earn stat points from battles and spend
them in the Stats panel to unlock a class.</p>` (see `BattleUI.tsx`).

A player looking at your screen should never have to wonder "is this a bug, or is there just
nothing here yet."

## 2. Surface non-obvious mechanics inline, not in a separate lookup

If a system has a rule a player couldn't reasonably guess from the UI alone — pity odds on
loot drops, a stat threshold that unlocks a class, a same-day refund window, a bracket that
widens the longer you wait in queue — say so briefly, next to the relevant control. Don't rely
on the player finding it in a wiki, a tooltip they have to hunt for, or the How to Play
reference screen alone. The How to Play screen (`client/src/ui/HowToPlayPanel.tsx`) is a
supplementary reference for players who want the full picture, not a substitute for in-context
copy — treat inline copy as the primary explanation and the How to Play screen as backup, not
the other way around.

## Adding a new How to Play section

`HowToPlayPanel.tsx` is a flat list of independent `{ id, title, body }` entries — append a
new entry for your system once it exists in the codebase, rather than editing the others.
Keep each entry to a couple of short paragraphs of plain language; it's a quick reference, not
documentation. Don't add a section for a mechanic that isn't actually live yet.

## What this is not

This is not a scripted tutorial, onboarding wizard, or forced first-battle walkthrough — none
of that should get built here or elsewhere in the client. The goal is a UI that doesn't need
one.
