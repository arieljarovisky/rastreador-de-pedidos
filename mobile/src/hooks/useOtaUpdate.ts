import { useCallback, useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Updates from 'expo-updates';

const CHECK_COOLDOWN_MS = 30_000;

/**
 * Descarga y aplica updates OTA (EAS Update) en builds de release.
 * No corre en desarrollo (__DEV__).
 */
export function useOtaUpdate() {
  const checking = useRef(false);
  const lastCheckAt = useRef(0);

  const checkAndApply = useCallback(async () => {
    if (__DEV__) return;
    if (!Updates.isEnabled) return;
    if (checking.current) return;

    const now = Date.now();
    if (now - lastCheckAt.current < CHECK_COOLDOWN_MS) return;

    checking.current = true;
    lastCheckAt.current = now;
    try {
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) return;

      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    } catch {
      // Sin red o servidor: se reintenta en el próximo foreground.
    } finally {
      checking.current = false;
    }
  }, []);

  useEffect(() => {
    void checkAndApply();

    const onChange = (state: AppStateStatus) => {
      if (state === 'active') void checkAndApply();
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [checkAndApply]);
}
