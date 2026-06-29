import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../api';
import { clearQueue } from '../location/locationQueue';
import { stopBackgroundLocation } from '../location/backgroundLocationTask';
import { User, UserRole } from '../types';

const TOKEN_KEY = 'lupo_token';
const USER_KEY = 'lupo_user';

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Restaurar sesión guardada al iniciar
  useEffect(() => {
    (async () => {
      try {
        const [savedToken, savedUser] = await Promise.all([
          AsyncStorage.getItem(TOKEN_KEY),
          AsyncStorage.getItem(USER_KEY),
        ]);
        if (savedToken && savedUser) {
          setToken(savedToken);
          setUser(JSON.parse(savedUser) as User);
          // Validar el token contra el backend en segundo plano
          api
            .me(savedToken)
            .then((fresh) => {
              setUser(fresh);
              AsyncStorage.setItem(USER_KEY, JSON.stringify(fresh));
            })
            .catch(() => {
              // Token inválido/expirado -> cerrar sesión
              setToken(null);
              setUser(null);
              AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
            });
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    setError(null);
    setLoading(true);
    try {
      const data = await api.login(username, password);
      if (data.user.role !== UserRole.REPARTIDOR) {
        throw new Error('Esta app es solo para repartidores.');
      }
      await AsyncStorage.multiSet([
        [TOKEN_KEY, data.token],
        [USER_KEY, JSON.stringify(data.user)],
      ]);
      setToken(data.token);
      setUser(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión.');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await stopBackgroundLocation();
    await clearQueue();
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
    setToken(null);
    setUser(null);
    setError(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, token, loading, error, login, logout }),
    [user, token, loading, error, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
