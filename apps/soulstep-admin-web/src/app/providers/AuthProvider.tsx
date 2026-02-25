import { createContext, useCallback, useEffect, useState } from "react";
import { getMe, login as apiLogin } from "@/lib/api/admin";
import { clearToken, getToken, setToken } from "@/lib/api/client";
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

  // On mount, try to restore session via the httpOnly access_token cookie.
  // No token is ever read from localStorage; withCredentials on the axios client
  // sends the cookie automatically.
  useEffect(() => {
    getMe()
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
