import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { userService } from '../services';
import { API, apiFetch } from '../config/api';
import type { UserProfile } from '../types/user';

const STORAGE_KEY = 'user_profile';

function readFromStorage(): UserProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as UserProfile) : null;
  } catch {
    return null;
  }
}

function writeToStorage(user: UserProfile | null): void {
  if (user) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

interface AuthContextValue {
  user: UserProfile | null;
  isLoading: boolean;
  setUser: (user: UserProfile | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<UserProfile | null>(readFromStorage);
  const [isLoading, setIsLoading] = useState(true);

  const setUser = useCallback((u: UserProfile | null) => {
    setUserState(u);
    writeToStorage(u);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch(API.auth.logout(), { method: 'POST' });
    } catch {
      // Даже при ошибке запроса — очищаем локальное состояние
    }
    setUser(null);
  }, [setUser]);

  // Слушаем 401 от любого apiFetch-запроса — разлогиниваем
  useEffect(() => {
    const handle = () => setUser(null);
    window.addEventListener('auth:unauthorized', handle);
    return () => window.removeEventListener('auth:unauthorized', handle);
  }, [setUser]);

  useEffect(() => {
    userService.getMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, [setUser]);

  return (
    <AuthContext.Provider value={{ user, isLoading, setUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
