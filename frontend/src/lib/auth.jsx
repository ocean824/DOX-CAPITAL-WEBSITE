import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "./api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null=checking, false=anon, object=user

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me", { validateStatus: (s) => s < 500 });
      if (data && data.id) {
        setUser(data);
        return data;
      }
      setUser(false);
      return null;
    } catch (err) {
      console.error("[auth] refresh failed:", err);
      setUser(false);
      return null;
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch (err) {
      console.error("[auth] logout failed:", err);
    }
    setUser(false);
  }, []);

  const value = useMemo(
    () => ({ user, setUser, refresh, logout }),
    [user, refresh, logout],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  return useContext(AuthCtx);
}
