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
