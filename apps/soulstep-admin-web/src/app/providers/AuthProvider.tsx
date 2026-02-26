import { createContext, useCallback, useEffect, useState } from "react";
import { getMe, login as apiLogin, logoutUser, refreshToken } from "@/lib/api/admin";
import { clearToken, setToken } from "@/lib/api/client";
import type { User } from "@/lib/api/types";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount, silently refresh the access token using the long-lived refresh_token
  // cookie (30-day httpOnly), then fetch the current user with the new Bearer token.
  // This survives page reloads without requiring the user to log in again.
  // The access_token cookie alone is not reliable across page loads because it has a
  // 15-minute TTL and samesite=strict blocks it on cross-domain prod deployments.
  useEffect(() => {
    refreshToken()
      .then((data) => {
        setToken(data.token);
        return getMe();
      })
      .then((u) => setUser(u))
      .catch(() => clearToken())
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiLogin({ email, password });
    // Token stored in memory only (setToken writes to _inMemoryToken, not localStorage)
    setToken(data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    // Revoke the refresh_token cookie server-side so silent refresh can't
    // restore the session after logout.
    logoutUser().catch(() => {});
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: user !== null,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
