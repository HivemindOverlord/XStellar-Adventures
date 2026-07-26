import { useEffect, useState } from "react";
import type { Character } from "@xstellar/shared";
import { createCharacter, listCharacters, selectCharacter } from "../api/character.js";

interface CharacterSelectScreenProps {
  token: string;
  onSelected: (character: Character) => void;
}

export function CharacterSelectScreen({ token, onSelected }: CharacterSelectScreenProps) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [unlockedCharacterSlots, setUnlockedCharacterSlots] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listCharacters(token)
      .then((summary) => {
        setCharacters(summary.characters);
        setUnlockedCharacterSlots(summary.unlockedCharacterSlots);
        setLoaded(true);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load characters"));
  }, [token]);

  async function handleSelect(characterId: string) {
    setError(null);
    setBusy(true);
    try {
      onSelected(await selectCharacter(token, characterId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to select character");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    setBusy(true);
    try {
      onSelected(await createCharacter(token, name));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create character");
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) {
    return <p>Loading characters…</p>;
  }

  const canCreate = characters.length < unlockedCharacterSlots;

  return (
    <div className="character-select">
      <h2>Your Characters</h2>
      {error && <p className="auth-error">{error}</p>}

      <ul className="character-list">
        {characters.map((character) => (
          <li key={character.id}>
            <div>
              <strong>{character.name}</strong> — Lv {character.level} ·{" "}
              {character.jobClass ?? "Classless"}
              {character.unlockedClasses.length > 0 && (
                <span> (unlocked: {character.unlockedClasses.join(", ")})</span>
              )}
            </div>
            <button disabled={busy} onClick={() => handleSelect(character.id)}>
              Play
            </button>
          </li>
        ))}
      </ul>

      <p>
        {characters.length}/{unlockedCharacterSlots} character slots used
      </p>

      {canCreate ? (
        <div className="character-create">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New character name"
            maxLength={40}
          />
          <button disabled={busy || !newName.trim()} onClick={handleCreate}>
            Create Character
          </button>
        </div>
      ) : (
        <p>No character slots available. Clear more of the campaign to unlock another slot.</p>
      )}
    </div>
  );
}
