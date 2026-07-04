import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import { api } from '../api';
import { clearQueue } from '../location/locationQueue';
import { stopBackgroundLocation } from '../location/backgroundLocationTask';
import { User, MOBILE_APP_ROLES, SellerMonthlyOrders } from '../types';

WebBrowser.maybeCompleteAuthSession();

const TOKEN_KEY = 'lupo_token';
const USER_KEY = 'lupo_user';
const ML_AUTH_REDIRECT = 'lupo://auth/mercadolibre';

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  loginWithMercadoLibre: () => Promise<void>;
  registerSeller: (data: {
    username: string;
    password: string;
    name: string;
    city?: string;
    province?: string;
    monthlyOrders: SellerMonthlyOrders;
    sellerCategories: string[];
  }) => Promise<void>;
  completeSellerProfile: (data: {
    monthlyOrders: SellerMonthlyOrders;
    sellerCategories: string[];
  }) => Promise<void>;
  refreshUser: () => Promise<void>;
  updatePreferredAgency: (agencyId: string | null) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

function parseMercadoLibreAuthResult(resultUrl: string): { token?: string; error?: string } {
  const queryStart = resultUrl.indexOf('?');
  const query = queryStart >= 0 ? resultUrl.slice(queryStart + 1) : '';
  const params = new URLSearchParams(query);
  const mlLogin = params.get('ml_login');
  if (mlLogin === 'success') {
    return { token: params.get('token') ?? undefined };
  }
  if (mlLogin === 'error') {
    return { error: params.get('message') ?? 'No se pudo iniciar sesión con Mercado Libre.' };
  }
  return { error: 'Respuesta de autorización inválida.' };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const persistSession = useCallback(async (data: { token: string; user: User }) => {
    await AsyncStorage.multiSet([
      [TOKEN_KEY, data.token],
      [USER_KEY, JSON.stringify(data.user)],
    ]);
    setToken(data.token);
    setUser(data.user);
  }, []);

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
          api
            .me(savedToken)
            .then((fresh) => {
              if (!MOBILE_APP_ROLES.includes(fresh.role)) {
                setToken(null);
                setUser(null);
                AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
                return;
              }
              setUser(fresh);
              AsyncStorage.setItem(USER_KEY, JSON.stringify(fresh));
            })
            .catch(() => {
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
      if (!MOBILE_APP_ROLES.includes(data.user.role)) {
        throw new Error(
          'Tu cuenta no tiene acceso a la app móvil. Contactá a soporte de Posta.'
        );
      }
      await persistSession(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión.');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [persistSession]);

  const loginWithMercadoLibre = useCallback(async () => {
    setError(null);
    const { url } = await api.getMercadoLibreLoginUrl();
    const result = await WebBrowser.openAuthSessionAsync(url, ML_AUTH_REDIRECT);
    if (result.type !== 'success' || !result.url) {
      throw new Error('Autorización cancelada.');
    }
    const parsed = parseMercadoLibreAuthResult(result.url);
    if (parsed.error || !parsed.token) {
      throw new Error(parsed.error || 'No se pudo completar el inicio de sesión.');
    }
    const fresh = await api.me(parsed.token);
    if (fresh.role !== 'store_admin') {
      throw new Error('El inicio con Mercado Libre está disponible solo para vendedores.');
    }
    await persistSession({ token: parsed.token, user: fresh });
  }, [persistSession]);

  const registerSeller = useCallback(
    async (data: {
      username: string;
      password: string;
      name: string;
      city?: string;
      province?: string;
      monthlyOrders: SellerMonthlyOrders;
      sellerCategories: string[];
    }) => {
      setError(null);
      setLoading(true);
      try {
        const result = await api.registerSeller(data);
        if (result.user.role !== 'store_admin') {
          throw new Error('Solo vendedores pueden registrarse desde la app.');
        }
        await persistSession(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo crear la cuenta.');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [persistSession]
  );

  const completeSellerProfile = useCallback(
    async (data: { monthlyOrders: SellerMonthlyOrders; sellerCategories: string[] }) => {
      if (!token) throw new Error('Sin sesión');
      const updated = await api.updateSellerProfile(token, data);
      setUser(updated);
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(updated));
    },
    [token]
  );

  const refreshUser = useCallback(async () => {
    if (!token) return;
    const fresh = await api.me(token);
    setUser(fresh);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(fresh));
  }, [token]);

  const updatePreferredAgency = useCallback(
    async (agencyId: string | null) => {
      if (!token) throw new Error('Sin sesión');
      const result = await api.updateSellerPreferredAgency(token, agencyId);
      setUser((prev) => {
        if (!prev) return prev;
        const next = {
          ...prev,
          preferredAgencyId: result.preferredAgencyId ?? null,
          preferredAgencyName: result.preferredAgencyName ?? null,
        };
        AsyncStorage.setItem(USER_KEY, JSON.stringify(next));
        return next;
      });
    },
    [token]
  );

  const logout = useCallback(async () => {
    await stopBackgroundLocation();
    await clearQueue();
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
    setToken(null);
    setUser(null);
    setError(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      token,
      loading,
      error,
      login,
      loginWithMercadoLibre,
      registerSeller,
      completeSellerProfile,
      refreshUser,
      updatePreferredAgency,
      logout,
    }),
    [
      user,
      token,
      loading,
      error,
      login,
      loginWithMercadoLibre,
      registerSeller,
      completeSellerProfile,
      refreshUser,
      updatePreferredAgency,
      logout,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}

function sellerNeedsOnboarding(user: User): boolean {
  return Boolean(
    user.needsOnboarding ||
      (user.role === 'store_admin' &&
        user.isMarketplaceSeller &&
        (!user.monthlyOrders || !user.sellerCategories?.length))
  );
}

export { sellerNeedsOnboarding };
