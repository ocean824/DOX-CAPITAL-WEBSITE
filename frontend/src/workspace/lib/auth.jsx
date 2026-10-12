import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, siteLogout } from './api';

const WorkspaceAuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await api.get('/auth/me');
        if (alive) setUser(r.data);
      } catch (e) {
        if (alive) setDenied(e.response?.status === 403 ? (e.response.data?.detail || 'Workspace access is not enabled for this account') : '');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    const expired = () => setUser(null);
    window.addEventListener('session-expired', expired);
    return () => { alive = false; window.removeEventListener('session-expired', expired); };
  }, []);

  const logout = useCallback(async () => {
    try { await siteLogout(); } finally { window.location.href = '/'; }
  }, []);

  return <WorkspaceAuthContext.Provider value={{ user, setUser, loading, denied, logout }}>{children}</WorkspaceAuthContext.Provider>;
}

export const useAuth = () => useContext(WorkspaceAuthContext);
