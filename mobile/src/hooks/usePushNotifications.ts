import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { api } from '../api';
import { AppNotification } from '../types';

let notificationHandlerReady = false;

function ensureNotificationHandler(): void {
  if (notificationHandlerReady) return;
  notificationHandlerReady = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => {
      // En primer plano el socket ya dispara alerta local; el push no debe duplicar.
      const inForeground = AppState.currentState === 'active';
      return {
        shouldShowAlert: !inForeground,
        shouldPlaySound: !inForeground,
        shouldSetBadge: true,
        shouldShowBanner: !inForeground,
        shouldShowList: !inForeground,
      };
    },
  });
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('posta-alerts', {
    name: 'Alertas Posta',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    sound: 'default',
  });
}

function isNotificationsGranted(
  settings: Notifications.NotificationPermissionsStatus
): boolean {
  const withGranted = settings as Notifications.NotificationPermissionsStatus & {
    granted?: boolean;
  };
  if (withGranted.granted) return true;
  if (settings.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED) return true;
  if (settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return true;
  return Platform.OS === 'android';
}

async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) {
    return null;
  }

  try {
    ensureNotificationHandler();
    await ensureAndroidChannel();

  const permissions = await Notifications.getPermissionsAsync();
  let granted = isNotificationsGranted(permissions);
  if (!granted) {
    const requested = await Notifications.requestPermissionsAsync();
    granted = isNotificationsGranted(requested);
  }
  if (!granted) {
    return null;
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;

  if (!projectId) {
    console.warn('[push] Sin projectId de EAS; no se puede obtener token Expo.');
    return null;
  }

  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
  return tokenData.data;
  } catch (err) {
    console.warn('[push] No se pudo registrar notificaciones:', err);
    return null;
  }
}

interface UsePushNotificationsOptions {
  token: string | null;
  onForegroundNotification?: (notification: AppNotification) => void;
}

export function usePushNotifications({
  token,
  onForegroundNotification,
}: UsePushNotificationsOptions): void {
  const pushTokenRef = useRef<string | null>(null);
  const onForegroundRef = useRef(onForegroundNotification);
  onForegroundRef.current = onForegroundNotification;

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    (async () => {
      const expoPushToken = await registerForPushNotificationsAsync();
      if (!expoPushToken || cancelled) return;
      pushTokenRef.current = expoPushToken;
      try {
        await api.registerPushToken(token, expoPushToken, Platform.OS);
      } catch (err) {
        console.warn('[push] No se pudo registrar el token:', err);
      }
    })();

    const receivedSub = Notifications.addNotificationReceivedListener((event) => {
      const content = event.request.content;
      const data = (content.data ?? {}) as Record<string, string>;
      if (!data.notificationId) return;
      onForegroundRef.current?.({
        id: data.notificationId,
        userId: '',
        title: content.title ?? 'Posta',
        body: content.body ?? '',
        createdAt: new Date().toISOString(),
        read: false,
        type: (data.type as AppNotification['type']) ?? 'info',
        orderId: data.orderId,
      });
    });

    return () => {
      cancelled = true;
      receivedSub.remove();
      const expoPushToken = pushTokenRef.current;
      if (expoPushToken) {
        void api.unregisterPushToken(token, expoPushToken).catch(() => undefined);
      }
    };
  }, [token]);
}

/** Muestra una notificación local inmediata (p. ej. desde socket en primer plano). */
const recentLocalNotificationIds = new Set<string>();

export async function showLocalNotification(
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  const id = data?.notificationId;
  if (id) {
    if (recentLocalNotificationIds.has(id)) return;
    recentLocalNotificationIds.add(id);
    setTimeout(() => recentLocalNotificationIds.delete(id), 60_000);
  }

  await ensureAndroidChannel();
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: 'default',
    },
    trigger: null,
  });
}
