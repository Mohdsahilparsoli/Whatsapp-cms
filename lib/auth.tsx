"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Role, User } from "@/types";

/**
 * Phase 2: both roles are real, database-backed logins now.
 *   - Super Admin: exactly one account, provisioned via
 *     `npm run create-admin` (terminal only — see scripts/create-admin.ts).
 *     Checked against the `admin_users` table.
 *   - Client Admin: any number of accounts, created from the Clients page
 *     by Super Admin. Checked against the `clients` table.
 * Both are verified server-side (POST /api/auth/login) and backed by an
 * httpOnly session cookie — there is no client-side credential list here
 * anymore.
 */
export type LoginResult = { user: User } | { error: string };

interface AuthContextValue {
  user: User | null;
  ready: boolean;
  login: (userId: string, password: string, remember: boolean) => Promise<LoginResult>;
  logout: () => void;
  /** Updates the in-memory user (e.g. after Settings saves a profile edit)
   * without a full session refetch — the caller already has the server's
   * fresh response. */
  updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // The httpOnly session cookie (admin or client) is the only source of
    // truth — ask the server who, if anyone, is signed in.
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          setUser(data.user ?? null);
          setReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
          setReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(
    async (userId: string, password: string, remember: boolean): Promise<LoginResult> => {
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, password, remember }),
        });
        const data = await res.json();

        if (!res.ok) {
          return { error: data.error ?? "Invalid User ID or password." };
        }

        setUser(data.user);
        return { user: data.user };
      } catch {
        return { error: "Could not reach the server. Please try again." };
      }
    },
    []
  );

  const logout = useCallback(() => {
    setUser(null);
    // Best-effort — clears whichever server-side session (admin or client)
    // cookie is present.
    fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  }, []);

  const updateUser = useCallback((next: User) => {
    setUser(next);
  }, []);

  const value = useMemo(
    () => ({ user, ready, login, logout, updateUser }),
    [user, ready, login, logout, updateUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export function roleLabel(role: Role) {
  return role === "super_admin" ? "Super Admin" : "Client Admin";
}

/**
 * The client a user is scoped to. Super Admins return null — they are not
 * limited to a single client's data.
 */
export function clientIdFor(user: User | null) {
  if (!user || user.role === "super_admin") return null;
  return user.clientId ?? null;
}
