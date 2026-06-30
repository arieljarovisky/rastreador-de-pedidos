import { useCallback, useEffect, useState } from 'react';
import { AppState, AppStateStatus, Linking } from 'react-native';
import * as Location from 'expo-location';

export type MandatoryLocationStatus = 'checking' | 'granted' | 'denied';

interface MandatoryLocationState {
  status: MandatoryLocationStatus;
  canAskAgain: boolean;
  retry: () => Promise<void>;
  openSettings: () => void;
}

async function evaluateRepartidorLocationAccess(): Promise<{
  granted: boolean;
  canAskAgain: boolean;
}> {
  let fg = await Location.getForegroundPermissionsAsync();
  if (fg.status !== 'granted') {
    fg = await Location.requestForegroundPermissionsAsync();
  }
  if (fg.status !== 'granted') {
    return { granted: false, canAskAgain: fg.canAskAgain !== false };
  }

  let bg = await Location.getBackgroundPermissionsAsync();
  if (bg.status !== 'granted') {
    bg = await Location.requestBackgroundPermissionsAsync();
  }
  if (bg.status !== 'granted') {
    return { granted: false, canAskAgain: bg.canAskAgain !== false };
  }

  return { granted: true, canAskAgain: true };
}

/** Exige ubicación en primer plano y segundo plano para usar la app de repartidor. */
export function useMandatoryLocation(): MandatoryLocationState {
  const [status, setStatus] = useState<MandatoryLocationStatus>('checking');
  const [canAskAgain, setCanAskAgain] = useState(true);

  const retry = useCallback(async () => {
    setStatus('checking');
    try {
      const result = await evaluateRepartidorLocationAccess();
      setCanAskAgain(result.canAskAgain);
      setStatus(result.granted ? 'granted' : 'denied');
    } catch {
      setCanAskAgain(false);
      setStatus('denied');
    }
  }, []);

  useEffect(() => {
    void retry();
  }, [retry]);

  useEffect(() => {
    const handleAppState = (state: AppStateStatus) => {
      if (state === 'active') {
        void retry();
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, [retry]);

  const openSettings = useCallback(() => {
    void Linking.openSettings();
  }, []);

  return { status, canAskAgain, retry, openSettings };
}
