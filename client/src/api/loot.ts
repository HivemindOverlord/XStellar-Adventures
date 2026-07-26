import type { LootOddsResponse } from "@xstellar/shared";

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

export function fetchLootOdds(token: string, opponentLevel?: number): Promise<LootOddsResponse> {
  const query = opponentLevel !== undefined ? `?opponentLevel=${opponentLevel}` : "";
  return authedJson<LootOddsResponse>(`/api/loot/odds${query}`, token);
}
