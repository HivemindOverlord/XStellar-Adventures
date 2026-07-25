import type { AuthResponse, LoginPayload, RegisterPayload } from "@xstellar/shared";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "http://localhost:4000";

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${SERVER_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.error ? JSON.stringify(payload.error) : `Request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export function register(payload: RegisterPayload): Promise<AuthResponse> {
  return postJson<AuthResponse>("/api/auth/register", payload);
}

export function login(payload: LoginPayload): Promise<AuthResponse> {
  return postJson<AuthResponse>("/api/auth/login", payload);
}
