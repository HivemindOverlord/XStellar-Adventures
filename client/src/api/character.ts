import type { Character, EquipmentInstance, EquipmentSlot } from "@xstellar/shared";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "http://localhost:4000";

async function authedJson<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${SERVER_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.error ? JSON.stringify(payload.error) : `Request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export interface CharacterProfile {
  character: Character;
  equipmentInstances: EquipmentInstance[];
}

export function fetchMyCharacter(token: string): Promise<CharacterProfile> {
  return authedJson<CharacterProfile>("/api/character/me", token);
}

export interface CharacterSlotSummary {
  characters: Character[];
  unlockedCharacterSlots: number;
}

export function listCharacters(token: string): Promise<CharacterSlotSummary> {
  return authedJson<CharacterSlotSummary>("/api/character/list", token);
}

export function createCharacter(token: string, name: string): Promise<Character> {
  return authedJson<Character>("/api/character/create", token, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function selectCharacter(token: string, characterId: string): Promise<Character> {
  return authedJson<Character>("/api/character/select", token, {
    method: "POST",
    body: JSON.stringify({ characterId }),
  });
}

export type AllocatableStat = "maxHp" | "maxMp" | "attack" | "defense" | "magic" | "speed";

export function allocateStat(token: string, stat: AllocatableStat): Promise<Character> {
  return authedJson<Character>("/api/character/allocate-stat", token, {
    method: "POST",
    body: JSON.stringify({ stat }),
  });
}

export function equipItem(token: string, instanceId: string): Promise<Character> {
  return authedJson<Character>("/api/character/equip", token, {
    method: "POST",
    body: JSON.stringify({ instanceId }),
  });
}

export function unequipSlot(token: string, slot: EquipmentSlot): Promise<Character> {
  return authedJson<Character>("/api/character/unequip", token, {
    method: "POST",
    body: JSON.stringify({ slot }),
  });
}

export function setBotMatching(token: string, allowBotMatches: boolean): Promise<Character> {
  return authedJson<Character>("/api/character/set-bot-matching", token, {
    method: "POST",
    body: JSON.stringify({ allowBotMatches }),
  });
}
