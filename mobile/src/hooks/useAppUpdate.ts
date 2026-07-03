import { useCallback, useEffect, useRef } from 'react';
import { Alert, AppState, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../api';
import { canTrustAppVersion, getCurrentAppVersion, getCurrentBuildVersion } from '../utils/appVersion';
import { compareVersions } from '../utils/compareVersions';

const DISMISSED_VERSION_KEY = 'posta_dismissed_app_version';
const CHECK_COOLDOWN_MS = 60_000;

function isBelowMinVersion(
  currentVersion: string,
  minVersion: string,
  currentBuild: number,
  minBuild?: number
): boolean {
  if (minBuild != null && minBuild > 0 && currentBuild > 0) {
    return currentBuild < minBuild;
  }
  return compareVersions(currentVersion, minVersion) < 0;
}

function isBelowRemoteVersion(
  currentVersion: string,
  remoteVersion: string,
  currentBuild: number,
  remoteBuild?: number
): boolean {
  if (remoteBuild != null && remoteBuild > 0 && currentBuild > 0) {
    return currentBuild < remoteBuild;
  }
  return compareVersions(currentVersion, remoteVersion) < 0;
}

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
      const currentBuild = getCurrentBuildVersion();

      const updateRequired = isBelowMinVersion(
        currentVersion,
        minVersion,
        currentBuild,
        info.minVersionCode
      );
      const updateAvailable =
        !updateRequired &&
        isBelowRemoteVersion(currentVersion, remoteVersion, currentBuild, info.versionCode);

      if (!updateRequired && !updateAvailable) {
        promptedKeyRef.current = null;
        return;
      }

      const promptKey = `${remoteVersion}:${info.versionCode ?? 0}:${updateRequired ? 'required' : 'optional'}`;
      if (promptedKeyRef.current === promptKey) return;

      if (updateAvailable) {
        const dismissed = await AsyncStorage.getItem(DISMISSED_VERSION_KEY);
        if (dismissed === promptKey) return;
      }

      promptedKeyRef.current = promptKey;

      const openUpdate = () => {
        void Linking.openURL(info.downloadUrl);
      };

      const installHint =
        ' Si Android dice "conflicto de paquete", desinstalá Posta desde Configuración → Apps y volvé a instalar.';
      const message =
        (info.message ??
          (updateRequired
            ? `Tu versión (${currentVersion}) ya no es compatible. Instalá la versión ${remoteVersion} para seguir usando Posta.`
            : `Hay una nueva versión (${remoteVersion}). Te recomendamos instalarla para tener las últimas mejoras.`)) +
        installHint;

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
            void AsyncStorage.setItem(DISMISSED_VERSION_KEY, promptKey);
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
