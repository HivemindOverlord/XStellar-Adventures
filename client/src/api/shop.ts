import type { Character, ShopSellRequestBody, ShopSellResponse, ShopStateResponse } from "@xstellar/shared";

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

export function fetchShop(token: string): Promise<ShopStateResponse> {
  return authedJson<ShopStateResponse>("/api/shop", token);
}

export function buyItem(token: string, itemId: string, quantity: number): Promise<Character> {
  return authedJson<Character>("/api/shop/buy", token, {
    method: "POST",
    body: JSON.stringify({ itemId, quantity }),
  });
}

export function sellItems(token: string, body: ShopSellRequestBody): Promise<ShopSellResponse> {
  return authedJson<ShopSellResponse>("/api/shop/sell", token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
