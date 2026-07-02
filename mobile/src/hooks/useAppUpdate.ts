import { useCallback, useEffect, useRef } from 'react';
import { Alert, AppState, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../api';
import { canTrustAppVersion, getCurrentAppVersion } from '../utils/appVersion';
import { compareVersions } from '../utils/compareVersions';

const DISMISSED_VERSION_KEY = 'posta_dismissed_app_version';
const CHECK_COOLDOWN_MS = 60_000;

export function useAppUpdate() {
  const checking = useRef(false);
  const lastCheckAt = useRef(0);
  const promptedKeyRef = useRef<string | null>(null);
  const currentVersion = getCurrentAppVersion();

  const check = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    if (checking.current) return;
    if (!canTrustAppVersion(currentVersion)) return;

    const now = Date.now();
    if (now - lastCheckAt.current < CHECK_COOLDOWN_MS) return;

    checking.current = true;
    lastCheckAt.current = now;

    try {
      const info = await api.getAppVersion();
      const remoteVersion = info.version.trim();
      const minVersion = info.minVersion.trim();

      const updateRequired = compareVersions(currentVersion, minVersion) < 0;
      const updateAvailable =
        !updateRequired && compareVersions(currentVersion, remoteVersion) < 0;

      if (!updateRequired && !updateAvailable) {
        promptedKeyRef.current = null;
        return;
      }

      const promptKey = `${remoteVersion}:${updateRequired ? 'required' : 'optional'}`;
      if (promptedKeyRef.current === promptKey) return;

      if (updateAvailable) {
        const dismissed = await AsyncStorage.getItem(DISMISSED_VERSION_KEY);
        if (dismissed === remoteVersion) return;
      }

      promptedKeyRef.current = promptKey;

      const openUpdate = () => {
        void Linking.openURL(info.downloadUrl);
      };

      const message =
        info.message ??
        (updateRequired
          ? `Tu versión (${currentVersion}) ya no es compatible. Instalá la versión ${remoteVersion} para seguir usando Posta.`
          : `Hay una nueva versión (${remoteVersion}). Te recomendamos instalarla para tener las últimas mejoras.`);

      if (updateRequired) {
        Alert.alert(
          'Actualización requerida',
          message,
          [{ text: 'Actualizar', onPress: openUpdate }],
          { cancelable: false }
        );
        return;
      }

      Alert.alert('Nueva versión disponible', message, [
        {
          text: 'Más tarde',
          style: 'cancel',
          onPress: () => {
            void AsyncStorage.setItem(DISMISSED_VERSION_KEY, remoteVersion);
          },
        },
        { text: 'Actualizar', onPress: openUpdate },
      ]);
    } catch {
      // Sin conexión o endpoint no disponible: no bloquear el uso de la app.
    } finally {
      checking.current = false;
    }
  }, [currentVersion]);

  useEffect(() => {
    void check();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });

    return () => subscription.remove();
  }, [check]);
}
