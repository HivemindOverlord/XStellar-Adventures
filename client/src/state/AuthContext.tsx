import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { AuthUser } from "@xstellar/shared";
import { login as loginRequest, register as registerRequest } from "../api/auth.js";

const STORAGE_KEY = "xstellar.auth";

interface StoredAuth {
  token: string;
  user: AuthUser;
}

interface AuthContextValue {
  auth: StoredAuth | null;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredAuth(): StoredAuth | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredAuth;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<StoredAuth | null>(() => readStoredAuth());

  const persist = useCallback((next: StoredAuth) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setAuth(next);
  }, []);

  const login = useCallback(
    async (username: string, password: string) => {
      const response = await loginRequest({ username, password });
      persist(response);
    },
    [persist],
  );

  const register = useCallback(
    async (username: string, password: string) => {
      const response = await registerRequest({ username, password });
      persist(response);
    },
    [persist],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setAuth(null);
  }, []);

  const value = useMemo(() => ({ auth, login, register, logout }), [auth, login, register, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
