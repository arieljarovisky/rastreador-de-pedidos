import { useCallback, useEffect, useRef } from 'react';
import { Alert, AppState, Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../api';
import { compareVersions } from '../utils/compareVersions';

const DISMISSED_VERSION_KEY = 'posta_dismissed_app_version';

export function useAppUpdate() {
  const checking = useRef(false);
  const currentVersion = Constants.expoConfig?.version ?? '0.0.0';

  const check = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    if (checking.current) return;

    checking.current = true;
    try {
      const info = await api.getAppVersion();
      const updateRequired = compareVersions(currentVersion, info.minVersion) < 0;
      const updateAvailable =
        !updateRequired && compareVersions(currentVersion, info.version) < 0;

      if (!updateRequired && !updateAvailable) return;

      if (updateAvailable) {
        const dismissed = await AsyncStorage.getItem(DISMISSED_VERSION_KEY);
        if (dismissed === info.version) return;
      }

      const openUpdate = () => {
        void Linking.openURL(info.downloadUrl);
      };

      const message =
        info.message ??
        (updateRequired
          ? `Tu versión (${currentVersion}) ya no es compatible. Instalá la versión ${info.version} para seguir usando Posta.`
          : `Hay una nueva versión (${info.version}). Te recomendamos instalarla para tener las últimas mejoras.`);

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
            void AsyncStorage.setItem(DISMISSED_VERSION_KEY, info.version);
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
