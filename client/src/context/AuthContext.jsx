import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from '../services/api';
import { disconnectSocket } from '../services/socket';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

  const logout = useCallback(() => {
    setToken(null);
    disconnectSocket();
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!getToken()) return;
    api
      .get('/auth/me')
      .then((res) => setUser(res.user))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, [logout]);

  // mode is "login" or "register"
  const authenticate = useCallback(async (mode, form) => {
    const res = await api.post(`/auth/${mode}`, form);
    setToken(res.token);
    setUser(res.user);
  }, []);

  const value = useMemo(() => ({ user, loading, authenticate, logout }), [user, loading, authenticate, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
